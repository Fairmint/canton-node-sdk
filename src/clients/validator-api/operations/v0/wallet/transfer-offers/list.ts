import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type ListTransferOffersResponse } from '../../../../schemas/api';

/**
 * List all transfer offers for the current user
 *
 * @example
 *   ```typescript
 *   const offers = await client.listTransferOffers();
 *   
 *   ```
 */
export const ListTransferOffers = createApiOperation<void, ListTransferOffersResponse>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/transfer-offers`,
});
