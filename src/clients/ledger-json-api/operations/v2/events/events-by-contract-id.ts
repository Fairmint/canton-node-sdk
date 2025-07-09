import { createApiOperation, ApiOperation } from '../../../../../core';
import { GetEventsByContractIdParamsSchema, GetEventsByContractIdParams, EventsByContractIdRequest, EventsByContractIdResponse } from '../../../schemas';

export const GetEventsByContractId = createApiOperation<
  GetEventsByContractIdParams,
  EventsByContractIdResponse
>({
  paramsSchema: GetEventsByContractIdParamsSchema,
  operation: 'get events by contract ID',
  method: 'POST',
  buildUrl: (_params: GetEventsByContractIdParams, apiUrl: string) => `${apiUrl}/v2/events/events-by-contract-id`,
  buildRequestData: function(
    this: ApiOperation<GetEventsByContractIdParams, EventsByContractIdResponse>,
    params: GetEventsByContractIdParams
  ) {
    const currentPartyId = this.getPartyId();
    
    const readParties = Array.from(
      new Set([
        ...(currentPartyId ? [currentPartyId] : []),
        ...(params.readAs || []),
      ])
    ).filter((party): party is string => party !== undefined);

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
      },
    };

    return request;
  },
}); 