import { createApiOperation } from '../../../../../core';
import { LookupTransferCommandCounterByPartyResponse } from '../../../schemas/api';
import { LookupTransferCommandCounterByPartyParamsSchema, LookupTransferCommandCounterByPartyParams } from '../../../schemas/operations';

/**
 * @description Lookup transfer command counter by party
 * @example
 * ```typescript
 * const counter = await client.lookupTransferCommandCounterByParty({ party: 'party123' });
 * console.log(`Counter: ${counter.counter}`);
 * ```
 */
export const LookupTransferCommandCounterByParty = createApiOperation<
  LookupTransferCommandCounterByPartyParams,
  LookupTransferCommandCounterByPartyResponse
>({
  paramsSchema: LookupTransferCommandCounterByPartyParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl: string) => `${apiUrl}/api/validator/v0/scan-proxy/transfer-commands/${params.party}/counter`,
}); 