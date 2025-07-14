import { createApiOperation } from '../../../../../core';
import { AllocatePartyParamsSchema, AllocatePartyParams } from '../../../schemas/operations';
import { AllocatePartyResponse } from '../../../schemas/api';

/**
 * @description Allocate a new party to the participant node
 * @example
 * ```typescript
 * const result = await client.allocateParty({
 *   partyIdHint: 'alice',
 *   userId: 'user123'
 * });
 * console.log(`Allocated party: ${result.partyDetails.party}`);
 * ```
 */
export const AllocateParty = createApiOperation<
  AllocatePartyParams,
  AllocatePartyResponse
>({
  paramsSchema: AllocatePartyParamsSchema,
  method: 'POST',
  buildUrl: (_params: AllocatePartyParams, apiUrl: string) => `${apiUrl}/v2/parties`,
}); 