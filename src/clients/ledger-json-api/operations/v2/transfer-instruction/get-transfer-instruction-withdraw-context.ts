import { createApiOperation } from '../../../../../core';
import { GetTransferInstructionWithdrawContextParams, GetTransferInstructionWithdrawContextParamsSchema } from '../../../schemas/operations';
import { GetTransferInstructionWithdrawContextResponse } from '../../../schemas/api/transfer-instruction';

/**
 * @description Get the choice context to withdraw a transfer instruction
 * @example
 * ```typescript
 * const context = await client.getTransferInstructionWithdrawContext({
 *   transferInstructionId: 'contract-id-here',
 *   meta: { key: 'value' }
 * });
 * console.log(`Choice context data: ${JSON.stringify(context.choiceContextData)}`);
 * ```
 */
export const GetTransferInstructionWithdrawContext = createApiOperation<
  GetTransferInstructionWithdrawContextParams,
  GetTransferInstructionWithdrawContextResponse
>({
  paramsSchema: GetTransferInstructionWithdrawContextParamsSchema,
  method: 'POST',
  buildUrl: (params: GetTransferInstructionWithdrawContextParams, apiUrl: string) => 
    `${apiUrl}/registry/transfer-instruction/v1/${params.transferInstructionId}/choice-contexts/withdraw`,
}); 