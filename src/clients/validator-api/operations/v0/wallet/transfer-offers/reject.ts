import { createApiOperation } from '../../../../../../core';
import { RejectTransferOfferParamsSchema } from '../../../../schemas/operations';
import { RejectTransferOfferResponse } from '../../../../schemas/api';

/**
 * @description Reject a transfer offer by contract ID
 * @example
 * ```typescript
 * const result = await client.rejectTransferOffer({ contractId: 'contract123' });
 * console.log(`Rejected offer: ${result.rejected_offer_contract_id}`);
 * ```
 */
export const RejectTransferOffer = createApiOperation<
  typeof RejectTransferOfferParamsSchema._type,
  RejectTransferOfferResponse
>({
  paramsSchema: RejectTransferOfferParamsSchema,
  method: 'POST',
  buildUrl: (params, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/transfer-offers/${params.contractId}/reject`,
  buildRequestData: () => ({}),
}); 