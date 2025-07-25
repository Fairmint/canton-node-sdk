import { createApiOperation } from '../../../../../../../../core';
import { z } from 'zod';
import type { paths, components } from '../../../../../../../../generated/token-standard/splice-api-token-allocation-v1/openapi/allocation-v1';

const apiPath = '/registry/allocations/v1/{allocationId}/choice-contexts/execute-transfer';
const endpoint = '/api/validator/v0/scan-proxy/registry/allocations/v1';

export const GetAllocationTransferContextParamsSchema = z.object({
  allocationId: z.string(),
  meta: z.record(z.string()).optional(),
});

export type GetAllocationTransferContextParams = z.infer<typeof GetAllocationTransferContextParamsSchema>;
export type GetAllocationTransferContextRequest = components['schemas']['GetChoiceContextRequest'];
export type GetAllocationTransferContextResponse = paths[typeof apiPath]['post']['responses']['200']['content']['application/json'];

/**
 * @description Get the choice context to execute a transfer on an allocation
 * @example
 * ```typescript
 * const context = await client.getAllocationTransferContext({
 *   allocationId: 'allocation123',
 *   meta: { key: 'value' }
 * });
 * console.log(`Choice context data: ${JSON.stringify(context.choiceContextData)}`);
 * ```
 */
export const GetAllocationTransferContext = createApiOperation<
  GetAllocationTransferContextParams,
  GetAllocationTransferContextResponse
>({
  paramsSchema: GetAllocationTransferContextParamsSchema,
  method: 'POST',
  buildUrl: (params: GetAllocationTransferContextParams, apiUrl: string) => 
    `${apiUrl}${endpoint}/${params.allocationId}/choice-contexts/execute-transfer`,
  buildRequestData: (params: GetAllocationTransferContextParams): GetAllocationTransferContextRequest => {
    const request: GetAllocationTransferContextRequest = {};
    if (params.meta !== undefined) {
      request.meta = params.meta;
    }
    return request;
  },
}); 