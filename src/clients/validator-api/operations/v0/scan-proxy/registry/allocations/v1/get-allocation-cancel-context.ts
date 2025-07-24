import { createApiOperation } from '../../../../../../../../core';
import { z } from 'zod';
import type { paths, components } from '../../../../../../../../generated/token-standard/splice-api-token-allocation-v1/openapi/allocation-v1';

const apiPath = '/registry/allocations/v1/{allocationId}/choice-contexts/cancel';
const endpoint = '/api/validator/v0/scan-proxy/registry/allocations/v1';

export const GetAllocationCancelContextParamsSchema = z.object({
  allocationId: z.string(),
  meta: z.record(z.string()).optional(),
});

export type GetAllocationCancelContextParams = z.infer<typeof GetAllocationCancelContextParamsSchema>;
export type GetAllocationCancelContextRequest = components['schemas']['GetChoiceContextRequest'];
export type GetAllocationCancelContextResponse = paths[typeof apiPath]['post']['responses']['200']['content']['application/json'];

/**
 * @description Get the choice context to cancel an allocation
 * @example
 * ```typescript
 * const context = await client.getAllocationCancelContext({
 *   allocationId: 'allocation123',
 *   meta: { key: 'value' }
 * });
 * console.log(`Choice context data: ${JSON.stringify(context.choiceContextData)}`);
 * ```
 */
export const GetAllocationCancelContext = createApiOperation<
  GetAllocationCancelContextParams,
  GetAllocationCancelContextResponse
>({
  paramsSchema: GetAllocationCancelContextParamsSchema,
  method: 'POST',
  buildUrl: (params: GetAllocationCancelContextParams, apiUrl: string) => 
    `${apiUrl}${endpoint}/${params.allocationId}/choice-contexts/cancel`,
  buildRequestData: (params: GetAllocationCancelContextParams): GetAllocationCancelContextRequest => {
    const request: GetAllocationCancelContextRequest = {};
    if (params.meta !== undefined) {
      request.meta = params.meta;
    }
    return request;
  },
}); 