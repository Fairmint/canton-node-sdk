import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/scan-proxy';

export type ListUnclaimedDevelopmentFundCouponsResponse =
  operations['listUnclaimedDevelopmentFundCoupons']['responses']['200']['content']['application/json'];

/** List all unclaimed development-fund coupons through the validator's scan proxy. */
export const ListUnclaimedDevelopmentFundCoupons = createApiOperation<
  void,
  ListUnclaimedDevelopmentFundCouponsResponse
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl: string) => `${apiUrl}/api/validator/v0/scan-proxy/unclaimed-development-fund-coupons`,
});
