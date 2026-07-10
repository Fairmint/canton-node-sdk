import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { LookupScanProxyAnsEntryByNameResponse } from '../scan-proxy/ans-entry';

const LookupAnsEntryByNameParamsSchema = z.object({
  name: z.string(),
});

/**
 * Lookup ANS entry by name
 *
 * @example
 *   ```typescript
 *   const entry = await client.lookupAnsEntryByName({ name: 'my-app' });
 *
 *   ```;
 */
export const LookupAnsEntryByName = createApiOperation<{ name: string }, LookupScanProxyAnsEntryByNameResponse>({
  paramsSchema: LookupAnsEntryByNameParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl: string): string =>
    `${apiUrl}/api/validator/v0/scan-proxy/ans-entries/by-name/${encodeURIComponent(params.name)}`,
});
