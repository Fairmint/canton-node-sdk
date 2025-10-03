import type { GetUpdatesParams, IdentifierFilter } from '../../../../schemas/operations/updates';

export function normalizeIdentifierFilter(filter: IdentifierFilter): unknown {
  if ('WildcardFilter' in filter) {
    const inner = (filter as { WildcardFilter: { includeCreatedEventBlob?: boolean } }).WildcardFilter;
    return { WildcardFilter: { value: { includeCreatedEventBlob: inner?.includeCreatedEventBlob ?? false } } };
  }
  if ('InterfaceFilter' in filter) {
    const inner = (
      filter as {
        InterfaceFilter: { interfaceId: string; includeInterfaceView?: boolean; includeCreatedEventBlob?: boolean };
      }
    ).InterfaceFilter;
    return {
      InterfaceFilter: {
        value: {
          interfaceId: inner.interfaceId,
          includeInterfaceView: inner?.includeInterfaceView ?? false,
          includeCreatedEventBlob: inner?.includeCreatedEventBlob ?? false,
        },
      },
    };
  }
  if ('TemplateFilter' in filter) {
    const inner = (filter as { TemplateFilter: { templateId?: string; includeCreatedEventBlob?: boolean } })
      .TemplateFilter;
    return {
      TemplateFilter: {
        value: { templateId: inner?.templateId, includeCreatedEventBlob: inner?.includeCreatedEventBlob ?? false },
      },
    };
  }
  if ('Empty' in filter) {
    return { Empty: {} };
  }
  return filter as unknown;
}

export function normalizeUpdateFormat(p: GetUpdatesParams['updateFormat']): unknown {
  if (!p) return undefined;
  const out: any = {};
  if (p.includeTransactions) {
    out.includeTransactions = {
      transactionShape: p.includeTransactions.transactionShape,
      eventFormat: {
        filtersByParty: (() => {
          interface PartyFilter {
            cumulative: Array<{ identifierFilter: IdentifierFilter }>;
          }
          const byParty = p.includeTransactions.eventFormat.filtersByParty as unknown as Record<string, PartyFilter>;
          return Object.fromEntries(
            Object.entries(byParty).map(([party, cfg]) => [
              party,
              {
                cumulative: cfg.cumulative.map((c: { identifierFilter: IdentifierFilter }) => ({
                  identifierFilter: normalizeIdentifierFilter(c.identifierFilter),
                })),
              },
            ])
          );
        })(),
        filtersForAnyParty: p.includeTransactions.eventFormat.filtersForAnyParty
          ? {
              cumulative: p.includeTransactions.eventFormat.filtersForAnyParty.cumulative.map(
                (c: { identifierFilter: IdentifierFilter }) => ({
                  identifierFilter: normalizeIdentifierFilter(c.identifierFilter),
                })
              ),
            }
          : undefined,
        verbose: p.includeTransactions.eventFormat.verbose ?? false,
      },
    };
  }
  if (p.includeReassignments) {
    out.includeReassignments = {
      filtersByParty: (() => {
        interface PartyFilter {
          cumulative: Array<{ identifierFilter: IdentifierFilter }>;
        }
        const byParty = p.includeReassignments.filtersByParty as unknown as Record<string, PartyFilter>;
        return Object.fromEntries(
          Object.entries(byParty).map(([party, cfg]) => [
            party,
            {
              cumulative: cfg.cumulative.map((c: { identifierFilter: IdentifierFilter }) => ({
                identifierFilter: normalizeIdentifierFilter(c.identifierFilter),
              })),
            },
          ])
        );
      })(),
      filtersForAnyParty: p.includeReassignments.filtersForAnyParty
        ? {
            cumulative: p.includeReassignments.filtersForAnyParty.cumulative.map(
              (c: { identifierFilter: IdentifierFilter }) => ({
                identifierFilter: normalizeIdentifierFilter(c.identifierFilter),
              })
            ),
          }
        : undefined,
      verbose: p.includeReassignments.verbose ?? false,
    };
  }
  if (p.includeTopologyEvents) {
    out.includeTopologyEvents = p.includeTopologyEvents;
  }
  return out;
}

// Build legacy TransactionFilter + verbose for WS GetUpdatesRequest, per AsyncAPI
export function buildWsRequestFilterAndVerbose(p: GetUpdatesParams['updateFormat']): {
  filter?: unknown;
  verbose: boolean;
} {
  const verbose = Boolean(p?.includeTransactions?.eventFormat?.verbose);
  if (!p?.includeTransactions?.eventFormat?.filtersByParty && !p?.includeReassignments && !p?.includeTopologyEvents) {
    return { verbose };
  }
  const eventFormat = p?.includeTransactions?.eventFormat;
  if (!eventFormat) return { verbose };

  const byParty = eventFormat.filtersByParty as unknown as Record<
    string,
    { cumulative: Array<{ identifierFilter: IdentifierFilter }> }
  >;
  const filtersByParty = Object.fromEntries(
    Object.entries(byParty).map(([party, cfg]) => [
      party,
      {
        cumulative: cfg.cumulative.map((c) => ({ identifierFilter: normalizeIdentifierFilter(c.identifierFilter) })),
      },
    ])
  );
  const filtersForAnyParty = eventFormat.filtersForAnyParty
    ? {
        cumulative: eventFormat.filtersForAnyParty.cumulative.map((c) => ({
          identifierFilter: normalizeIdentifierFilter(c.identifierFilter),
        })),
      }
    : undefined;

  return {
    filter: {
      filtersByParty,
      filtersForAnyParty,
    },
    verbose,
  };
}
