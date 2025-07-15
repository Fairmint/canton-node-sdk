import { createApiOperation } from '../../../../../../../core';
import { TransferInstructionResultResponse } from '../../../../../schemas/api';
import { CreateTokenStandardTransferParamsSchema } from '../../../../../schemas/operations';

/**
 * @description Create a new token standard transfer to send tokens to another party
 * @example
 * ```typescript
 * const result = await client.createTokenStandardTransfer({
 *   receiver_party_id: 'party123',
 *   amount: '100',
 *   description: 'Payment for services',
 *   expires_at: Date.now() + 3600000, // 1 hour from now
 *   tracking_id: 'unique-tracking-id'
 * });
 * console.log(`Transfer created with output: ${result.output.transfer_instruction_cid}`);
 * ```
 */
export const CreateTokenStandardTransfer = createApiOperation<
  typeof CreateTokenStandardTransferParamsSchema._type,
  TransferInstructionResultResponse
>({
  paramsSchema: CreateTokenStandardTransferParamsSchema,
  method: 'POST',
  buildUrl: (_params: typeof CreateTokenStandardTransferParamsSchema._type, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/token-standard/transfers`,
  buildRequestData: (params: typeof CreateTokenStandardTransferParamsSchema._type) => params,
}); 