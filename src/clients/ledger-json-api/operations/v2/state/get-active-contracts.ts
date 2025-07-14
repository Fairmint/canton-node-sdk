import { createApiOperation } from '../../../../../core';
import { GetActiveContractsParamsSchema, GetActiveContractsParams } from '../../../schemas/operations';
import { GetActiveContractsRequest, JsGetActiveContractsResponse } from '../../../schemas/api';
import { LedgerJsonApiClient } from '../../../LedgerJsonApiClient';

/**
 * @description Query active contracts list (blocking call)
 * @example
 * ```typescript
 * const activeContracts = await client.getActiveContracts({
 *   activeAtOffset: 1000, // optional, defaults to ledger-end if not provided
 *   parties: ['party1', 'party2'],
 *   verbose: true // optional, defaults to false
 * });
 * ```
 * @param activeAtOffset - The offset at which the snapshot of the active contracts will be computed (optional, defaults to ledger-end)
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
  buildRequestData: async (params: GetActiveContractsParams, client) => {
    const currentPartyId = client.getPartyId();
    
    const parties = Array.from(
      new Set([
        currentPartyId,
        ...(params.parties || []),
      ])
    );

    // If activeAtOffset is not provided, get the current ledger end
    let activeAtOffset: number;
    if (params.activeAtOffset !== undefined) {
      activeAtOffset = params.activeAtOffset;
    } else {
      const ledgerClient = client as LedgerJsonApiClient;
      const ledgerEnd = await ledgerClient.getLedgerEnd({});
      activeAtOffset = ledgerEnd.offset;
    }

    const request: GetActiveContractsRequest = {
      activeAtOffset,
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