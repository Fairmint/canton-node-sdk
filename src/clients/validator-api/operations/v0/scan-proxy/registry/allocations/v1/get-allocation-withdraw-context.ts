import { z } from 'zod';
import { createApiOperation } from '../../../../../../../../core';
import type {
  components,
  paths,
} from '../../../../../../../../generated/token-standard/splice-api-token-allocation-v1/openapi/allocation-v1';

const apiPath = '/registry/allocations/v1/{allocationId}/choice-contexts/withdraw';
const endpoint = '/api/validator/v0/scan-proxy/registry/allocations/v1';

export const GetAllocationWithdrawContextParamsSchema = z.object({
  allocationId: z.string(),
  meta: z.record(z.string(), z.string()).optional(),
});

export type GetAllocationWithdrawContextParams = z.infer<typeof GetAllocationWithdrawContextParamsSchema>;
export type GetAllocationWithdrawContextRequest = components['schemas']['GetChoiceContextRequest'];
export type GetAllocationWithdrawContextResponse =
  paths[typeof apiPath]['post']['responses']['200']['content']['application/json'];

/**
 * Get the choice context to withdraw an allocation
 *
 * @example
 *   ```typescript
 *   const context = await client.getAllocationWithdrawContext({
 *   allocationId: 'allocation123',
 *   meta: { key: 'value' }
 *   });
 *   console.log(`Choice context data: ${JSON.stringify(context.choiceContextData)}`);
 *   ```
 */
export const GetAllocationWithdrawContext = createApiOperation<
  GetAllocationWithdrawContextParams,
  GetAllocationWithdrawContextResponse
>({
  paramsSchema: GetAllocationWithdrawContextParamsSchema,
  method: 'POST',
  buildUrl: (params: GetAllocationWithdrawContextParams, apiUrl: string) =>
    `${apiUrl}${endpoint}/${params.allocationId}/choice-contexts/withdraw`,
  buildRequestData: (params: GetAllocationWithdrawContextParams): GetAllocationWithdrawContextRequest => {
    const request: GetAllocationWithdrawContextRequest = {};
    if (params.meta !== undefined) {
      request.meta = params.meta;
    }
    return request;
  },
});
