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
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: async (params, client) => {
    if (params.verbose === undefined) {
      params.verbose = true;
    }
    
    // If activeAtOffset is not specified, default to ledger end offset
    if (params.activeAtOffset === undefined) {
      const ledgerClient = client as LedgerJsonApiClient;
      const ledgerEnd = await ledgerClient.getLedgerEnd({});
      return {
        ...params,
        activeAtOffset: ledgerEnd.offset,
      };
    }
    return params;
  },
}); 