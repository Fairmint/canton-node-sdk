import fs from 'fs';
import path from 'path';
import { LedgerJsonApiClient } from '../../src/clients/ledger-json-api/LedgerJsonApiClient';

export default class SimulationRunner {
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

  private checkForDuplicateFile(filename: string): void {
    const filepath = path.join(this.resultsDir, filename);

    // Check if file already exists on disk
    if (fs.existsSync(filepath)) {
      throw new Error(
        `File already exists: ${filename}. This indicates a duplicate simulation or naming conflict.`
      );
    }

    // Check if file was already written in this session
    if (this.writtenFiles.has(filename)) {
      throw new Error(
        `Duplicate filename detected: ${filename}. This indicates a copy-paste error or naming conflict.`
      );
    }
  }

  async runSimulation<T>(
    simulationName: string,
    simulationFn: (client: LedgerJsonApiClient) => Promise<T>,
    expectedSchema?: import('zod').ZodSchema<T>
  ): Promise<T | { error: string; details: unknown }> {
    // Create client instance using the new architecture
    const client = new LedgerJsonApiClient();

    try {
      // Run simulation
      const data = await simulationFn(client);

      // Validate response type if specified
      if (expectedSchema) {
        expectedSchema.parse(data);
        console.log(`✅ Response validated against schema.`);
      }

      // Save result to file
      const filename = this.generateFilename(simulationName);

      // Check for duplicate files before writing
      this.checkForDuplicateFile(filename);

      const filepath = path.join(this.resultsDir, filename);

      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      this.writtenFiles.add(filename);

      console.log(`✅ Simulation "${simulationName}" completed`);
      console.log(`📁 Result saved to: ${filepath}`);

      return data;
    } catch (error) {
      // Handle expected errors
      const errorDetails: { error: string; details: unknown } = {
        error: error instanceof Error ? error.message : String(error),
        details:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
                ...(error as unknown as Record<string, unknown>),
              }
            : error,
      };

      // Save error to file
      const filename = this.generateFilename(simulationName);

      // Check for duplicate files before writing (even for errors)
      this.checkForDuplicateFile(filename);

      const filepath = path.join(this.resultsDir, filename);

      fs.writeFileSync(filepath, JSON.stringify(errorDetails, null, 2));
      this.writtenFiles.add(filename);

      console.log(`⚠️  Simulation "${simulationName}" failed (expected)`);
      console.log(`📁 Error details saved to: ${filepath}`);

      return errorDetails;
    }
  }
}
