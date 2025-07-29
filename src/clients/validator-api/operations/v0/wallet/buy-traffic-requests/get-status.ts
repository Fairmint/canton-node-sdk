import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { GetBuyTrafficRequestStatusResponse } from '../../../../schemas/api';
import { GetBuyTrafficRequestStatusParamsSchema } from '../../../../schemas/operations';

/**
 * @description Get the status of a buy traffic request by tracking ID
 * @example
 * ```typescript
 * const status = await client.getBuyTrafficRequestStatus({ trackingId: 'unique-tracking-id' });
 * console.log(`Request status: ${status.status}`);
 * ```
 */
export const GetBuyTrafficRequestStatus = createApiOperation<
  z.infer<typeof GetBuyTrafficRequestStatusParamsSchema>,
  GetBuyTrafficRequestStatusResponse
>({
  paramsSchema: GetBuyTrafficRequestStatusParamsSchema,
  method: 'POST',
  buildUrl: (params, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/buy-traffic-requests/${params.trackingId}/status`,
  buildRequestData: () => ({}),
}); 