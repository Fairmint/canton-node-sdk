import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/apps/validator/src/main/openapi/scan-proxy';
import z from 'zod';

const endpoint = '/v0/scan-proxy/featured-apps/{provider_party_id}';
export type LookupFeaturedAppRightResponse = paths[typeof endpoint]['get']['responses']['200']['content']['application/json'];

export const GetFeaturedAppRightParamsSchema = z.object({
  partyId: z.string(),
});

export type GetFeaturedAppRightParams = z.infer<typeof GetFeaturedAppRightParamsSchema>;
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