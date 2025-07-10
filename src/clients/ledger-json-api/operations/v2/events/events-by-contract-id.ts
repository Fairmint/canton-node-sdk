import { createApiOperation } from '../../../../../core';
import { GetEventsByContractIdParamsSchema, GetEventsByContractIdParams, EventsByContractIdRequest, EventsByContractIdResponse } from '../../../schemas';

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