import { z } from 'zod';
import { createApiOperation } from '../../../../../../../../core';
import type {
  components,
  paths,
} from '../../../../../../../../generated/token-standard/splice-api-token-allocation-instruction-v1/openapi/allocation-instruction-v1';

type ApiPath = '/registry/allocation-instruction/v1/allocation-factory';

const endpoint = '/api/validator/v0/scan-proxy/registry/allocation-instruction/v1/allocation-factory';

export const GetAllocationFactoryParamsSchema = z.object({
  choiceArguments: z.record(z.string(), z.never()),
  excludeDebugFields: z.boolean().optional(),
});

export type GetAllocationFactoryParams = z.infer<typeof GetAllocationFactoryParamsSchema>;
export type GetAllocationFactoryRequest = components['schemas']['GetFactoryRequest'];
export type GetAllocationFactoryResponse = paths[ApiPath]['post']['responses']['200']['content']['application/json'];

/**
 * Get the factory and choice context for creating allocations using the AllocationFactory_Allocate choice
 *
 * @example
 *   ```typescript
 *   const factory = await client.getAllocationFactory({
 *   choiceArguments: { /* choice arguments *\/ },
 *   excludeDebugFields: false
 *   });
 *
 *   ```;
 */
export const GetAllocationFactory = createApiOperation<GetAllocationFactoryParams, GetAllocationFactoryResponse>({
  paramsSchema: GetAllocationFactoryParamsSchema,
  method: 'POST',
  buildUrl: (_params: GetAllocationFactoryParams, apiUrl: string) => `${apiUrl}${endpoint}`,
  buildRequestData: (params: GetAllocationFactoryParams): GetAllocationFactoryRequest => ({
    choiceArguments: params.choiceArguments,
    excludeDebugFields: params.excludeDebugFields ?? false,
  }),
});
