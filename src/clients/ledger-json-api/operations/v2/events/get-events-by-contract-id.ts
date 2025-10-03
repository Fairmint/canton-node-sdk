import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const endpoint = '/v2/events/events-by-contract-id';

export const EventsByContractIdParamsSchema = z.object({
  contractId: z.string(),
  readAs: z.array(z.string()).optional(),
});

export type EventsByContractIdParams = z.infer<typeof EventsByContractIdParamsSchema>;

export type EventsByContractIdRequest = paths[typeof endpoint]['post']['requestBody']['content']['application/json'];
export type EventsByContractIdResponse =
  paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

/**
 * Retrieves events for a specific contract ID with filtering options
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
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params, client): EventsByContractIdRequest => {
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
