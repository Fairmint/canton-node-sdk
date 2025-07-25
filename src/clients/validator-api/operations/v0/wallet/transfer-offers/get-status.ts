import { createApiOperation } from '../../../../../../core';
import { GetTransferOfferStatusResponse } from '../../../../schemas/api';
import { GetTransferOfferStatusParamsSchema } from '../../../../schemas/operations';

/**
 * @description Get the status of a transfer offer by tracking ID
 * @example
 * ```typescript
 * const status = await client.getTransferOfferStatus({ trackingId: 'unique-tracking-id' });
 * console.log(`Offer status: ${status.status}`);
 * ```
 */
export const GetTransferOfferStatus = createApiOperation<
  typeof GetTransferOfferStatusParamsSchema._type,
  GetTransferOfferStatusResponse
>({
  paramsSchema: GetTransferOfferStatusParamsSchema,
  method: 'POST',
  buildUrl: (params, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/transfer-offers/${params.trackingId}/status`,
  buildRequestData: () => ({}),
}); 