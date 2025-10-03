import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/scan-proxy';

const LookupAnsEntryByNameParamsSchema = z.object({
  name: z.string(),
});

/**
 * @description Lookup ANS entry by name
 * @example
 * ```typescript
 * const entry = await client.lookupAnsEntryByName({ name: 'my-app' });
 * console.log(`Entry: ${entry.entry}`);
 * ```
 */
export const LookupAnsEntryByName = createApiOperation<
  { name: string },
  operations['lookupAnsEntryByName']['responses']['200']['content']['application/json']
>({
  paramsSchema: LookupAnsEntryByNameParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl: string) => `${apiUrl}/api/validator/v0/scan-proxy/ans-entries/by-name/${params.name}`,
}); 