/**
 * Shared utility for building eventFormat configuration used across multiple Ledger JSON API operations. This module
 * provides a consistent way to construct the complex eventFormat structure from simple parameters.
 */

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
