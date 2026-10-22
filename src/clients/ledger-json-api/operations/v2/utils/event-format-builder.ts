/**
 * Shared utility for building eventFormat configuration used across multiple Ledger JSON API operations. This module
 * provides a consistent way to construct the complex eventFormat structure from simple parameters.
 */

import type { TransactionFormat, TransactionShape, UpdateFormat } from '../../../schemas/operations/updates';

export interface EventFormatBuilderParams {
  /** List of parties to scope the filter. At least one party is required. */
  parties: string[];
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
  /** Include reassignments with the same filters (default true). */
  includeReassignments?: boolean | undefined;
  /** Include participant authorization topology events for the parties (default false). */
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
 * Builds the eventFormat object structure used in various Ledger JSON API operations. This centralizes the logic for
 * creating filtersByParty configurations from simple parameters.
 *
 * @param params - Configuration parameters for building the event format
 * @returns An eventFormat object ready to be used in API requests
 * @throws Error if no parties are provided
 */
export function buildEventFormat(params: EventFormatBuilderParams): {
  verbose: boolean;
  filtersByParty: Record<string, { cumulative: FilterCumulative }>;
} {
  if (params.parties.length === 0) {
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
  };
}

/**
 * Builds a transaction format: the event format plus a transaction shape. The result also fits the `transactionFormat`
 * of `submitAndWaitForTransaction`.
 *
 * @param params - Event format parameters and an optional `transactionShape`
 * @returns A transaction format using `TRANSACTION_SHAPE_LEDGER_EFFECTS` unless a shape is given
 * @throws Error if no parties are provided
 */
export function buildTransactionFormat(params: TransactionFormatBuilderParams): TransactionFormat {
  return {
    eventFormat: buildEventFormat(params),
    transactionShape: params.transactionShape ?? 'TRANSACTION_SHAPE_LEDGER_EFFECTS',
  };
}

/**
 * Builds the update format that `subscribeToUpdates` sends, so it can also be passed as the `updateFormat` of
 * `getUpdateByOffset`. Reassignments reuse the same party filters; topology events cover the same parties.
 *
 * @param params - Transaction format parameters and the optional reassignment and topology switches
 * @returns An update format with transactions, reassignments (unless disabled) and topology events (when enabled)
 * @throws Error if no parties are provided
 */
export function buildUpdateFormat(params: UpdateFormatBuilderParams): UpdateFormat {
  const includeTransactions = buildTransactionFormat(params);

  return {
    includeTransactions,
    ...(params.includeReassignments !== false && {
      includeReassignments: {
        filtersByParty: includeTransactions.eventFormat.filtersByParty,
        verbose: false,
      },
    }),
    ...(params.includeTopologyEvents === true && {
      includeTopologyEvents: {
        includeParticipantAuthorizationEvents: {
          parties: params.parties,
        },
      },
    }),
  };
}
