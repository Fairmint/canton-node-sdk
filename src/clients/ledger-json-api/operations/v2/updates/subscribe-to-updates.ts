import { z } from 'zod';
import { WebSocketClient } from '../../../../../core/ws/WebSocketClient';
import { WebSocketErrorUtils } from '../../../../../core/ws/WebSocketErrorUtils';
import type { LedgerJsonApiClient } from '../../../LedgerJsonApiClient.generated';
import { JsCantonErrorSchema, WsCantonErrorSchema } from '../../../schemas/api/errors';
import { JsUpdateSchema, WsUpdateSchema } from '../../../schemas/api/updates';
import { buildEventFormat } from '../utils/event-format-builder';

const path = '/v2/updates' as const;

const SubscribeToUpdatesParamsSchema = z.object({
  /** Optional list of parties to scope the filter. */
  parties: z.array(z.string()).optional(),
  /** Optional template filters applied server-side. */
  templateIds: z.array(z.string()).optional(),
  /** Include created event blob in TemplateFilter results (default false). */
  includeCreatedEventBlob: z.boolean().optional(),
  /** Beginning of the requested ledger section. Defaults to ledger end if not provided. */
  beginExclusive: z.number().optional(),
  /** End of the requested ledger section (optional). */
  endInclusive: z.number().optional(),
  /** Include reassignments in the stream (default true). */
  includeReassignments: z.boolean().optional(),
  /** Include topology events in the stream (default false). */
  includeTopologyEvents: z.boolean().optional(),
});

export type SubscribeToUpdatesParams = z.infer<typeof SubscribeToUpdatesParamsSchema> & {
  /** Optional per-message callback to consume updates as they arrive. */
  onMessage?: (message: UpdatesWsMessage) => void;
};

export type UpdatesWsMessage =
  | { update: z.infer<typeof JsUpdateSchema> }
  | { update: z.infer<typeof WsUpdateSchema> }
  | z.infer<typeof JsCantonErrorSchema>
  | z.infer<typeof WsCantonErrorSchema>;

export class SubscribeToUpdates {
  constructor(private readonly client: LedgerJsonApiClient) {}

  public async connect(params: SubscribeToUpdatesParams): Promise<void> {
    const validated = SubscribeToUpdatesParamsSchema.parse(params);

    // Determine beginExclusive (default to ledger end if not specified)
    let { beginExclusive } = validated;
    if (beginExclusive === undefined) {
      const ledgerEnd = await this.client.getLedgerEnd({});
      beginExclusive = ledgerEnd.offset;
    }

    // Build party list
    const partyList =
      validated.parties && validated.parties.length > 0 ? validated.parties : this.client.buildPartyList();

    // Build event format
    const eventFormat = buildEventFormat({
      parties: partyList,
      ...(validated.templateIds !== undefined && { templateIds: validated.templateIds }),
      ...(validated.includeCreatedEventBlob !== undefined && {
        includeCreatedEventBlob: validated.includeCreatedEventBlob,
      }),
    });

    // Build update format with optional features
    const updateFormat: {
      includeTransactions?: {
        eventFormat: ReturnType<typeof buildEventFormat>;
        transactionShape: string;
      };
      includeReassignments?: {
        filtersByParty: ReturnType<typeof buildEventFormat>['filtersByParty'];
        verbose: boolean;
      };
      includeTopologyEvents?: {
        includeParticipantAuthorizationEvents: {
          parties: string[];
        };
      };
    } = {
      includeTransactions: {
        eventFormat,
        transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
      },
    };

    // Add reassignments if enabled (default true)
    if (validated.includeReassignments !== false) {
      updateFormat.includeReassignments = {
        filtersByParty: eventFormat.filtersByParty,
        verbose: false,
      };
    }

    // Add topology events if enabled (default false)
    if (validated.includeTopologyEvents === true) {
      updateFormat.includeTopologyEvents = {
        includeParticipantAuthorizationEvents: {
          parties: partyList,
        },
      };
    }

    // Build request message
    const requestMessage = {
      beginExclusive,
      endInclusive: validated.endInclusive,
      verbose: false,
      updateFormat,
    };

    const wsClient = new WebSocketClient(this.client);

    return new Promise<void>((resolve, reject) => {
      let settled = false;

      void wsClient
        .connect<typeof requestMessage, unknown>(path, requestMessage, {
          onMessage: (raw) => {
            try {
              const parsed = WebSocketErrorUtils.parseUnion(
                raw,
                z.union([
                  z.object({ update: z.union([JsUpdateSchema, WsUpdateSchema]) }),
                  JsCantonErrorSchema,
                  WsCantonErrorSchema,
                ]),
                'SubscribeToUpdates'
              ) as UpdatesWsMessage;

              // Call user's onMessage callback if provided
              if (typeof params.onMessage === 'function') {
                params.onMessage(parsed);
              }

              // Check if it's an error
              if ('errors' in parsed || 'error' in parsed) {
                if (!settled) {
                  settled = true;
                  reject(parsed as unknown as Error);
                }
              }
            } catch (e) {
              if (!settled) {
                settled = true;
                reject(e as Error);
              }
            }
          },
          onError: (err) => {
            if (!settled) {
              settled = true;
              reject(err as Error);
            }
          },
          onClose: () => {
            if (!settled) {
              settled = true;
              resolve();
            }
          },
        })
        .catch((err) => {
          if (!settled) {
            settled = true;
            reject(err as Error);
          }
        });
    });
  }
}
