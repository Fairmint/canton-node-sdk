/**
 * Shared utility for building eventFormat configuration used across multiple Ledger JSON API operations.
 * This module provides a consistent way to construct the complex eventFormat structure from simple parameters.
 */

export interface EventFormatBuilderParams {
  /** List of parties to scope the filter. */
  parties: string[];
  /** Optional template filters applied server-side. */
  templateIds?: string[] | undefined;
  /** Include created event blob in TemplateFilter results (default false). */
  includeCreatedEventBlob?: boolean | undefined;
}

/**
 * Builds the eventFormat object structure used in various Ledger JSON API operations.
 * This centralizes the logic for creating filtersByParty configurations from simple parameters.
 * 
 * @param params - Configuration parameters for building the event format
 * @returns An eventFormat object ready to be used in API requests
 */
export function buildEventFormat(params: EventFormatBuilderParams): {
  verbose: boolean;
  filtersByParty: Record<
    string,
    {
      cumulative: Array<{
        identifierFilter: {
          TemplateFilter: {
            value: {
              templateId: string;
              includeCreatedEventBlob: boolean;
            };
          };
        };
      }>;
    }
  >;
} {
  return {
    verbose: false,
    filtersByParty: Object.fromEntries(
      params.parties.map((p) => [
        p,
        {
          cumulative:
            params.templateIds && params.templateIds.length > 0
              ? params.templateIds.map((templateId) => ({
                  identifierFilter: {
                    TemplateFilter: {
                      value: {
                        templateId,
                        includeCreatedEventBlob: params.includeCreatedEventBlob ?? false,
                      },
                    },
                  },
                }))
              : [],
        },
      ])
    ),
  };
}

