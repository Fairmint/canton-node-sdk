import { createApiOperation } from '../../../../../../../../core';
import { z } from 'zod';
import type { paths, components } from '../../../../../../../../generated/token-standard/splice-api-token-transfer-instruction-v1/openapi/transfer-instruction-v1';

const apiPath = '/registry/transfer-instruction/v1/transfer-factory';
const endpoint = '/api/validator/v0/scan-proxy/registry/transfer-instruction/v1/transfer-factory';

// Simple schema that matches the generated type exactly
export const GetTransferFactoryParamsSchema = z.object({
  choiceArguments: z.record(z.string(), z.never()),
  excludeDebugFields: z.boolean(),
});

export type GetTransferFactoryParams = components['schemas']['GetFactoryRequest'];
export type GetTransferFactoryRequest = paths[typeof apiPath]['post']['requestBody']['content']['application/json'];
export type GetTransferFactoryResponse = paths[typeof apiPath]['post']['responses']['200']['content']['application/json'];

/**
 * @description Get the factory and choice context for executing a direct transfer
 * @example
 * ```typescript
 * const factory = await client.getTransferFactory({
 *   choiceArguments: { /* choice arguments *\/ },
 *   excludeDebugFields: false
 * });
 * console.log(`Factory ID: ${factory.factoryId}`);
 * ```
 */
export const GetTransferFactory = createApiOperation<
  GetTransferFactoryParams,
  GetTransferFactoryResponse
>({
  paramsSchema: GetTransferFactoryParamsSchema,
  method: 'POST',
  buildUrl: (_params: GetTransferFactoryParams, apiUrl: string) => 
    `${apiUrl}${endpoint}`,
  buildRequestData: (params: GetTransferFactoryParams): GetTransferFactoryRequest => params,
}); 