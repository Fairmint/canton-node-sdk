import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';

/**
 * @description Get a member's traffic status as reported by the sequencer
 * @example
 * ```typescript
 * const status = await client.getMemberTrafficStatus({ 
 *   domainId: 'domain123', 
 *   memberId: 'PAR::id::fingerprint' 
 * });
 * console.log(`Total consumed: ${status.traffic_status.actual.total_consumed}`);
 * ```
 */
export const GetMemberTrafficStatus = createApiOperation<
  { domainId: string; memberId: string },
  operations['getMemberTrafficStatus']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.object({
    domainId: z.string(),
    memberId: z.string(),
  }),
  method: 'GET',
  buildUrl: (params, apiUrl: string) => `${apiUrl}/api/validator/v0/scan-proxy/domains/${params.domainId}/members/${params.memberId}/traffic-status`,
}); 