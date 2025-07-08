import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LedgerJsonApiClient } from '../src/clients/ledger-json-api/LedgerJsonApiClient';
import { ProviderConfig } from '../src/clients/base';
import { validateResponse } from '../src/utils/validators';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SimulationRunner {
  private resultsDir: string;

  constructor() {
    this.resultsDir = path.join(__dirname, 'results');
    this.ensureResultsDir();
  }

  private ensureResultsDir(): void {
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  private sanitizeFilename(filename: string): string {
    // Remove or replace characters that are invalid in filenames
    return filename
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 200); // Limit length
  }

  private generateFilename(simulationName: string, params: string[]): string {
    const sanitizedName = this.sanitizeFilename(simulationName);
    const sanitizedParams = params.map(p => this.sanitizeFilename(p));
    const paramsString = sanitizedParams.join('_');

    // Truncate if too long
    const maxLength = 100;
    const truncatedParams =
      paramsString.length > maxLength
        ? paramsString.substring(0, maxLength) + '_truncated'
        : paramsString;

    return `${sanitizedName}_${truncatedParams}.json`;
  }

  async runSimulation<T>(
    simulationName: string,
    simulationFn: (client: LedgerJsonApiClient) => Promise<T>,
    params: string[] = [],
    expectedType?: keyof typeof import('../src/utils/validators').validators
  ): Promise<T> {
    // Create client instance
    const config = new ProviderConfig();
    const client = new LedgerJsonApiClient(config);

    // Run simulation
    const data = await simulationFn(client);

    // Validate response type if specified
    if (expectedType) {
      if (!validateResponse(data, expectedType)) {
        throw new Error(`Response validation failed for type: ${expectedType}`);
      }
      console.log(`✅ Response validated against type: ${expectedType}`);
    }

    // Save result to file
    const filename = this.generateFilename(simulationName, params);
    const filepath = path.join(this.resultsDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));

    console.log(`✅ Simulation "${simulationName}" completed`);
    console.log(`📁 Result saved to: ${filepath}`);

    return data;
  }
}

// Export a convenience function for running simulations
export async function simulate<T>(
  simulationFn: (client: LedgerJsonApiClient) => Promise<T>,
  simulationName: string,
  params: string[] = [],
  expectedType?: keyof typeof import('../src/utils/validators').validators
): Promise<T> {
  const runner = new SimulationRunner();
  return runner.runSimulation(
    simulationName,
    simulationFn,
    params,
    expectedType
  );
}
