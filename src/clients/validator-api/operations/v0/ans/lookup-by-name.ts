import { createApiOperation } from '../../../../../core';
import { LookupAnsEntryByNameResponse } from '../../../schemas/api';
import { LookupAnsEntryByNameParamsSchema } from '../../../schemas/operations';

/**
 * @description Lookup ANS entry by name
 * @example
 * ```typescript
 * const entry = await client.lookupAnsEntryByName({ name: 'my-app' });
 * console.log(`Entry: ${entry.entry}`);
 * ```
 */
export const LookupAnsEntryByName = createApiOperation<
  typeof LookupAnsEntryByNameParamsSchema._type,
  LookupAnsEntryByNameResponse
>({
  paramsSchema: LookupAnsEntryByNameParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl: string) => `${apiUrl}/api/validator/v0/ans/entries/${params.name}`,
}); 