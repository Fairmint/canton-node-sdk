import { type z } from 'zod';
import { type BaseClient, type SimpleBaseClient } from '../BaseClient';
import { type RequestConfig } from '../types';
import { ApiOperation, SimpleApiOperation } from './ApiOperation';

export interface ApiOperationConfig<Params, Response> {
  paramsSchema: z.ZodSchema<Params>;
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH';
  buildUrl: (params: Params, apiUrl: string, client: BaseClient) => string;
  buildRequestData?: (params: Params, client: BaseClient) => Promise<unknown>;
  requestConfig?: RequestConfig;
  transformResponse?: (response: Response) => Response;
}

export interface SimpleApiOperationConfig<Params, Response> {
  paramsSchema: z.ZodSchema<Params>;
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH';
  buildUrl: (params: Params, apiUrl: string, client: SimpleBaseClient) => string;
  buildRequestData?: (params: Params, client: SimpleBaseClient) => Promise<unknown>;
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

export function createSimpleApiOperation<Params, Response>(
  config: SimpleApiOperationConfig<Params, Response>
): new (client: SimpleBaseClient) => SimpleApiOperation<Params, Response> {
  return class extends SimpleApiOperation<Params, Response> {
    async execute(params: Params): Promise<Response> {
      // Validate parameters
      const validatedParams = this.validateParams(params, config.paramsSchema);

      const url = config.buildUrl(validatedParams, this.getApiUrl(), this.client);

      let response: Response;

      if (config.method === 'GET') {
        response = await this.makeGetRequest<Response>(url);
      } else if (config.method === 'DELETE') {
        response = await this.makeDeleteRequest<Response>(url);
      } else {
        const data = await config.buildRequestData?.(validatedParams, this.client);
        if (config.method === 'POST') {
          response = await this.makePostRequest<Response>(url, data);
        } else {
          // config.method === 'PATCH'
          response = await this.makePatchRequest<Response>(url, data);
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
