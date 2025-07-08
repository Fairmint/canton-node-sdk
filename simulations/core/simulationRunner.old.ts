import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LedgerJsonApiClient } from '../../src/clients/ledger-json-api/LedgerJsonApiClient';
import { ProviderConfig } from '../../src/clients/base';
import { validateResponse } from '../../src/utils/validators';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class simulationRunner {
  private resultsDir: string;
  private writtenFiles: Set<string>;

  constructor() {
    this.resultsDir = path.join(__dirname, '..', 'results');
    this.writtenFiles = new Set();
    this.ensureResultsDir();
  }

  private ensureResultsDir(): void {
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  public clearResultsDir(): void {
    if (fs.existsSync(this.resultsDir)) {
      fs.rmSync(this.resultsDir, { recursive: true, force: true });
    }
    this.ensureResultsDir();
    this.writtenFiles.clear();
    console.log('🧹 Cleared results directory');
  }

  private sanitizeFilename(filename: string): string {
    // Remove or replace characters that are invalid in filenames
    return filename
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 200); // Limit length
  }

  private generateFilename(simulationName: string): string {
    const sanitizedName = this.sanitizeFilename(simulationName);
    return `${sanitizedName}.json`;
  }

  async runSimulation<T>(
    simulationName: string,
    simulationFn: (client: LedgerJsonApiClient) => Promise<T>,
    expectedType?: keyof typeof import('../../src/utils/validators').validators
  ): Promise<T | { error: string; details: unknown }> {
    // Create client instance
    const config = new ProviderConfig();
    const client = new LedgerJsonApiClient(config);

    try {
      // Run simulation
      const data = await simulationFn(client);

      // Validate response type if specified
      if (expectedType) {
        if (!validateResponse(data, expectedType)) {
          throw new Error(
            `Response validation failed for type: ${expectedType}`
          );
        }
        console.log(`✅ Response validated against type: ${expectedType}`);
      }

      // Save result to file
      const filename = this.generateFilename(simulationName);
      const filepath = path.join(this.resultsDir, filename);

      // Check for duplicate filenames
      if (this.writtenFiles.has(filename)) {
        throw new Error(
          `Duplicate filename detected: ${filename}. This indicates a copy-paste error or naming conflict.`
        );
      }

      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      this.writtenFiles.add(filename);

      console.log(`✅ Simulation "${simulationName}" completed`);
      console.log(`📁 Result saved to: ${filepath}`);

      return data;
    } catch (error) {
      // Handle expected errors
      const errorDetails =
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
              ...(error as unknown as Record<string, unknown>),
            }
          : error;

      // Save error to file
      const filename = this.generateFilename(simulationName);
      const filepath = path.join(this.resultsDir, filename);

      // Check for duplicate filenames even for errors
      if (this.writtenFiles.has(filename)) {
        throw new Error(
          `Duplicate filename detected: ${filename}. This indicates a copy-paste error or naming conflict.`
        );
      }

      fs.writeFileSync(filepath, JSON.stringify(errorDetails, null, 2));
      this.writtenFiles.add(filename);

      console.log(`⚠️  Simulation "${simulationName}" failed (expected)`);
      console.log(`📁 Error details saved to: ${filepath}`);

      return errorDetails;
    }
  }
}
