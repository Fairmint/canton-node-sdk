import { z } from 'zod';
import { ValidationError } from '../../core/errors';
import { type RequestConfig } from '../../core/types';
import { type ScanApiClientBase } from './ScanApiClientBase';

/** Abstract base class for Scan API operations with parameter validation */
export abstract class ScanApiOperation<Params, Response> {
  constructor(public client: ScanApiClientBase) {}

  abstract execute(params: Params): Promise<Response>;

  protected validateParams<T>(params: T, schema: z.ZodSchema<T>): T {
    try {
      return schema.parse(params);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(
          `Parameter validation failed: ${error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
        );
      }
      throw error;
    }
  }

  protected async makeGetRequest<T>(path: string, config: RequestConfig = {}): Promise<T> {
    return this.client.makeGetRequest<T>(path, config);
  }

  protected async makePostRequest<T>(path: string, data: unknown, config: RequestConfig = {}): Promise<T> {
    return this.client.makePostRequest<T>(path, data, config);
  }

  protected getApiUrl(): string {
    return this.client.getApiUrl();
  }
}
