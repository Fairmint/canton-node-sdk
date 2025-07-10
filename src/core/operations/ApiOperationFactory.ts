import { z } from 'zod';
import { ApiOperation } from './ApiOperation';
import { RequestConfig } from '../types';
import { BaseClient } from '../BaseClient';

export interface ApiOperationConfig<Params, Response> {
  paramsSchema: z.ZodSchema<Params>;
  operation: string;
  method: 'GET' | 'POST';
  buildUrl: (params: Params, apiUrl: string, client: BaseClient) => string;
  buildRequestData?: (params: Params, client: BaseClient) => unknown;
  requestConfig?: RequestConfig;
  transformResponse?: (response: any) => Response;
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

        let response: any;

        if (config.method === 'GET') {
          response = await this.makeGetRequest(url, requestConfig);
        } else {
          const data = config.buildRequestData?.(validatedParams, this.client);
          response = await this.makePostRequest(url, data, requestConfig);
        }

        // Transform response if needed
        if (config.transformResponse) {
          return config.transformResponse(response);
        }

        return response;
    }
  };
} 