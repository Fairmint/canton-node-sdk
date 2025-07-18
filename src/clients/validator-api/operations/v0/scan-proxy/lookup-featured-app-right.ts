import { createApiOperation } from '../../../../../core';
import { LookupFeaturedAppRightResponse } from '../../../schemas/api';
import { GetFeaturedAppRightParamsSchema, GetFeaturedAppRightParams } from '../../../schemas/operations';

/**
 * @description Lookup featured app right
 * @example
 * ```typescript
 * const right = await client.lookupFeaturedAppRight({ partyId: 'party123' });
 * console.log(`Featured app right: ${right.featured_app_right}`);
 * ```
 */
export const LookupFeaturedAppRight = createApiOperation<
  GetFeaturedAppRightParams,
  LookupFeaturedAppRightResponse
>({
  paramsSchema: GetFeaturedAppRightParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl: string) => {
    const url = new URL(`${apiUrl}/api/validator/v0/scan-proxy/featured-apps/${params.partyId}`);
    return url.toString();
  },
}); 