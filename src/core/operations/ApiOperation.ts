import { z } from 'zod';
import { type BaseClient } from '../BaseClient';
import { type PartyId } from '../branded-types';
import { ValidationError } from '../errors';
import { type HttpReadRequestOptions, type HttpRequestOptions } from '../http/request-retry';
import { type RequestConfig } from '../types';
import { type OperationExecuteOptions } from './operation-execute-options';

/** Abstract base class for API operations with parameter validation and request handling. */
export abstract class ApiOperation<Params, Response> {
  constructor(public readonly client: BaseClient) {}

  abstract execute(params: Params, options?: OperationExecuteOptions<Params>): Promise<Response>;

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

  public async makeGetRequest<T>(
    url: string,
    config: RequestConfig = {},
    options?: HttpReadRequestOptions<undefined>
  ): Promise<T> {
    return options === undefined
      ? this.client.makeGetRequest<T>(url, config)
      : this.client.makeGetRequest<T>(url, config, options);
  }

  public async makePostRequest<T, Body = unknown>(
    url: string,
    data: Body,
    config: RequestConfig = {},
    options?: HttpRequestOptions<Body>
  ): Promise<T> {
    return options === undefined
      ? this.client.makePostRequest<T, Body>(url, data, config)
      : this.client.makePostRequest<T, Body>(url, data, config, options);
  }

  public async makeDeleteRequest<T>(
    url: string,
    config: RequestConfig = {},
    options?: HttpRequestOptions<undefined>
  ): Promise<T> {
    return options === undefined
      ? this.client.makeDeleteRequest<T>(url, config)
      : this.client.makeDeleteRequest<T>(url, config, options);
  }

  public async makePatchRequest<T, Body = unknown>(
    url: string,
    data: Body,
    config: RequestConfig = {},
    options?: HttpRequestOptions<Body>
  ): Promise<T> {
    return options === undefined
      ? this.client.makePatchRequest<T, Body>(url, data, config)
      : this.client.makePatchRequest<T, Body>(url, data, config, options);
  }

  public getManagedParties(): readonly string[] {
    return this.client.getManagedParties();
  }

  public getPartyId(): PartyId {
    return this.client.getPartyId();
  }

  public getApiUrl(): string {
    return this.client.getApiUrl();
  }

  public buildPartyList(additionalParties: readonly string[] = []): string[] {
    return this.client.buildPartyList(additionalParties);
  }
}
