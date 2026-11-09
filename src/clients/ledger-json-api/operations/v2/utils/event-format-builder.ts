/**
 * Shared utility for building eventFormat configuration used across multiple Ledger JSON API operations. This module
 * provides a consistent way to construct the complex eventFormat structure from simple parameters.
 *
 * Every builder reads either a party list or every party: {@link EventFormatBuilderParams} (`{ parties: [...] }`) builds
 * `filtersByParty`, and {@link AnyPartyEventFormatBuilderParams} (`{ anyParty: true }`) builds `filtersForAnyParty`,
 * which reads as every party the participant hosts. The types reject an object with both keys, and so do the builders
 * at run time.
 */

import type { TransactionFormat, TransactionShape, UpdateFormat } from '../../../schemas/operations/updates';

export type { AnyPartyScope, PartiesScope, PartyScope } from './party-scope';

/** Filter options shared by every format builder, apart from whose events are read. */
export interface EventFilterOptions {
  /** Optional template filters applied server-side. */
  templateIds?: string[] | undefined;
  /** Optional interface filters applied server-side. */
  interfaceIds?: string[] | undefined;
  /** Include interface views in InterfaceFilter results (default true). */
  includeInterfaceView?: boolean | undefined;
  /** Include created event blobs in template, interface and wildcard filter results (default false). */
  includeCreatedEventBlob?: boolean | undefined;
  /** Ask for verbose values (record field labels and type ids) (default false). */
  verbose?: boolean | undefined;
}

/** Party-list parameters of {@link buildEventFormat} (`filtersByParty`). */
export interface EventFormatBuilderParams extends EventFilterOptions {
  /** List of parties to scope the filter. At least one party is required. */
  parties: string[];
  /** Not allowed with `parties`: pass {@link AnyPartyEventFormatBuilderParams} to read as every party instead. */
  anyParty?: never;
}

/**
 * Any-party parameters of {@link buildEventFormat} (`filtersForAnyParty`): every party the participant hosts, including
 * parties allocated later. Needs the user's `CanReadAsAnyParty` right.
 */
export interface AnyPartyEventFormatBuilderParams extends EventFilterOptions {
  /** Read as every party the participant hosts. */
  anyParty: true;
  /** Not allowed with `anyParty`. */
  parties?: never;
}

export type TransactionFormatBuilderParams = EventFormatBuilderParams & {
  /** Transaction shape (default TRANSACTION_SHAPE_LEDGER_EFFECTS). */
  transactionShape?: TransactionShape | undefined;
};

/** {@link buildTransactionFormat} for every party the participant hosts; see {@link AnyPartyEventFormatBuilderParams}. */
export type AnyPartyTransactionFormatBuilderParams = AnyPartyEventFormatBuilderParams & {
  /** Transaction shape (default TRANSACTION_SHAPE_LEDGER_EFFECTS). */
  transactionShape?: TransactionShape | undefined;
};

export type UpdateFormatBuilderParams = TransactionFormatBuilderParams & {
  /** Include reassignments with the same filters (default true). */
  includeReassignments?: boolean | undefined;
  /** Include participant authorization topology events for the parties (default false). */
  includeTopologyEvents?: boolean | undefined;
};

/** {@link buildUpdateFormat} for every party the participant hosts; see {@link AnyPartyEventFormatBuilderParams}. */
export type AnyPartyUpdateFormatBuilderParams = AnyPartyTransactionFormatBuilderParams & {
  /** Include reassignments with the same filters (default true). */
  includeReassignments?: boolean | undefined;
  /** Include participant authorization topology events for every party (default false). */
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

/** The event format the builders produce. `filtersForAnyParty` is present only for `{ anyParty: true }`. */
export interface BuiltEventFormat {
  verbose: boolean;
  /** One entry per listed party; empty for `{ anyParty: true }`. */
  filtersByParty: Record<string, { cumulative: FilterCumulative }>;
  /** The filters for every party on the participant; present only for `{ anyParty: true }`. */
  filtersForAnyParty?: { cumulative: FilterCumulative };
}

function buildIdentifierFilters(params: EventFilterOptions): FilterCumulative {
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
  return [...templateFilters, ...interfaceFilters];
}

function wildcardFilter(includeCreatedEventBlob: boolean): FilterCumulative {
  return [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob } } } }];
}

