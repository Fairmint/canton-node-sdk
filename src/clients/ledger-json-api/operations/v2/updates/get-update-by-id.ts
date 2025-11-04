import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const endpoint = '/v2/updates/update-by-id' as const;

// Define the parameters that the operation accepts
export interface GetUpdateByIdParams {
  /** The ID of the update to fetch. */
  updateId: string;
  /** Parties to read as (optional). */
  readAs: string[];
}

export type GetUpdateByIdResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

export const GetUpdateById = createApiOperation<GetUpdateByIdParams, GetUpdateByIdResponse>({
  paramsSchema: z.object({
    updateId: z.string().min(1, 'updateId must be a non-empty string'),
    readAs: z.array(z.string()),
  }),
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params) => {
    // Validate updateId parameter
    if (params.updateId === 'undefined' || params.updateId.trim() === '') {
      throw new Error(`Invalid updateId: "${params.updateId}". updateId must be a non-empty string.`);
    }

    // Build the request body according to the API specification
    return {
      updateId: params.updateId,
      updateFormat: {
        includeTransactions: {
          eventFormat: {
            verbose: true,
            filtersByParty: Object.fromEntries(
              params.readAs.map((party) => [
                party,
                {
                  cumulative: [
                    {
                      identifierFilter: {
                        WildcardFilter: {
                          value: {
                            includeCreatedEventBlob: true,
                          },
                        },
                      },
                    },
                  ],
                },
              ])
            ),
          },
          transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS',
        },
      },
    };
  },
});
