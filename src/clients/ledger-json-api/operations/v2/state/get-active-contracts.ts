import { createApiOperation } from '../../../../../core';
import { GetActiveContractsParamsSchema, GetActiveContractsParams } from '../../../schemas/operations';
import { GetActiveContractsRequest, JsGetActiveContractsResponse } from '../../../schemas/api';

/**
 * @description Query active contracts list (blocking call)
 * @example
 * ```typescript
 * const activeContracts = await client.getActiveContracts({
 *   activeAtOffset: 1000,
 *   parties: ['party1', 'party2'],
 *   verbose: true // optional, defaults to false
 * });
 * ```
 * @param activeAtOffset - The offset at which the snapshot of the active contracts will be computed
 * @param limit - Maximum number of elements to return (optional)
 * @param streamIdleTimeoutMs - Timeout to complete and send result if no new elements are received (optional)
 * @param parties - Parties to filter by (optional)
 * @param verbose - Whether to include verbose information (optional, defaults to false)
 */
export const GetActiveContracts = createApiOperation<
  GetActiveContractsParams,
  JsGetActiveContractsResponse
>({
  paramsSchema: GetActiveContractsParamsSchema,
  method: 'POST',
  buildUrl: (params: GetActiveContractsParams, apiUrl: string) => {
    const url = new URL(`${apiUrl}/v2/state/active-contracts`);
    if (params.limit !== undefined) {
      url.searchParams.set('limit', params.limit.toString());
    }
    if (params.streamIdleTimeoutMs !== undefined) {
      url.searchParams.set('stream_idle_timeout_ms', params.streamIdleTimeoutMs.toString());
    }
    return url.toString();
  },
  buildRequestData: (params: GetActiveContractsParams, client) => {
    const currentPartyId = client.getPartyId();
    
    const parties = Array.from(
      new Set([
        currentPartyId,
        ...(params.parties || []),
      ])
    );

    const request: GetActiveContractsRequest = {
      activeAtOffset: params.activeAtOffset ?? 0,
      verbose: params.verbose ?? false,
      eventFormat: {
        verbose: params.verbose ?? false,
        filtersByParty: {
          ...parties.reduce(
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