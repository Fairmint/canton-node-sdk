import { type z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type GetTransferOfferStatusResponse } from '../../../../schemas/api';
import { GetTransferOfferStatusParamsSchema } from '../../../../schemas/operations';

/**
 * Get the status of a transfer offer by tracking ID
 *
 * @example
 *   ```typescript
 *   const status = await client.getTransferOfferStatus({ trackingId: 'unique-tracking-id' });
 *
 *   ```;
 */
export const GetTransferOfferStatus = createApiOperation<
  z.infer<typeof GetTransferOfferStatusParamsSchema>,
  GetTransferOfferStatusResponse
>({
  paramsSchema: GetTransferOfferStatusParamsSchema,
  method: 'POST',
  buildUrl: (params, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/transfer-offers/${params.trackingId}/status`,
  buildRequestData: () => ({}),
});
