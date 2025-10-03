import { type z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import type { LedgerJsonApiClient } from '../../../LedgerJsonApiClient.generated';
import { GetActiveContractsParamsSchema } from '../../../schemas/operations';

const endpoint = '/v2/state/active-contracts' as const;

export type GetActiveContractsParams = paths[typeof endpoint]['post']['requestBody']['content']['application/json'];
export type GetActiveContractsResponse =
  paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

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
    const requestVerbose = params.verbose ?? true;

    // Determine activeAtOffset (default to ledger end if not specified)
    let { activeAtOffset } = params;
    if (activeAtOffset === undefined) {
      const ledgerClient = client as LedgerJsonApiClient;
      const ledgerEnd = await ledgerClient.getLedgerEnd({});
      activeAtOffset = ledgerEnd.offset;
    }

    // Build filter structure based on parties and template IDs
    interface FilterStructure {
      filtersByParty?: Record<string, PartyFilter>;
      filtersForAnyParty?: { cumulative: TemplateFilterArray };
    }
    interface PartyFilter {
      cumulative?: TemplateFilterArray;
    }
    type TemplateFilterArray = Array<{
      identifierFilter: {
        TemplateFilter: {
          value: {
            templateId: string;
            includeCreatedEventBlob: boolean;
          };
        };
      };
    }>;

    let filter: FilterStructure | undefined = undefined;

    if (params.parties && params.parties.length > 0) {
      const uniqueParties = Array.from(new Set(params.parties));
      const filtersByParty: Record<string, PartyFilter> = {};

      for (const party of uniqueParties) {
        let partyFilter: PartyFilter = {};

        if (params.templateIds && params.templateIds.length > 0) {
          // Create template filters for this party
          const cumulative = params.templateIds.map((templateId) => ({
            identifierFilter: {
              TemplateFilter: {
                value: {
                  templateId,
                  includeCreatedEventBlob: false,
                },
              },
            },
          }));

          partyFilter = { cumulative };
        } else {
          // No template filters specified, use empty filter (wildcard)
          partyFilter = {};
        }

        filtersByParty[party] = partyFilter;
      }

      filter = { filtersByParty };
    } else if (params.templateIds && params.templateIds.length > 0) {
      // Template filters for any party
      const cumulative = params.templateIds.map((templateId) => ({
        identifierFilter: {
          TemplateFilter: {
            value: {
              templateId,
              includeCreatedEventBlob: false,
            },
          },
        },
      }));

      filter = {
        filtersForAnyParty: { cumulative },
      };
    }

    // Build and return the request body explicitly
    return {
      filter,
      verbose: requestVerbose,
      activeAtOffset,
    };
  },
});
