import { type z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type GetBuyTrafficRequestStatusResponse } from '../../../../schemas/api';
import { GetBuyTrafficRequestStatusParamsSchema } from '../../../../schemas/operations';

/**
 * Get the status of a buy traffic request by tracking ID
 *
 * @example
 *   ```typescript
 *   const status = await client.getBuyTrafficRequestStatus({ trackingId: 'unique-tracking-id' });
 *   
 *   ```
 */
export const GetBuyTrafficRequestStatus = createApiOperation<
  z.infer<typeof GetBuyTrafficRequestStatusParamsSchema>,
  GetBuyTrafficRequestStatusResponse
>({
  paramsSchema: GetBuyTrafficRequestStatusParamsSchema,
  method: 'POST',
  buildUrl: (params, apiUrl: string) =>
    `${apiUrl}/api/validator/v0/wallet/buy-traffic-requests/${params.trackingId}/status`,
  buildRequestData: () => ({}),
});
