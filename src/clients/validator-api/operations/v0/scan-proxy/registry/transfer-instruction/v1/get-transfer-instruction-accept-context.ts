import { z } from 'zod';
import { createApiOperation } from '../../../../../../../../core';
import type { components } from '../../../../../../../../generated/token-standard/splice-api-token-transfer-instruction-v1/openapi/transfer-instruction-v1';

// Schema for path parameters
export const GetTransferInstructionAcceptContextParamsSchema = z.object({
  transferInstructionId: z.string(),
  meta: z.record(z.string(), z.string()).optional(),
});

export type GetTransferInstructionAcceptContextParams = z.infer<typeof GetTransferInstructionAcceptContextParamsSchema>;
export type GetTransferInstructionAcceptContextRequest = components['schemas']['GetChoiceContextRequest'];
export type GetTransferInstructionAcceptContextResponse = components['schemas']['ChoiceContext'];

/**
 * Get the choice context to accept a transfer instruction
 *
 * @example
 *   ```typescript
 *   const context = await client.getTransferInstructionAcceptContext({
 *   transferInstructionId: 'contract-id-here',
 *   meta: { key: 'value' }
 *   });
 *   
 *   ```
 */
export const GetTransferInstructionAcceptContext = createApiOperation<
  GetTransferInstructionAcceptContextParams,
  GetTransferInstructionAcceptContextResponse
>({
  paramsSchema: GetTransferInstructionAcceptContextParamsSchema,
  method: 'POST',
  buildUrl: (params: GetTransferInstructionAcceptContextParams, apiUrl: string) =>
    `${apiUrl}/api/validator/v0/scan-proxy/registry/transfer-instruction/v1/${params.transferInstructionId}/choice-contexts/accept`,
  buildRequestData: (
    params: GetTransferInstructionAcceptContextParams
  ): GetTransferInstructionAcceptContextRequest => ({
    ...(params.meta && { meta: params.meta }),
  }),
});
