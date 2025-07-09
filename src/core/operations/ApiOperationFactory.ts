import { z } from 'zod';
import { ApiOperation } from './ApiOperation';
import { RequestConfig } from '../types';

export interface ApiOperationConfig<Params, Response> {
  paramsSchema: z.ZodSchema<Params>;
  operation: string;
  method: 'GET' | 'POST';
  buildUrl: (params: Params, apiUrl: string) => string;
  buildRequestData?: (params: Params) => unknown;
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

      try {
        const url = config.buildUrl(validatedParams, this.getApiUrl());
        const requestConfig = config.requestConfig || { 
          contentType: 'application/json', 
          includeBearerToken: true 
        };

        let response: any;

        if (config.method === 'GET') {
          response = await this.makeGetRequest(url, requestConfig);
        } else {
          const data = config.buildRequestData?.(validatedParams);
          response = await this.makePostRequest(url, data, requestConfig);
        }

        // Transform response if needed
        if (config.transformResponse) {
          return config.transformResponse(response);
        }

        return response;
      } catch (error) {
        // Re-throw the error as it's already properly typed from the base classes
        throw error;
      }
    }
  };
} 