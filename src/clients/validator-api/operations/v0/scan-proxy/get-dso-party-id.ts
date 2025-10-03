import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/scan-proxy';

/**
 * Get the DSO party ID
 *
 * @example
 *   ```typescript
 *   const dsoParty = await client.getDsoPartyId();
 *
 *   ```;
 */
export const GetDsoPartyId = createApiOperation<
  void,
  operations['getDsoPartyId']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/scan-proxy/dso-party-id`,
});
