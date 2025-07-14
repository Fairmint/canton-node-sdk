import { z } from 'zod';
import { ApiOperation } from './ApiOperation';
import { RequestConfig } from '../types';
import { BaseClient } from '../BaseClient';

export interface ApiOperationConfig<Params, Response> {
  paramsSchema: z.ZodSchema<Params>;
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH';
  buildUrl: (params: Params, apiUrl: string, client: BaseClient) => string;
  buildRequestData?: (params: Params, client: BaseClient) => unknown;
  requestConfig?: RequestConfig;
  transformResponse?: (response: Response) => Response;
}

export function createApiOperation<Params, Response>(
  config: ApiOperationConfig<Params, Response>
) {
  return class extends ApiOperation<Params, Response> {
    async execute(params: Params): Promise<Response> {
      // Validate parameters
      const validatedParams = this.validateParams(params, config.paramsSchema);

        const url = config.buildUrl(validatedParams, this.getApiUrl(), this.client);
        const requestConfig = config.requestConfig || { 
          contentType: 'application/json', 
          includeBearerToken: true 
        };

        let response: Response;

        if (config.method === 'GET') {
          response = await this.makeGetRequest<Response>(url, requestConfig);
        } else if (config.method === 'DELETE') {
          response = await this.makeDeleteRequest<Response>(url, requestConfig);
        } else {
          const data = config.buildRequestData?.(validatedParams, this.client);
          if (config.method === 'POST') {
            response = await this.makePostRequest<Response>(url, data, requestConfig);
          } else if (config.method === 'PATCH') {
            response = await this.makePatchRequest<Response>(url, data, requestConfig);
          } else {
            throw new Error(`Unsupported HTTP method: ${config.method}`);
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