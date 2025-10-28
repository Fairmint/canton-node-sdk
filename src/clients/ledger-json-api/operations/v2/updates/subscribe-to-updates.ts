import { z } from 'zod';
import { WebSocketClient } from '../../../../../core/ws/WebSocketClient';
import type { LedgerJsonApiClient } from '../../../LedgerJsonApiClient.generated';
import { type JsCantonErrorSchema, type WsCantonErrorSchema } from '../../../schemas/api/errors';
import { type JsUpdateSchema, type WsUpdateSchema } from '../../../schemas/api/updates';
import { buildEventFormat } from '../utils/event-format-builder';

const path = '/v2/updates' as const;

/**
 * The `TransactionShape` enum defines the event shape for `Transaction`s and can have two different flavors AcsDelta
 * and LedgerEffects.
 *
 * ```protobuf
 * enum TransactionShape {
 *   TRANSACTION_SHAPE_ACS_DELTA = 1;
 *   TRANSACTION_SHAPE_LEDGER_EFFECTS = 2;
 * }
 * ```
 *
 * - AcsDelta
 *
 *   The transaction shape that is sufficient to maintain an accurate ACS view. This translates to create and archive
 *   events. The field witness_parties in events are populated as stakeholders, transaction filter will apply
 *   accordingly.
 * - LedgerEffects
 *
 *   The transaction shape that allows maintaining an ACS and also conveys detailed information about all exercises. This
 *   translates to create, consuming exercise and non-consuming exercise. The field witness_parties in events are
 *   populated as cumulative informees, transaction filter will apply accordingly.
 */
export enum TransactionShape {
  TRANSACTION_SHAPE_ACS_DELTA = 'TRANSACTION_SHAPE_ACS_DELTA',
  TRANSACTION_SHAPE_LEDGER_EFFECTS = 'TRANSACTION_SHAPE_LEDGER_EFFECTS',
}

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
  /** Transaction shape (default TRANSACTION_SHAPE_LEDGER_EFFECTS). */
  transactionShape: z.nativeEnum(TransactionShape).optional(),
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

    // Build party list - default to client's party list if not provided
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
        transactionShape: TransactionShape;
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
        transactionShape: validated.transactionShape ?? TransactionShape.TRANSACTION_SHAPE_LEDGER_EFFECTS,
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
              // Skip Zod validation for response types - just use the raw parsed JSON
              // Zod validation is only needed for input types, not outputs
              const parsed = raw as UpdatesWsMessage;

              // Call user's onMessage callback if provided
              if (typeof params.onMessage === 'function') {
                params.onMessage(parsed);
              }

              // Check if it's an error
              if (typeof parsed === 'object' && ('errors' in parsed || 'error' in parsed)) {
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
