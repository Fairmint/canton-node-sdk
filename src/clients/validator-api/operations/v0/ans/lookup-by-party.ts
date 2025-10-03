import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/scan-proxy';

const LookupAnsEntryByPartyParamsSchema = z.object({
  party: z.string(),
});

/**
 * Lookup ANS entry by party
 *
 * @example
 *   ```typescript
 *   const entry = await client.lookupAnsEntryByParty({ party: 'party123' });
 *   
 *   ```
 */
export const LookupAnsEntryByParty = createApiOperation<
  { party: string },
  operations['lookupAnsEntryByParty']['responses']['200']['content']['application/json']
>({
  paramsSchema: LookupAnsEntryByPartyParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl: string) => `${apiUrl}/api/validator/v0/scan-proxy/ans-entries/by-party/${params.party}`,
});
