import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { partyScopeGuard } from '../utils/party-scope';

const endpoint = '/v2/events/events-by-contract-id';

/**
 * Either `readAs` (optional; the client's party is always added) or `anyParty: true` (every party the participant
 * hosts, through `filtersForAnyParty`; needs `CanReadAsAnyParty`), never both.
 */
export const EventsByContractIdParamsSchema = partyScopeGuard('readAs').pipe(
  z.discriminatedUnion('anyParty', [
    z.object({
      contractId: z.string(),
      /** Parties to read as, in addition to the client's party. */
      readAs: z.array(z.string()).optional(),
      anyParty: z.undefined().optional(),
    }),
    z.object({
      contractId: z.string(),
      /** Read as every party the participant hosts. Needs the `CanReadAsAnyParty` right. */
      anyParty: z.literal(true),
      readAs: z.undefined().optional(),
    }),
  ])
);

export type EventsByContractIdParams = z.infer<typeof EventsByContractIdParamsSchema>;

export type EventsByContractIdRequest = paths[typeof endpoint]['post']['requestBody']['content']['application/json'];
export type EventsByContractIdResponse =
  paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

/**
 * Retrieves events for a specific contract ID with filtering options.
 *
 * Reads as the client's party plus `readAs`, or, with `anyParty: true`, as every party the participant hosts (which
 * needs the `CanReadAsAnyParty` right and does not need a configured client party).
 *
 * @example
 *   ```typescript
 *   const events = await client.getEventsByContractId({
 *     contractId: 'contract-123',
 *     readAs: ['party1', 'party2']
 *   });
 *   const everyPartysView = await client.getEventsByContractId({ contractId: 'contract-123', anyParty: true });
 *   ```;
 */
export const GetEventsByContractId = createApiOperation<EventsByContractIdParams, EventsByContractIdResponse>({
  paramsSchema: EventsByContractIdParamsSchema,
  method: 'POST',
  requestSemantics: 'read',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params, client): EventsByContractIdRequest => {
    if (params.anyParty === true) {
      return {
        contractId: params.contractId,
        eventFormat: {
          verbose: true,
          filtersByParty: {},
          filtersForAnyParty: {
            cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: true } } } }],
          },
        },
      };
    }
    const readParties = [...new Set([client.getPartyId(), ...(params.readAs ?? [])])];
    return {
      contractId: params.contractId,
      eventFormat: {
        verbose: true,
        filtersByParty: Object.fromEntries(
          readParties.map((party) => [
            party,
            { cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: true } } } }] },
          ])
        ),
      },
    };
  },
});
