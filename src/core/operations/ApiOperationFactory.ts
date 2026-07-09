import { z } from 'zod';
import { type BaseClient } from '../BaseClient';
import { type RequestConfig } from '../types';
import { ApiOperation } from './ApiOperation';

/**
 * Exact Zod object shape for a generated request type.
 *
 * Used by {@link createRequestSchema} to make every generated request property—including optional properties—explicit in
 * the runtime schema and reject keys that are not part of the generated contract.
 */
type ZodPropertyFor<Value, Schema extends z.ZodType> = [z.output<Schema>] extends [Value]
  ? [Value] extends [z.input<Schema>]
    ? Schema
    : never
  : never;

export type ZodObjectShapeFor<T extends object, Shape extends z.ZodRawShape> = {
  readonly [Key in keyof T]-?: Key extends keyof Shape
    ? Shape[Key] extends z.ZodType
      ? ZodPropertyFor<T[Key], Shape[Key]>
      : never
    : never;
};

export type RequestSchemaBuilder<T extends object> = <Shape extends z.ZodRawShape>(
  shape: Shape & ZodObjectShapeFor<T, Shape> & Record<Exclude<keyof Shape, keyof T>, never>
) => z.ZodType<T>;

/**
 * Creates an exact runtime schema for a generated JSON request object.
 *
 * The shape must include every generated key (including optional keys), cannot add keys, and must decode each property
 * to the generated property type. Undefined top-level properties are removed so the result honors
 * `exactOptionalPropertyTypes` and mirrors JSON serialization.
 */
export function createRequestSchema<T extends object>(): RequestSchemaBuilder<T> {
  const createSchema: RequestSchemaBuilder<T> = (shape) =>
    z.strictObject(shape).transform((value): T => {
      const definedEntries = Object.entries(value).filter(
        (entry): entry is [string, unknown] => entry[1] !== undefined
      );
      return Object.fromEntries(definedEntries) as T;
    });

  return createSchema;
}

/**
 * Builds the request body from validated params. Return `undefined` for endpoints that don't send a body. Only called
 * for POST and PATCH methods.
 */
export type RequestDataBuilder<Params> = (
  params: Params,
  client: BaseClient
) =>
  | Record<string, unknown>
  | Buffer
  | string
  | undefined
  | Promise<Record<string, unknown> | Buffer | string | undefined>;

/** Configuration for a factory-created API operation. */
export interface ApiOperationConfig<Params, Response> {
  /** Zod schema used to validate params before the request. */
  readonly paramsSchema: z.ZodSchema<Params>;
  /** HTTP method. */
  readonly method: 'GET' | 'POST' | 'DELETE' | 'PATCH';
  /** Builds the full request URL from validated params and the client's base API URL. */
  readonly buildUrl: (params: Params, apiUrl: string, client: BaseClient) => string;
  /** Builds the request body. Only called for POST and PATCH. */
  readonly buildRequestData?: RequestDataBuilder<Params>;
  /** Override default request configuration (content type, auth). */
  readonly requestConfig?: RequestConfig;
  /** Transform the raw API response before returning it. */
  readonly transformResponse?: (response: Response) => Response;
}

/**
 * Creates an {@link ApiOperation} class from a declarative configuration object.
 *
 * Prefer this over extending `ApiOperation` directly for simple REST endpoints that don't need async pre-processing.
 *
 * @example
 *   export const GetVersion = createApiOperation<void, VersionResponse>({
 *     paramsSchema: z.void(),
 *     method: 'GET',
 *     buildUrl: (_params, apiUrl) => `${apiUrl}/v2/version`,
 *   });
 */
export function createApiOperation<Params, Response>(
  config: ApiOperationConfig<Params, Response>
): new (client: BaseClient) => ApiOperation<Params, Response> {
  return class extends ApiOperation<Params, Response> {
    async execute(params: Params): Promise<Response> {
      // Validate parameters
      const validatedParams = this.validateParams(params, config.paramsSchema);

      const url = config.buildUrl(validatedParams, this.getApiUrl(), this.client);
      const requestConfig: RequestConfig = config.requestConfig ?? {
        contentType: 'application/json',
        includeBearerToken: true,
      };

      let response: Response;

      if (config.method === 'GET') {
        response = await this.makeGetRequest<Response>(url, requestConfig);
      } else if (config.method === 'DELETE') {
        response = await this.makeDeleteRequest<Response>(url, requestConfig);
      } else {
        const data = await config.buildRequestData?.(validatedParams, this.client);
        if (config.method === 'POST') {
          response = await this.makePostRequest<Response>(url, data, requestConfig);
        } else {
          // config.method === 'PATCH'
          response = await this.makePatchRequest<Response>(url, data, requestConfig);
        }
      }

      // Transform response if needed
      if (config.transformResponse) {
        return config.transformResponse(response);
      }

      return response;
    }
  };
}
