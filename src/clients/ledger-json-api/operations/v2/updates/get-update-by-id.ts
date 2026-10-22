import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { TransactionShapeSchema } from '../../../schemas/operations/updates';
import { buildEventFormat } from '../utils/event-format-builder';

const endpoint = '/v2/updates/update-by-id' as const;

const GetUpdateByIdParamsSchema = z.object({
  /** The ID of the update to fetch. */
  updateId: z.string().min(1, 'updateId must be a non-empty string'),
  /** Parties to read as. With a template or interface filter, an empty list falls back to the client's party list. */
  readAs: z.array(z.string()),
  /** Optional template filters applied server-side. */
  templateIds: z.array(z.string()).optional(),
  /** Optional interface filters applied server-side. */
  interfaceIds: z.array(z.string()).optional(),
  /** Include interface views in InterfaceFilter results (default true). */
  includeInterfaceView: z.boolean().optional(),
  /**
   * Include created event blobs in the result. Defaults to true without a template or interface filter and to false
   * with one.
   */
  includeCreatedEventBlob: z.boolean().optional(),
  /** Transaction shape (default TRANSACTION_SHAPE_LEDGER_EFFECTS). */
  transactionShape: TransactionShapeSchema.optional(),
});

export type GetUpdateByIdParams = z.infer<typeof GetUpdateByIdParamsSchema>;

export type GetUpdateByIdResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

/**
 * Fetches one update by its ID.
 *
 * Without `templateIds` or `interfaceIds` the request reads every event the `readAs` parties can see (a wildcard filter
 * per party) with created event blobs included. With at least one template or interface filter, only matching events
 * are returned, and created event blobs are included only when `includeCreatedEventBlob` is `true`. Interface views are
 * included by default.
 *
 * @example
 *   ```typescript
 *   const update = await client.getUpdateById({
 *     updateId: '1220...',
 *     readAs: ['party1'],
 *     interfaceIds: ['#OpenCapTableApi-v01:Fairmint.OpenCapTableApi.OcfObject:OcfObject'],
 *   });
 *   ```;
 */
export const GetUpdateById = createApiOperation<GetUpdateByIdParams, GetUpdateByIdResponse>({
  paramsSchema: GetUpdateByIdParamsSchema,
  method: 'POST',
  requestSemantics: 'read',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params, client) => {
    // Validate updateId parameter
    if (params.updateId === 'undefined' || params.updateId.trim() === '') {
      throw new Error(`Invalid updateId: "${params.updateId}". updateId must be a non-empty string.`);
    }

    const transactionShape = params.transactionShape ?? 'TRANSACTION_SHAPE_LEDGER_EFFECTS';
    const hasFilters = (params.templateIds?.length ?? 0) > 0 || (params.interfaceIds?.length ?? 0) > 0;

    // Build the request body according to the API specification
    if (hasFilters) {
      return {
        updateId: params.updateId,
        updateFormat: {
          includeTransactions: {
            eventFormat: {
              ...buildEventFormat({
                parties: params.readAs.length > 0 ? params.readAs : client.buildPartyList(),
                ...(params.templateIds !== undefined && { templateIds: params.templateIds }),
                ...(params.interfaceIds !== undefined && { interfaceIds: params.interfaceIds }),
                ...(params.includeInterfaceView !== undefined && { includeInterfaceView: params.includeInterfaceView }),
                includeCreatedEventBlob: params.includeCreatedEventBlob === true,
              }),
              verbose: true,
            },
            transactionShape,
          },
        },
      };
    }

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
                            includeCreatedEventBlob: params.includeCreatedEventBlob ?? true,
                          },
                        },
                      },
                    },
                  ],
                },
              ])
            ),
          },
          transactionShape,
        },
      },
    };
  },
});
