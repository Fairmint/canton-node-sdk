import fs from 'fs';
import path from 'path';
import { EnvLoader } from '../../src/core';
import { FileLogger } from '../../src/core/logging';

/** Abstract base class for simulation runners with shared functionality */
export abstract class BaseSimulationRunner<TClient, TConfig> {
  protected resultsDir: string;
  protected writtenFiles: Set<string>;
  protected client: TClient;

  constructor(configKey: string, clientFactory: (config: TConfig) => TClient) {
    this.resultsDir = path.join(__dirname, '..', 'results');
    this.writtenFiles = new Set();
    this.ensureResultsDir();

    // Create client instance with file logger
    const config = {
      ...EnvLoader.getConfig(configKey),
      logger: new FileLogger(),
    } as TConfig;
    this.client = clientFactory(config);
  }

  protected ensureResultsDir(): void {
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
    return filename
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 200);
  }

  private generateFilename(simulationName: string): string {
    const sanitizedName = this.sanitizeFilename(simulationName);
    return `${sanitizedName}.json`;
  }

  private checkForDuplicateFile(filename: string): void {
    const filepath = path.join(this.resultsDir, filename);
    if (fs.existsSync(filepath)) {
      throw new Error(`File already exists: ${filename}. This indicates a duplicate simulation or naming conflict.`);
    }
    if (this.writtenFiles.has(filename)) {
      throw new Error(
        `Duplicate filename detected: ${filename}. This indicates a copy-paste error or naming conflict.`
      );
    }
  }

  private sanitizeData(data: unknown): unknown {
    if (typeof data === 'object' && data !== null) {
      if (Array.isArray(data)) {
        return data.map((item) => this.sanitizeData(item));
      }
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
    return data;
  }

  private static getCallerSimulationPath(): string | undefined {
    const { stack } = new Error();
    if (!stack) return undefined;
    const lines = stack.split('\n');
    for (let i = 3; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const match = line.match(/\((.*):\d+:\d+\)$/) || line.match(/at (.*):\d+:\d+$/);
      if (match?.[1]) {
        const fullPath = match[1];
        if (typeof fullPath === 'string') {
          const idx = fullPath.lastIndexOf('simulations/');
          if (idx !== -1) {
            const relativePath = fullPath.slice(idx + 'simulations/'.length);
            return relativePath.replace(/\.ts$/, '');
          }
        }
      }
    }
    return undefined;
  }

  async runSimulation<T>(
    simulationName: string,
    simulationFn: (client: TClient) => Promise<T>,
    simulationFilePath?: string
  ): Promise<T | { error: string; details: unknown }> {
    if (!simulationFilePath) {
      simulationFilePath = BaseSimulationRunner.getCallerSimulationPath();
    }
    try {
      const data = await simulationFn(this.client);
      let resultDir = this.resultsDir;
      if (simulationFilePath) {
        const relPath = simulationFilePath.replace(/\\/g, '/').replace(/\.ts$/, '');
        resultDir = path.join(this.resultsDir, relPath);
        fs.mkdirSync(resultDir, { recursive: true });
      }
      const filename = this.generateFilename(simulationName);
      this.checkForDuplicateFile(path.join(simulationFilePath || '', filename));
      const filepath = path.join(resultDir, filename);
      const sanitizedData = this.sanitizeData(data);
      fs.writeFileSync(filepath, JSON.stringify(sanitizedData, null, 2));
      this.writtenFiles.add(path.join(simulationFilePath || '', filename));
      console.log(`✅ Simulation "${simulationName}" completed`);
      console.log(`📁 Result saved to: ${filepath}`);
      return data;
    } catch (error) {
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
      let resultDir = this.resultsDir;
      if (simulationFilePath) {
        const relPath = simulationFilePath.replace(/\\/g, '/').replace(/\.ts$/, '');
        resultDir = path.join(this.resultsDir, relPath);
        fs.mkdirSync(resultDir, { recursive: true });
      }
      const filename = this.generateFilename(simulationName);
      this.checkForDuplicateFile(path.join(simulationFilePath || '', filename));
      const filepath = path.join(resultDir, filename);
      const sanitizedErrorDetails = this.sanitizeData(errorDetails);
      fs.writeFileSync(filepath, JSON.stringify(sanitizedErrorDetails, null, 2));
      this.writtenFiles.add(path.join(simulationFilePath || '', filename));
      console.log(`⚠️  Simulation "${simulationName}" failed (expected)`);
      console.log(`📁 Error details saved to: ${filepath}`);
      return errorDetails;
    }
  }
}
