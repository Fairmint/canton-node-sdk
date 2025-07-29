import { createApiOperation } from '../../../../../../../../core';
import { z } from 'zod';
import type { paths, components } from '../../../../../../../../generated/token-standard/splice-api-token-allocation-instruction-v1/openapi/allocation-instruction-v1';

const apiPath = '/registry/allocation-instruction/v1/allocation-factory';
const endpoint = '/api/validator/v0/scan-proxy/registry/allocation-instruction/v1/allocation-factory';

export const GetAllocationFactoryParamsSchema = z.object({
  choiceArguments: z.record(z.string(), z.never()),
  excludeDebugFields: z.boolean(),
});

export type GetAllocationFactoryParams = z.infer<typeof GetAllocationFactoryParamsSchema>;
export type GetAllocationFactoryRequest = components['schemas']['GetFactoryRequest'];
export type GetAllocationFactoryResponse = paths[typeof apiPath]['post']['responses']['200']['content']['application/json'];

/**
 * @description Get the factory and choice context for creating allocations using the AllocationFactory_Allocate choice
 * @example
 * ```typescript
 * const factory = await client.getAllocationFactory({
 *   choiceArguments: { /* choice arguments *\/ },
 *   excludeDebugFields: false
 * });
 * console.log(`Factory ID: ${factory.factoryId}`);
 * ```
 */
export const GetAllocationFactory = createApiOperation<
  GetAllocationFactoryParams,
  GetAllocationFactoryResponse
>({
  paramsSchema: GetAllocationFactoryParamsSchema,
  method: 'POST',
  buildUrl: (_params: GetAllocationFactoryParams, apiUrl: string) => `${apiUrl}${endpoint}`,
  buildRequestData: (params: GetAllocationFactoryParams): GetAllocationFactoryRequest => ({
    choiceArguments: params.choiceArguments,
    excludeDebugFields: params.excludeDebugFields,
  }),
}); 