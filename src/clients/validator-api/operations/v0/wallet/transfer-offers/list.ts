import { createApiOperation } from '../../../../../../core';
import { ListTransferOffersResponse } from '../../../../schemas/api';
import { z } from 'zod';

/**
 * @description List all transfer offers for the current user
 * @example
 * ```typescript
 * const offers = await client.listTransferOffers();
 * console.log(`Found ${offers.offers.length} transfer offers`);
 * ```
 */
export const ListTransferOffers = createApiOperation<
  void,
  ListTransferOffersResponse
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/transfer-offers`,
}); 