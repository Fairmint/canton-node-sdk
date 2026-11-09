import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { TransactionShapeSchema } from '../../../schemas/operations/updates';
import { buildEventFormat } from '../utils/event-format-builder';
import { partyScopeGuard, type PartyScope } from '../utils/party-scope';

const endpoint = '/v2/updates/update-by-id' as const;

const GetUpdateByIdFilterSchema = z.object({
  /** The ID of the update to fetch. */
  updateId: z.string().min(1, 'updateId must be a non-empty string'),
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

/** Either `readAs` (a party list) or `anyParty: true` (every party the participant hosts), never both. */
const GetUpdateByIdParamsSchema = partyScopeGuard('readAs').pipe(
  z.discriminatedUnion('anyParty', [
    GetUpdateByIdFilterSchema.extend({
      /** Parties to read as. With a template or interface filter, an empty list falls back to the client's party list. */
      readAs: z.array(z.string()),
      anyParty: z.undefined().optional(),
    }),
    GetUpdateByIdFilterSchema.extend({
      /** Read as every party the participant hosts (`filtersForAnyParty`). Needs the `CanReadAsAnyParty` right. */
      anyParty: z.literal(true),
      readAs: z.undefined().optional(),
    }),
  ])
);

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
 * Pass `anyParty: true` instead of `readAs` to read the update as every party the participant hosts
 * (`filtersForAnyParty`, which needs the `CanReadAsAnyParty` right); the filters and defaults are the same.
 *
 * @example
 *   ```typescript
 *   const update = await client.getUpdateById({
 *     updateId: '1220...',
 *     readAs: ['party1'],
 *     interfaceIds: ['#example-package:Example.Module:Asset'],
 *   });
 *   const everyPartysView = await client.getUpdateById({ updateId: '1220...', anyParty: true });
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
      const scope: PartyScope =
        params.anyParty === true
          ? { anyParty: true }
          : { parties: params.readAs.length > 0 ? params.readAs : client.buildPartyList() };
      return {
        updateId: params.updateId,
        updateFormat: {
          includeTransactions: {
            eventFormat: {
              ...buildEventFormat({
                ...scope,
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

    const wildcard = {
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
    };

    return {
      updateId: params.updateId,
      updateFormat: {
        includeTransactions: {
          eventFormat:
            params.anyParty === true
              ? { verbose: true, filtersByParty: {}, filtersForAnyParty: wildcard }
              : {
                  verbose: true,
                  filtersByParty: Object.fromEntries(params.readAs.map((party) => [party, wildcard])),
                },
          transactionShape,
        },
      },
    };
  },
});
