import { createApiOperation } from '../../../../../core';
import { LookupAnsEntryByPartyResponse } from '../../../schemas/api';
import { LookupAnsEntryByPartyParamsSchema, LookupAnsEntryByPartyParams } from '../../../schemas/operations';

/**
 * @description Lookup ANS entry by party
 * @example
 * ```typescript
 * const entry = await client.lookupAnsEntryByParty({ party: 'party123' });
 * console.log(`Entry: ${entry.entry}`);
 * ```
 */
export const LookupAnsEntryByParty = createApiOperation<
  LookupAnsEntryByPartyParams,
  LookupAnsEntryByPartyResponse
>({
  paramsSchema: LookupAnsEntryByPartyParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl: string) => `${apiUrl}/api/validator/v0/ans/entries/party/${params.party}`,
}); 