/**
 * Builds the eventFormat object structure used in various Ledger JSON API operations.
 *
 * - `{ parties }` builds `filtersByParty`, one entry per party. Without template or interface filters the cumulative list
 *   is empty (a wildcard), or an explicit wildcard filter when `includeCreatedEventBlob` is true.
 * - `{ anyParty: true }` builds `filtersForAnyParty` and leaves `filtersByParty` empty. Without template or interface
 *   filters it always sends an explicit wildcard filter carrying `includeCreatedEventBlob`.
 *
 * @param params - Whose events to read, and the filter options
 * @returns An eventFormat object ready to be used in API requests
 * @throws Error if neither a non-empty `parties` list nor `anyParty: true` is given, or if both are
 */
export function buildEventFormat(
  params: EventFormatBuilderParams | AnyPartyEventFormatBuilderParams
): BuiltEventFormat {
  // The types already exclude both forms at once; JavaScript callers and casts are checked here.
  const scope: Partial<Record<'anyParty' | 'parties', unknown>> = params;
  if (scope.anyParty !== undefined && scope.parties !== undefined) {
    throw new Error('Pass either anyParty: true or parties to the event format builder, not both');
  }
  const verbose = params.verbose ?? false;
  const identifierFilters = buildIdentifierFilters(params);

  if (params.anyParty === true) {
    return {
      verbose,
      filtersByParty: {},
      filtersForAnyParty: {
        cumulative:
          identifierFilters.length > 0 ? identifierFilters : wildcardFilter(params.includeCreatedEventBlob ?? false),
      },
    };
  }
  if (scope.anyParty !== undefined) {
    throw new Error('anyParty must be true when it is given');
  }
  if (!Array.isArray(scope.parties) || scope.parties.length === 0) {
    throw new Error('At least one party is required for event format filters');
  }

  const buildCumulative = (): FilterCumulative => {
    if (identifierFilters.length > 0) {
      return identifierFilters;
    }
    if (params.includeCreatedEventBlob) {
      return wildcardFilter(true);
    }
    return [];
  };

  return {
    verbose,
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
 * @throws Error if neither a non-empty `parties` list nor `anyParty: true` is given, or if both are
 */
export function buildTransactionFormat(
  params: TransactionFormatBuilderParams | AnyPartyTransactionFormatBuilderParams
): TransactionFormat {
  return {
    eventFormat: buildEventFormat(params),
    transactionShape: params.transactionShape ?? 'TRANSACTION_SHAPE_LEDGER_EFFECTS',
  };
}

/**
 * Builds the update format that `subscribeToUpdates` sends, so it can also be passed as the `updateFormat` of
 * `getUpdateByOffset`, `getUpdatesPage`, `getRawUpdatesPage` and `subscribeToRawUpdates`. Reassignments reuse the same
 * filters. Topology events cover the same parties: the listed ones, or, with `anyParty`, every party (an empty
 * participant-authorization format, which the Ledger API reads as all parties).
 *
 * @param params - Transaction format parameters and the optional reassignment and topology switches
 * @returns An update format with transactions, reassignments (unless disabled) and topology events (when enabled)
 * @throws Error if neither a non-empty `parties` list nor `anyParty: true` is given, or if both are
 */
export function buildUpdateFormat(params: UpdateFormatBuilderParams | AnyPartyUpdateFormatBuilderParams): UpdateFormat {
  const includeTransactions = buildTransactionFormat(params);
  const { eventFormat } = includeTransactions;

  return {
    includeTransactions,
    ...(params.includeReassignments !== false && {
      includeReassignments: {
        filtersByParty: eventFormat.filtersByParty,
        ...(eventFormat.filtersForAnyParty !== undefined && { filtersForAnyParty: eventFormat.filtersForAnyParty }),
        verbose: eventFormat.verbose ?? false,
      },
    }),
    ...(params.includeTopologyEvents === true && {
      includeTopologyEvents: {
        includeParticipantAuthorizationEvents: params.anyParty === true ? {} : { parties: [...params.parties] },
      },
    }),
  };
}
