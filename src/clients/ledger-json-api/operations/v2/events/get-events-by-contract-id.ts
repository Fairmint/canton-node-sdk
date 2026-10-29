import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const endpoint = '/v2/events/events-by-contract-id';

export const EventsByContractIdParamsSchema = z.object({
  contractId: z.string(),
  /** Parties to read as, in addition to the client's party unless `anyParty` is set. */
  readAs: z.array(z.string()).optional(),
  /**
   * Read as every party hosted on the participant (`filtersForAnyParty`), plus any `readAs` parties; the client's party
   * is not added. Needs the `CanReadAsAnyParty` user right.
   */
  anyParty: z.boolean().optional(),
});

export type EventsByContractIdParams = z.infer<typeof EventsByContractIdParamsSchema>;

export type EventsByContractIdRequest = paths[typeof endpoint]['post']['requestBody']['content']['application/json'];
export type EventsByContractIdResponse =
  paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

/**
 * Retrieves events for a specific contract ID with filtering options. Reads as the client's party and `readAs`, or with
 * `anyParty` as every party hosted on the participant, so a contract that only another local party sees is found too.
 *
 * @example
 *   ```typescript
 *   const events = await client.getEventsByContractId({
 *     contractId: 'contract-123',
 *     readAs: ['party1', 'party2']
 *   });
 *   ```;
 */
export const GetEventsByContractId = createApiOperation<EventsByContractIdParams, EventsByContractIdResponse>({
  paramsSchema: EventsByContractIdParamsSchema,
  method: 'POST',
  requestSemantics: 'read',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params, client): EventsByContractIdRequest => {
    const anyParty = params.anyParty === true;
    const readParties = [...new Set([...(anyParty ? [] : [client.getPartyId()]), ...(params.readAs ?? [])])];
    const wildcard = {
      cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: true } } } }],
    };
    return {
      contractId: params.contractId,
      eventFormat: {
        verbose: true,
        filtersByParty: Object.fromEntries(readParties.map((party) => [party, wildcard])),
        ...(anyParty && { filtersForAnyParty: wildcard }),
      },
    };
  },
});
