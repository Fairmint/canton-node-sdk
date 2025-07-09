import fs from 'fs';
import path from 'path';
import { LedgerJsonApiClient } from '../../src/clients/ledger-json-api/LedgerJsonApiClient';
import { FileLogger } from '../../src/core/logging';
import { EnvLoader } from '../../src/core';

/** Manages simulation execution, result storage, and file handling for API testing */
export default class SimulationRunner {
  private resultsDir: string;
  private writtenFiles: Set<string>;
  private client: LedgerJsonApiClient;

  constructor() {
    this.resultsDir = path.join(__dirname, '..', 'results');
    this.writtenFiles = new Set();
    this.ensureResultsDir();

    // Create client instance with file logger
    this.client = new LedgerJsonApiClient({
      ...EnvLoader.getConfig('LEDGER_JSON_API'),
      logger: new FileLogger(),
    });
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

  private sanitizeData(data: unknown): unknown {
    if (typeof data === 'object' && data !== null) {
      if (Array.isArray(data)) {
        return data.map(item => this.sanitizeData(item));
      } else {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(data)) {
          if (key === 'traceId' && typeof value === 'string') {
            result[key] = 'PLACEHOLDER_TRACE_ID';
          } else if (key === 'stack' && typeof value === 'string') {
            result[key] = 'PLACEHOLDER_STACK_TRACE';
          } else if (key === 'tid' && typeof value === 'string') {
            result[key] = 'PLACEHOLDER_TID';
          } else {
            result[key] = this.sanitizeData(value);
          }
        }
        return result;
      }
    }
    return data;
  }

  async runSimulation<T, R = T>(
    simulationName: string,
    simulationFn: (client: LedgerJsonApiClient) => Promise<T>,
    expectedSchema: import('zod').ZodSchema<R>
  ): Promise<T | { error: string; details: unknown }> {
    try {
      // Run simulation
      const data = await simulationFn(this.client);

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

      // Replace traceId and stack with placeholders before writing
      const sanitizedData = this.sanitizeData(data);
      fs.writeFileSync(filepath, JSON.stringify(sanitizedData, null, 2));
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

      // Validate error against expected schema if provided
      if (expectedSchema) {
        try {
          expectedSchema.parse(errorDetails);
          console.log(`✅ Error response validated against schema.`);
        } catch (schemaError) {
          console.log(`❌ Error response failed schema validation`);
          console.error(schemaError);
          throw new Error(
            `Error response validation failed: ${schemaError instanceof Error ? schemaError.message : String(schemaError)}`
          );
        }
      }

      // Save error to file
      const filename = this.generateFilename(simulationName);

      // Check for duplicate files before writing (even for errors)
      this.checkForDuplicateFile(filename);

      const filepath = path.join(this.resultsDir, filename);

      // Replace traceId and stack with placeholders before writing
      const sanitizedErrorDetails = this.sanitizeData(errorDetails);
      fs.writeFileSync(
        filepath,
        JSON.stringify(sanitizedErrorDetails, null, 2)
      );
      this.writtenFiles.add(filename);

      console.log(`⚠️  Simulation "${simulationName}" failed (expected)`);
      console.log(`📁 Error details saved to: ${filepath}`);

      return errorDetails;
    }
  }
}
