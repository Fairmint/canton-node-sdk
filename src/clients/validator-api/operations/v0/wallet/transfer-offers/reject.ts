import { createApiOperation } from '../../../../../../core';
import { type RejectTransferOfferResponse } from '../../../../schemas/api';
import { RejectTransferOfferParamsSchema, type RejectTransferOfferParams } from '../../../../schemas/operations';

/**
 * Reject a transfer offer by contract ID
 *
 * @example
 *   ```typescript
 *   const result = await client.rejectTransferOffer({ contractId: 'contract123' });
 *   console.log(`Rejected offer: ${result.rejected_offer_contract_id}`);
 *   ```
 */
export const RejectTransferOffer = createApiOperation<RejectTransferOfferParams, RejectTransferOfferResponse>({
  paramsSchema: RejectTransferOfferParamsSchema,
  method: 'POST',
  buildUrl: (params, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/transfer-offers/${params.contractId}/reject`,
  buildRequestData: () => ({}),
});
