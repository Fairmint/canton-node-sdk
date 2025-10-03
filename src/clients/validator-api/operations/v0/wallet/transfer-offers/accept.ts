import { createApiOperation } from '../../../../../../core';
import { type AcceptTransferOfferResponse } from '../../../../schemas/api';
import { AcceptTransferOfferParamsSchema, type AcceptTransferOfferParams } from '../../../../schemas/operations';

/**
 * @description Accept a transfer offer by contract ID
 * @example
 * ```typescript
 * const result = await client.acceptTransferOffer({ contractId: 'contract123' });
 * console.log(`Accepted offer: ${result.accepted_offer_contract_id}`);
 * ```
 */
export const AcceptTransferOffer = createApiOperation<
  AcceptTransferOfferParams,
  AcceptTransferOfferResponse
>({
  paramsSchema: AcceptTransferOfferParamsSchema,
  method: 'POST',
  buildUrl: (params, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/transfer-offers/${params.contractId}/accept`,
  buildRequestData: () => ({}),
}); 