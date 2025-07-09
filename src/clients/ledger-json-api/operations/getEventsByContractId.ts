import { createApiOperation } from '../../../core/operations/ApiOperationFactory';
import { GetEventsByContractIdParamsSchema, GetEventsByContractIdParams, EventsByContractIdRequest, EventsByContractIdResponse } from '../schemas';

export const GetEventsByContractId = createApiOperation<
  GetEventsByContractIdParams,
  EventsByContractIdResponse
>({
  paramsSchema: GetEventsByContractIdParamsSchema,
  operation: 'get events by contract ID',
  method: 'POST',
  buildUrl: () => '/events/events-by-contract-id',
  buildRequestData: (params) => {
    const readParties = Array.from(
      new Set([
        params.readAs || [],
      ])
    ).flat();

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
  transformResponse: (response) => {
    if (!response) {
      throw new Error('No response received');
    }
    return response;
  },
}); 