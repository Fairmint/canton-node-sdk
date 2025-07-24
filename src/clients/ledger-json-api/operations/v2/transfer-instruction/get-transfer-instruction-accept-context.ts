import { createApiOperation } from '../../../../../core';
import { GetTransferInstructionAcceptContextParams, GetTransferInstructionAcceptContextParamsSchema } from '../../../schemas/operations';
import { GetTransferInstructionAcceptContextResponse } from '../../../schemas/api/transfer-instruction';

/**
 * @description Get the choice context to accept a transfer instruction
 * @example
 * ```typescript
 * const context = await client.getTransferInstructionAcceptContext({
 *   transferInstructionId: 'contract-id-here',
 *   meta: { key: 'value' }
 * });
 * console.log(`Choice context data: ${JSON.stringify(context.choiceContextData)}`);
 * ```
 */
export const GetTransferInstructionAcceptContext = createApiOperation<
  GetTransferInstructionAcceptContextParams,
  GetTransferInstructionAcceptContextResponse
>({
  paramsSchema: GetTransferInstructionAcceptContextParamsSchema,
  method: 'POST',
  buildUrl: (params: GetTransferInstructionAcceptContextParams, apiUrl: string) => 
    `${apiUrl}/registry/transfer-instruction/v1/${params.transferInstructionId}/choice-contexts/accept`,
}); 