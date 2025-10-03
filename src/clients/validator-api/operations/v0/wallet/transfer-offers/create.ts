import { createApiOperation } from '../../../../../../core';
import { type CreateTransferOfferResponse } from '../../../../schemas/api';
import { CreateTransferOfferParamsSchema, type CreateTransferOfferParams } from '../../../../schemas/operations';

/**
 * Create a new transfer offer to send tokens to another party
 *
 * @example
 *   ```typescript
 *   const offer = await client.createTransferOffer({
 *   receiver_party_id: 'party123',
 *   amount: '100',
 *   description: 'Payment for services',
 *   expires_at: Date.now() + 3600000, // 1 hour from now
 *   tracking_id: 'unique-tracking-id'
 *   });
 *   console.log(`Offer created: ${offer.offer_contract_id}`);
 *   ```
 */
export const CreateTransferOffer = createApiOperation<CreateTransferOfferParams, CreateTransferOfferResponse>({
  paramsSchema: CreateTransferOfferParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/transfer-offers`,
  buildRequestData: (params) => params,
});
