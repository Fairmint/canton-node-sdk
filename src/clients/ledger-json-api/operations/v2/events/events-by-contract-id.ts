import { createApiOperation } from '../../../../../core';
import { GetEventsByContractIdParamsSchema, GetEventsByContractIdParams, EventsByContractIdRequest, EventsByContractIdResponse } from '../../../schemas';

/**
 * @description Retrieves events for a specific contract ID with filtering options
 * @example
 * ```typescript
 * const events = await client.getEventsByContractId({
 *   contractId: 'contract-123',
 *   readAs: ['party1', 'party2']
 * });
 * ```
 * @param contractId - The unique identifier of the contract
 * @param readAs - Optional array of party IDs to read events as
 */
export const GetEventsByContractId = createApiOperation<
  GetEventsByContractIdParams,
  EventsByContractIdResponse
>({
  paramsSchema: GetEventsByContractIdParamsSchema,
  operation: 'get events by contract ID',
  method: 'POST',
  buildUrl: (_params: GetEventsByContractIdParams, apiUrl: string) => `${apiUrl}/v2/events/events-by-contract-id`,
  buildRequestData: (params: GetEventsByContractIdParams, client) => {
    const currentPartyId = client.getPartyId();
    
    const readParties = Array.from(
      new Set([
        currentPartyId,
        ...(params.readAs || []),
      ])
    );

    const request: EventsByContractIdRequest = {
      contractId: params.contractId,
      eventFormat: {
        verbose: true,
        filtersByParty: {
          ...readParties.reduce(
            (acc, party) => {
              acc[party] = {
                cumulative: [],
              };
              return acc;
            },
            {} as Record<string, { cumulative: string[] }>
          ),
        },
        includeCreatedEventBlob: true,
        includeInterfaceViews: true,
      },
    };

    return request;
  },
}); 