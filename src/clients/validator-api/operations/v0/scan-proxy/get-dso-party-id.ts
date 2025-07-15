import { createApiOperation } from '../../../../../core';
import { GetDsoPartyIdResponse } from '../../../schemas/api';
import { z } from 'zod';

/**
 * @description Get the DSO party ID
 * @example
 * ```typescript
 * const dsoParty = await client.getDsoPartyId();
 * console.log(`DSO Party ID: ${dsoParty.dso_party_id}`);
 * ```
 */
export const GetDsoPartyId = createApiOperation<
  void,
  GetDsoPartyIdResponse
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/scan-proxy/dso-party-id`,
}); 