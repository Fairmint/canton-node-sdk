import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { LookupScanProxyAnsEntryByPartyResponse } from '../scan-proxy/ans-entry';

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
 *   ```;
 */
export const LookupAnsEntryByParty = createApiOperation<{ party: string }, LookupScanProxyAnsEntryByPartyResponse>({
  paramsSchema: LookupAnsEntryByPartyParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl: string) =>
    `${apiUrl}/api/validator/v0/scan-proxy/ans-entries/by-party/${encodeURIComponent(params.party)}`,
});
