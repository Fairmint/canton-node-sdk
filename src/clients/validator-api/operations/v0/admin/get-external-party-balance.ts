import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/validator-internal';

const GetExternalPartyBalanceParamsSchema = z.object({
  partyId: z.string(),
});

/**
 * Get external party balance information
 *
 * @example
 *   ```typescript
 *   const balance = await client.getExternalPartyBalance({ partyId: 'party123' });
 *
 *   ```;
 */
export const GetExternalPartyBalance = createApiOperation<
  { partyId: string },
  operations['getExternalPartyBalance']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetExternalPartyBalanceParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl: string) =>
    `${apiUrl}/api/validator/v0/admin/external-party/balance?party_id=${params.partyId}`,
});
