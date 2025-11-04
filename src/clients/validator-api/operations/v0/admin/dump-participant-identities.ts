import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/validator-internal';

/**
 * Dump all participant identities
 *
 * @example
 *   ```typescript
 *   const result = await client.dumpParticipantIdentities();
 *   console.log('Participant ID:', result.id);
 *   ```;
 */
export const DumpParticipantIdentities = createApiOperation<
  void,
  operations['dumpParticipantIdentities']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl: string) => `${apiUrl}/api/validator/v0/admin/participant/identities`,
  buildRequestData: () => ({}),
});
