import { z } from 'zod';
import { createApiOperation } from '../../../../../../../../core';
import type { components } from '../../../../../../../../generated/token-standard/splice-api-token-transfer-instruction-v1/openapi/transfer-instruction-v1';

// Schema for path parameters
export const GetTransferInstructionRejectContextParamsSchema = z.object({
  transferInstructionId: z.string(),
  meta: z.record(z.string(), z.string()).optional(),
});

export type GetTransferInstructionRejectContextParams = z.infer<typeof GetTransferInstructionRejectContextParamsSchema>;
export type GetTransferInstructionRejectContextRequest = components['schemas']['GetChoiceContextRequest'];
export type GetTransferInstructionRejectContextResponse = components['schemas']['ChoiceContext'];

/**
 * Get the choice context to reject a transfer instruction
 *
 * @example
 *   ```typescript
 *   const context = await client.getTransferInstructionRejectContext({
 *   transferInstructionId: 'contract-id-here',
 *   meta: { key: 'value' }
 *   });
 *   
 *   ```
 */
export const GetTransferInstructionRejectContext = createApiOperation<
  GetTransferInstructionRejectContextParams,
  GetTransferInstructionRejectContextResponse
>({
  paramsSchema: GetTransferInstructionRejectContextParamsSchema,
  method: 'POST',
  buildUrl: (params: GetTransferInstructionRejectContextParams, apiUrl: string) =>
    `${apiUrl}/api/validator/v0/scan-proxy/registry/transfer-instruction/v1/${params.transferInstructionId}/choice-contexts/reject`,
  buildRequestData: (
    params: GetTransferInstructionRejectContextParams
  ): GetTransferInstructionRejectContextRequest => ({
    ...(params.meta && { meta: params.meta }),
  }),
});
