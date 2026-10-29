/**
 * Shared utility for building eventFormat configuration used across multiple Ledger JSON API operations. This module
 * provides a consistent way to construct the complex eventFormat structure from simple parameters.
 */

import type { TransactionFormat, TransactionShape, UpdateFormat } from '../../../schemas/operations/updates';

export interface EventFormatBuilderParams {
  /** List of parties to scope the filter. At least one party is required unless `anyParty` is set. */
  parties: string[];
  /**
   * Read as every party hosted on the participant (`filtersForAnyParty`), on top of any listed `parties`. The ledger
   * user needs the `CanReadAsAnyParty` right; `ParticipantAdmin` is not enough, and the ledger rejects the request with
   * PERMISSION_DENIED otherwise. Default false.
   */
  anyParty?: boolean | undefined;
  /** Optional template filters applied server-side. */
  templateIds?: string[] | undefined;
  /** Optional interface filters applied server-side. */
  interfaceIds?: string[] | undefined;
  /** Include interface views in InterfaceFilter results (default true). */
  includeInterfaceView?: boolean | undefined;
  /** Include created event blobs in template and interface filter results (default false). */
  includeCreatedEventBlob?: boolean | undefined;
}

export type TransactionFormatBuilderParams = EventFormatBuilderParams & {
  /** Transaction shape (default TRANSACTION_SHAPE_LEDGER_EFFECTS). */
  transactionShape?: TransactionShape | undefined;
};

export type UpdateFormatBuilderParams = TransactionFormatBuilderParams & {
  /**
   * Include reassignments with the same filters (default true). With `anyParty`, reassignments also read as any party,
   * which needs `CanReadAsAnyParty` too; pass `false` when the caller ignores them.
   */
  includeReassignments?: boolean | undefined;
  /**
   * Include participant authorization topology events for the parties (default false). With `anyParty`, they cover
   * every party on the participant.
   */
  includeTopologyEvents?: boolean | undefined;
};

type FilterCumulative = Array<
  | {
      identifierFilter: {
        TemplateFilter: {
          value: {
            templateId: string;
            includeCreatedEventBlob: boolean;
          };
        };
      };
    }
  | {
      identifierFilter: {
        InterfaceFilter: {
          value: {
            interfaceId: string;
            includeInterfaceView: boolean;
            includeCreatedEventBlob: boolean;
          };
        };
      };
    }
  | {
      identifierFilter: {
        WildcardFilter: {
          value: {
            includeCreatedEventBlob: boolean;
          };
        };
      };
    }
>;

/**
 * The event format the builders produce. It fits both the OpenAPI `EventFormat` and the SDK's operation schemas;
 * `filtersByParty` is always present (empty when only `filtersForAnyParty` is used).
 */
export interface BuiltEventFormat {
  verbose: boolean;
  filtersByParty: Record<string, { cumulative: FilterCumulative }>;
  /** Present only when the format reads as any party. */
  filtersForAnyParty?: { cumulative: FilterCumulative };
}

/**
 * Builds the eventFormat object structure used in various Ledger JSON API operations. This centralizes the logic for
 * creating filtersByParty configurations from simple parameters.
 *
 * With `anyParty`, the same filters also go into `filtersForAnyParty`. Without template or interface filters that is an
 * explicit `WildcardFilter`, so every event of every hosted party is returned.
 *
 * @param params - Configuration parameters for building the event format
 * @returns An eventFormat object ready to be used in API requests
 * @throws Error if no parties are provided and `anyParty` is not set
 */
