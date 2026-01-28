import { type z } from 'zod';
import { type BaseClient } from '../BaseClient';
import { type RequestConfig } from '../types';
import { ApiOperation } from './ApiOperation';

/** Type for the request data builder function - can return any JSON-serializable value or compatible object */
export type RequestDataBuilder<Params> = (
  params: Params,
  client: BaseClient
) =>
  | Record<string, unknown>
  | Buffer
  | string
  | undefined
  | Promise<Record<string, unknown> | Buffer | string | undefined>;

export interface ApiOperationConfig<Params, Response> {
  paramsSchema: z.ZodSchema<Params>;
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH';
  buildUrl: (params: Params, apiUrl: string, client: BaseClient) => string;
  buildRequestData?: RequestDataBuilder<Params>;
  requestConfig?: RequestConfig;
  transformResponse?: (response: Response) => Response;
}

export function createApiOperation<Params, Response>(
  config: ApiOperationConfig<Params, Response>
): new (client: BaseClient) => ApiOperation<Params, Response> {
  return class extends ApiOperation<Params, Response> {
    async execute(params: Params): Promise<Response> {
      // Validate parameters
      const validatedParams = this.validateParams(params, config.paramsSchema);

      const url = config.buildUrl(validatedParams, this.getApiUrl(), this.client);
      const requestConfig = config.requestConfig ?? {
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
