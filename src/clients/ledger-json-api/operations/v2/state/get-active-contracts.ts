import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import type { LedgerJsonApiClient } from '../../../LedgerJsonApiClient.generated';
import { GetActiveContractsParamsSchema } from '../../../schemas/operations';

const endpoint = '/v2/state/active-contracts' as const;

export type GetActiveContractsParams = paths[typeof endpoint]['post']['requestBody']['content']['application/json'];
export type GetActiveContractsResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

// Custom params type with optional activeAtOffset
export type GetActiveContractsCustomParams = z.infer<typeof GetActiveContractsParamsSchema>;

export const GetActiveContracts = createApiOperation<GetActiveContractsCustomParams, GetActiveContractsResponse>({
  paramsSchema: GetActiveContractsParamsSchema,
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const baseUrl = `${apiUrl}${endpoint}`;
    const queryParams = new URLSearchParams();

    if (params.limit !== undefined) {
      queryParams.append('limit', params.limit.toString());
    }
    if (params.streamIdleTimeoutMs !== undefined) {
      queryParams.append('stream_idle_timeout_ms', params.streamIdleTimeoutMs.toString());
    }

    const queryString = queryParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  },
  buildRequestData: async (params, client) => {
    const requestVerbose = params.verbose === undefined ? true : params.verbose;

    // Determine activeAtOffset (default to ledger end if not specified)
    let activeAtOffset = params.activeAtOffset;
    if (activeAtOffset === undefined) {
      const ledgerClient = client as LedgerJsonApiClient;
      const ledgerEnd = await ledgerClient.getLedgerEnd({});
      activeAtOffset = ledgerEnd.offset;
    }

    // If parties provided, map to filter.filtersByParty with empty objects
    const filtersByParty = params.parties && params.parties.length > 0
      ? Object.fromEntries(Array.from(new Set(params.parties)).map((party) => [party, {}]))
      : undefined;

    // Build and return the request body explicitly
    return {
      filter: filtersByParty ? { filtersByParty } : undefined,
      verbose: requestVerbose,
      activeAtOffset,
    };
  },
}); 