import { z } from 'zod';
import { type BaseClient, type SimpleBaseClient } from '../BaseClient';
import { ValidationError } from '../errors';
import { type RequestConfig } from '../types';

/** Abstract base class for API operations with parameter validation and request handling */
export abstract class ApiOperation<Params, Response> {
  constructor(public client: BaseClient) {}

  abstract execute(params: Params): Promise<Response>;

  public validateParams<T>(params: T, schema: z.ZodSchema<T>): T {
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

  public async makeGetRequest<T>(url: string, config: RequestConfig = {}): Promise<T> {
    return this.client.makeGetRequest<T>(url, config);
  }

  public async makePostRequest<T>(url: string, data: unknown, config: RequestConfig = {}): Promise<T> {
    return this.client.makePostRequest<T>(url, data, config);
  }

  public async makeDeleteRequest<T>(url: string, config: RequestConfig = {}): Promise<T> {
    return this.client.makeDeleteRequest<T>(url, config);
  }

  public async makePatchRequest<T>(url: string, data: unknown, config: RequestConfig = {}): Promise<T> {
    return this.client.makePatchRequest<T>(url, data, config);
  }

  public getManagedParties(): string[] {
    return this.client.getManagedParties();
  }

  public getPartyId(): string | undefined {
    return this.client.getPartyId();
  }

  public getApiUrl(): string {
    return this.client.getApiUrl();
  }

  public buildPartyList(additionalParties: string[] = []): string[] {
    return this.client.buildPartyList(additionalParties);
  }
}

/** Abstract base class for simple API operations that don't require authentication */
export abstract class SimpleApiOperation<Params, Response> {
  constructor(public client: SimpleBaseClient) {}

  abstract execute(params: Params): Promise<Response>;

  public validateParams<T>(params: T, schema: z.ZodSchema<T>): T {
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

  public async makeGetRequest<T>(url: string, config: { contentType?: string } = {}): Promise<T> {
    return this.client.makeGetRequest<T>(url, config);
  }

  public async makePostRequest<T>(url: string, data: unknown, config: { contentType?: string } = {}): Promise<T> {
    return this.client.makePostRequest<T>(url, data, config);
  }

  public async makeDeleteRequest<T>(url: string, config: { contentType?: string } = {}): Promise<T> {
    return this.client.makeDeleteRequest<T>(url, config);
  }

  public async makePatchRequest<T>(url: string, data: unknown, config: { contentType?: string } = {}): Promise<T> {
    return this.client.makePatchRequest<T>(url, data, config);
  }

  public getPartyId(): string {
    return this.client.getPartyId();
  }

  public getApiUrl(): string {
    return this.client.getApiUrl();
  }
}
