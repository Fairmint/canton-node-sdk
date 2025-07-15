import { createApiOperation } from '../../../../../../core';
import { WithdrawTransferOfferParamsSchema } from '../../../../schemas/operations';
import { WithdrawTransferOfferResponse } from '../../../../schemas/api';

/**
 * @description Withdraw a transfer offer by contract ID
 * @example
 * ```typescript
 * const result = await client.withdrawTransferOffer({ contractId: 'contract123' });
 * console.log(`Withdrawn offer: ${result.withdrawn_offer_contract_id}`);
 * ```
 */
export const WithdrawTransferOffer = createApiOperation<
  typeof WithdrawTransferOfferParamsSchema._type,
  WithdrawTransferOfferResponse
>({
  paramsSchema: WithdrawTransferOfferParamsSchema,
  method: 'POST',
  buildUrl: (params, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/transfer-offers/${params.contractId}/withdraw`,
  buildRequestData: () => ({}),
}); 