export function buildEventFormat(params: EventFormatBuilderParams): BuiltEventFormat {
  if (params.parties.length === 0 && params.anyParty !== true) {
    throw new Error('At least one party is required for event format filters');
  }

  // Build the cumulative filter array
  const buildCumulative = (): FilterCumulative => {
    const includeCreatedEventBlob = params.includeCreatedEventBlob ?? false;
    const templateFilters: FilterCumulative = (params.templateIds ?? []).map((templateId) => ({
      identifierFilter: {
        TemplateFilter: {
          value: {
            templateId,
            includeCreatedEventBlob,
          },
        },
      },
    }));
    const interfaceFilters: FilterCumulative = (params.interfaceIds ?? []).map((interfaceId) => ({
      identifierFilter: {
        InterfaceFilter: {
          value: {
            interfaceId,
            includeInterfaceView: params.includeInterfaceView ?? true,
            includeCreatedEventBlob,
          },
        },
      },
    }));
    const identifierFilters = [...templateFilters, ...interfaceFilters];

    if (identifierFilters.length > 0) {
      return identifierFilters;
    }
    if (params.includeCreatedEventBlob) {
      return [
        {
          identifierFilter: {
            WildcardFilter: {
              value: {
                includeCreatedEventBlob: true,
              },
            },
          },
        },
      ];
    }
    return [];
  };

  // An empty `cumulative` already means a wildcard, but the any-party filter spells it out so the request says what it
  // reads.
  const buildAnyPartyCumulative = (): FilterCumulative => {
    const cumulative = buildCumulative();
    if (cumulative.length > 0) return cumulative;
    return [
      {
        identifierFilter: {
          WildcardFilter: {
            value: {
              includeCreatedEventBlob: params.includeCreatedEventBlob ?? false,
            },
          },
        },
      },
    ];
  };

  return {
    verbose: false,
    filtersByParty: Object.fromEntries(
      params.parties.map((p) => [
        p,
        {
          cumulative: buildCumulative(),
        },
      ])
    ),
    ...(params.anyParty === true && { filtersForAnyParty: { cumulative: buildAnyPartyCumulative() } }),
  };
}

/**
 * Builds a transaction format: the event format plus a transaction shape. The result also fits the `transactionFormat`
 * of `submitAndWaitForTransaction`.
 *
 * @param params - Event format parameters and an optional `transactionShape`
 * @returns A transaction format using `TRANSACTION_SHAPE_LEDGER_EFFECTS` unless a shape is given
 * @throws Error if no parties are provided and `anyParty` is not set
 */
export function buildTransactionFormat(
  params: TransactionFormatBuilderParams
): TransactionFormat & { eventFormat: BuiltEventFormat } {
  return {
    eventFormat: buildEventFormat(params),
    transactionShape: params.transactionShape ?? 'TRANSACTION_SHAPE_LEDGER_EFFECTS',
  };
}

/**
 * Builds the update format that `subscribeToUpdates` sends, so it can also be passed as the `updateFormat` of
 * `getUpdateByOffset`. Reassignments reuse the same party filters; topology events cover the same parties.
 *
 * With `anyParty`, reassignments carry the any-party filter too (an empty reassignment format is rejected), and
 * topology events ask for every party (an empty list), so every part of the request needs `CanReadAsAnyParty`.
 *
 * @param params - Transaction format parameters and the optional reassignment and topology switches
 * @returns An update format with transactions, reassignments (unless disabled) and topology events (when enabled)
 * @throws Error if no parties are provided and `anyParty` is not set
 */
export function buildUpdateFormat(params: UpdateFormatBuilderParams): UpdateFormat {
  const includeTransactions = buildTransactionFormat(params);
  const { filtersByParty, filtersForAnyParty } = includeTransactions.eventFormat;

  return {
    includeTransactions,
    ...(params.includeReassignments !== false && {
      includeReassignments: {
        filtersByParty,
        ...(filtersForAnyParty !== undefined && { filtersForAnyParty }),
        verbose: false,
      },
    }),
    ...(params.includeTopologyEvents === true && {
      includeTopologyEvents: {
        includeParticipantAuthorizationEvents: {
          parties: params.anyParty === true ? [] : params.parties,
        },
      },
    }),
  };
}
