import { createApiOperation } from '../../../../../core';
import { GetTransferInstructionRejectContextParams, GetTransferInstructionRejectContextParamsSchema } from '../../../schemas/operations';
import { GetTransferInstructionRejectContextResponse } from '../../../schemas/api/transfer-instruction';

/**
 * @description Get the choice context to reject a transfer instruction
 * @example
 * ```typescript
 * const context = await client.getTransferInstructionRejectContext({
 *   transferInstructionId: 'contract-id-here',
 *   meta: { key: 'value' }
 * });
 * console.log(`Choice context data: ${JSON.stringify(context.choiceContextData)}`);
 * ```
 */
export const GetTransferInstructionRejectContext = createApiOperation<
  GetTransferInstructionRejectContextParams,
  GetTransferInstructionRejectContextResponse
>({
  paramsSchema: GetTransferInstructionRejectContextParamsSchema,
  method: 'POST',
  buildUrl: (params: GetTransferInstructionRejectContextParams, apiUrl: string) => 
    `${apiUrl}/registry/transfer-instruction/v1/${params.transferInstructionId}/choice-contexts/reject`,
}); 