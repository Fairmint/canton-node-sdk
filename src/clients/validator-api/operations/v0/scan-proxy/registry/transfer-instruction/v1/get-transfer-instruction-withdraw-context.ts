import { z } from 'zod';
import { createApiOperation } from '../../../../../../../../core';
import type { components } from '../../../../../../../../generated/token-standard/splice-api-token-transfer-instruction-v1/openapi/transfer-instruction-v1';

// Schema for path parameters
export const GetTransferInstructionWithdrawContextParamsSchema = z.object({
  transferInstructionId: z.string(),
  meta: z.record(z.string(), z.string()).optional(),
  excludeDebugFields: z.boolean().optional(),
});

export type GetTransferInstructionWithdrawContextParams = z.infer<
  typeof GetTransferInstructionWithdrawContextParamsSchema
>;
export type GetTransferInstructionWithdrawContextRequest = components['schemas']['GetChoiceContextRequest'];
export type GetTransferInstructionWithdrawContextResponse = components['schemas']['ChoiceContext'];

/**
 * Get the choice context to withdraw a transfer instruction
 *
 * @example
 *   ```typescript
 *   const context = await client.getTransferInstructionWithdrawContext({
 *   transferInstructionId: 'contract-id-here',
 *   meta: { key: 'value' }
 *   });
 *
 *   ```;
 */
export const GetTransferInstructionWithdrawContext = createApiOperation<
  GetTransferInstructionWithdrawContextParams,
  GetTransferInstructionWithdrawContextResponse
>({
  paramsSchema: GetTransferInstructionWithdrawContextParamsSchema,
  method: 'POST',
  buildUrl: (params: GetTransferInstructionWithdrawContextParams, apiUrl: string) =>
    `${apiUrl}/api/validator/v0/scan-proxy/registry/transfer-instruction/v1/${params.transferInstructionId}/choice-contexts/withdraw`,
  buildRequestData: (
    params: GetTransferInstructionWithdrawContextParams
  ): GetTransferInstructionWithdrawContextRequest => ({
    excludeDebugFields: params.excludeDebugFields ?? false,
    ...(params.meta && { meta: params.meta }),
  }),
});
