import { z } from 'zod';
import { type BaseClient } from '../BaseClient';
import { ConfigurationError } from '../errors';
import { awaitWithAbort } from '../http/abort';
import { type HttpRequestOptionsForSemantics, type RequestSemantics } from '../http/request-retry';
import { type RequestConfig } from '../types';
import { ApiOperation } from './ApiOperation';
import { type OperationExecuteOptions, snapshotOperationExecuteOptions } from './operation-execute-options';
import { createOperationHttpRequestOptions } from './operation-request-options';

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

/** HTTP request body supported by factory-created operations. */
export type OperationRequestData = Record<string, unknown> | Buffer | string | undefined;

interface ApiOperationConfigBase<Params, Response> {
  /** Zod schema used to validate params before the request. */
  readonly paramsSchema: z.ZodSchema<Params>;
  /** Builds the full request URL from validated params and the client's base API URL. */
  readonly buildUrl: (params: Params, apiUrl: string, client: BaseClient) => string;
  /** Builds the request body. Only called for POST and PATCH. */
  readonly buildRequestData?: RequestDataBuilder<Params>;
  /** Override default request configuration (content type, auth). */
  readonly requestConfig?: RequestConfig;
  /** Transform the raw API response before returning it. */
  readonly transformResponse?: (response: Response) => Response;
}

/** Configuration for a factory-created API operation. GET is read-only by construction. */
export type ApiOperationConfig<Params, Response> = ApiOperationConfigBase<Params, Response> &
  (
    | {
        readonly method: 'GET';
        readonly requestSemantics?: 'read';
      }
    | {
        readonly method: 'POST';
        /**
         * Explicitly classify POST as a semantic read or mutation. Required for read-only POST endpoints that may be
         * safely retried or rotated across equivalent Scan nodes.
         */
        readonly requestSemantics?: RequestSemantics;
      }
    | {
        /** DELETE and PATCH are mutation-only by construction. */
        readonly method: 'DELETE' | 'PATCH';
        readonly requestSemantics?: 'mutation';
      }
  );

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
    async execute(params: Params, options?: OperationExecuteOptions<Params>): Promise<Response> {
      const operationOptions = snapshotOperationExecuteOptions(options);
      const effectiveOperationOptions: OperationExecuteOptions<Params> = operationOptions ?? Object.freeze({});

      // Validate parameters
      const currentParams = this.validateParams(params, config.paramsSchema);

      const apiUrl = this.getApiUrl();
      const url = config.buildUrl(currentParams, apiUrl, this.client);
      const requestSemantics = config.requestSemantics ?? (config.method === 'GET' ? 'read' : 'mutation');
      const requestConfig: RequestConfig = config.requestConfig ?? {
        contentType: 'application/json',
        includeBearerToken: true,
      };

      const buildRequestData = async (attemptParams: Params): Promise<OperationRequestData> => {
        if (config.method !== 'POST' && config.method !== 'PATCH') return undefined;
        return config.buildRequestData?.(attemptParams, this.client);
      };

      const buildHttpRequestOptions = <Body, Semantics extends RequestSemantics>(
        semantics: Semantics,
        snapshottedOptions: OperationExecuteOptions<Params>,
        buildBody: (attemptParams: Params) => Body | Promise<Body>
      ): HttpRequestOptionsForSemantics<Body, Semantics> =>
        createOperationHttpRequestOptions({
          initialParams: currentParams,
          options: snapshottedOptions,
          requestSemantics: semantics,
          initialUrl: url,
          validateParams: (derivedParams): Params => this.validateParams(derivedParams, config.paramsSchema),
          buildUrl: (derivedParams): string => config.buildUrl(derivedParams, apiUrl, this.client),
          buildBody,
        });

      let response: Response;

      if (config.method === 'GET') {
        if (requestSemantics !== 'read') {
          throw new ConfigurationError('Factory-created GET operations must use read semantics');
        }
        const httpOptions =
          operationOptions === undefined && config.requestSemantics === undefined
            ? undefined
            : buildHttpRequestOptions<undefined, 'read'>('read', effectiveOperationOptions, (): undefined => undefined);
        response = await this.makeGetRequest<Response>(url, requestConfig, httpOptions);
      } else if (config.method === 'DELETE') {
        const httpOptions =
          operationOptions === undefined && config.requestSemantics === undefined
            ? undefined
            : buildHttpRequestOptions<undefined, RequestSemantics>(
                requestSemantics,
                effectiveOperationOptions,
                (): undefined => undefined
              );
        response = await this.makeDeleteRequest<Response>(url, requestConfig, httpOptions);
      } else {
        const data = await awaitWithAbort(async (): Promise<OperationRequestData> => {
          const requestData = await buildRequestData(currentParams);
          return requestData;
        }, operationOptions?.signal);
        const httpOptions =
          operationOptions === undefined && config.requestSemantics === undefined
            ? undefined
            : buildHttpRequestOptions<OperationRequestData, RequestSemantics>(
                requestSemantics,
                effectiveOperationOptions,
                buildRequestData
              );
        if (config.method === 'POST') {
          response = await this.makePostRequest<Response, OperationRequestData>(url, data, requestConfig, httpOptions);
        } else {
          // config.method === 'PATCH'
          response = await this.makePatchRequest<Response, OperationRequestData>(url, data, requestConfig, httpOptions);
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
