import { createApiOperation } from '../../../core/operations/ApiOperationFactory';
import { GetEventsByContractIdParamsSchema, GetEventsByContractIdParams, EventsByContractIdRequest, EventsByContractIdResponse } from '../schemas';
import { EnvironmentConfig } from '../../../core/config/EnvironmentConfig';

export const GetEventsByContractId = createApiOperation<
  GetEventsByContractIdParams,
  EventsByContractIdResponse
>({
  paramsSchema: GetEventsByContractIdParamsSchema,
  operation: 'get events by contract ID',
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/events/events-by-contract-id`,
  buildRequestData: (params) => {
    const config = EnvironmentConfig.getInstance();
    const currentPartyId = config.getPartyId();
    
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
      },
    };

    return request;
  },
}); 