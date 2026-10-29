import { z } from 'zod';
import { ApiError } from '../../../../../core/errors';
import {
  WebSocketClient,
  type WebSocketOptions,
  type WebSocketSubscription,
} from '../../../../../core/ws/WebSocketClient';
import type { LedgerJsonApiClient } from '../../../LedgerJsonApiClient.generated';
import {
  JsCantonErrorSchema,
  WsCantonErrorSchema,
  type JsCantonError,
  type WsCantonError,
} from '../../../schemas/api/errors';
import { WsUpdateSchema } from '../../../schemas/api/updates';
import { buildUpdateFormat } from '../utils/event-format-builder';

const path = '/v2/updates' as const;

/** Close code the participant sends after the last update of a bounded stream. */
const NORMAL_CLOSE_CODE = 1000;

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
  /**
   * Optional list of parties to scope the filter. Without `anyParty`, an empty or missing list falls back to the
   * client's party list.
   */
  parties: z.array(z.string()).optional(),
  /**
   * Read as every party hosted on the participant (`filtersForAnyParty`), plus any listed `parties`. The client's party
   * list is not added. The ledger user needs the `CanReadAsAnyParty` right (see `resolveLedgerVisibility`);
   * reassignments and topology events then read as any party too.
   */
  anyParty: z.boolean().optional(),
  /** Optional template filters applied server-side. */
  templateIds: z.array(z.string()).optional(),
  /** Optional interface filters applied server-side. */
  interfaceIds: z.array(z.string()).optional(),
  /** Include interface views in InterfaceFilter results (default true). */
  includeInterfaceView: z.boolean().optional(),
  /** Include created event blobs in template and interface filter results (default false). */
  includeCreatedEventBlob: z.boolean().optional(),
  /** Beginning of the requested ledger section. Defaults to ledger end if not provided. */
  beginExclusive: z.number().optional(),
  /**
   * End of the requested ledger section (optional).
   *
   * When specified: Creates a bounded subscription that closes after reaching this offset. When omitted: Creates a
   * persistent streaming connection that remains open indefinitely, delivering real-time updates as they occur on the
   * ledger. The connection will remain active until manually closed or an error occurs.
   *
   * Use bounded subscriptions (with endInclusive) when catching up on historical data. Use unbounded subscriptions
   * (without endInclusive) for real-time streaming.
   */
  endInclusive: z.number().optional(),
  /** Include reassignments in the stream (default true). */
  includeReassignments: z.boolean().optional(),
  /** Include topology events in the stream (default false). */
  includeTopologyEvents: z.boolean().optional(),
  /** Transaction shape (default TRANSACTION_SHAPE_LEDGER_EFFECTS). */
  transactionShape: z.nativeEnum(TransactionShape).optional(),
  /**
   * Reject with an {@link UpdatesStreamClosedError} when the stream closes without completing: a close the token refresh
   * started, or a peer or network close with a code other than 1000. Default false, which resolves on every close.
   */
  rejectOnAbnormalClose: z.boolean().optional(),
});

/** Who started a close of the updates stream. */
export type UpdatesStreamCloseInitiator =
  /** The participant, a proxy or the network (the server's normal end of a bounded stream is code 1000). */
  | 'peer'
  /** The proactive token refresh (`onTokenRefreshNeeded`), whatever close code it used. */
  | 'token-refresh';

/** How the updates stream closed. */
export interface UpdatesStreamCloseInfo {
  readonly code: number;
  readonly reason: string;
  readonly initiatedBy: UpdatesStreamCloseInitiator;
  /** True only for a peer close with code 1000, which is how the participant ends a bounded stream. */
  readonly complete: boolean;
  /**
   * The highest offset among frames whose `onMessage` completed, including `OffsetCheckpoint` frames. Every frame
   * received before the close has been handled by then. `undefined` when no frame arrived.
   */
  readonly lastOffset: number | undefined;
}

/**
 * The updates stream closed before it completed, so the offsets after `lastOffset` (or after `beginExclusive` when it
 * is `undefined`) up to the requested end were not delivered. Retry by subscribing again from `lastOffset`.
 */
export class UpdatesStreamClosedError extends ApiError {
  public override readonly name: string;
  /** Always true: the stream can be resumed from `lastOffset`. */
  public readonly retryable = true;
  public readonly closeCode: number;
  public readonly closeReason: string;
  public readonly initiatedBy: UpdatesStreamCloseInitiator;
  public readonly lastOffset: number | undefined;

  constructor(info: UpdatesStreamCloseInfo) {
    super(
      `Ledger updates stream closed before it completed [${info.code}]${info.reason === '' ? '' : `: ${info.reason}`} (initiated by ${info.initiatedBy}, last offset ${info.lastOffset ?? 'none'})`,
      undefined,
      undefined,
      {
        closeCode: info.code,
        closeReason: info.reason,
        initiatedBy: info.initiatedBy,
        lastOffset: info.lastOffset ?? null,
      }
    );
    this.name = 'UpdatesStreamClosedError';
    this.closeCode = info.code;
    this.closeReason = info.reason;
    this.initiatedBy = info.initiatedBy;
    this.lastOffset = info.lastOffset;
  }
}

export type SubscribeToUpdatesParams = z.infer<typeof SubscribeToUpdatesParamsSchema> & {
  /** Optional per-message callback to consume updates as they arrive. */
  onMessage?: (message: UpdatesWsMessage) => void | Promise<void>;

  /**
   * Called when the token is about to expire and refresh is scheduled. Use this to prepare for reconnection (e.g., save
   * current processing state). The subscription will close shortly after this callback.
   */
  onTokenExpiring?: WebSocketOptions['onTokenExpiring'];

  /**
   * Called when token refresh timer fires and reconnection is needed. Return close code and reason, or void for
   * defaults. After this callback returns, the WebSocket will close. The caller should catch the close, clear the
   * token, and create a new subscription from the last processed offset.
   */
  onTokenRefreshNeeded?: WebSocketOptions['onTokenRefreshNeeded'];

  /**
   * Called once when the stream closes without an error having been reported first, before the returned promise
   * settles. Use `complete` and `lastOffset` to tell a finished bounded window from an interrupted one. A throw rejects
   * the subscription with that error.
   */
  onClose?: (info: UpdatesStreamCloseInfo) => void;
};

/**
 * Runtime wire union for `/v2/updates` WebSocket frames.
 *
 * AsyncAPI-only: value-wrapped {@link WsUpdateSchema} (`Transaction` / `Reassignment` / `TopologyTransaction` /
 * `OffsetCheckpoint`). REST `JsTransaction`-named wrappers stay on REST response schemas, not this WS stream.
 */
export const UpdatesWsMessageSchema = z.union([
  // Preserve unknown top-level WS frame fields (future Ledger extensions beyond `update`).
  z.looseObject({ update: WsUpdateSchema }),
  JsCantonErrorSchema,
  WsCantonErrorSchema,
]);

export type UpdatesWsMessage = z.infer<typeof UpdatesWsMessageSchema>;

/**
 * The ledger offset an updates frame carries: a transaction, reassignment, topology transaction or `OffsetCheckpoint`.
 * A reader may advance its resume cursor to it once the frame is handled. Error frames have none.
 */
export function getUpdateOffset(message: UpdatesWsMessage): number | undefined {
  if (!('update' in message)) return undefined;
  const { update } = message;
  if ('Transaction' in update) return update.Transaction.value.offset;
  if ('Reassignment' in update) return update.Reassignment.value.offset;
  if ('TopologyTransaction' in update) return update.TopologyTransaction.value.offset;
  return update.OffsetCheckpoint.value.offset;
}

/** Format Zod issues for ApiError messages / Slack logs. */
function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const issuePath = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${issuePath}: ${issue.message}`;
    })
    .join('; ');
}

/**
 * Subscribes to ledger updates via WebSocket connection.
 *
 * Supports two modes of operation:
 *
 * 1. **Bounded subscription**: Specify both `beginExclusive` and `endInclusive` to fetch a specific range of historical
 *    transactions. The connection closes after reaching `endInclusive`.
 * 2. **Persistent streaming**: Specify only `beginExclusive` (or omit both) to create a long-lived WebSocket connection
 *    that streams real-time updates indefinitely. The connection remains open until manually closed via the returned
 *    subscription object or an error occurs.
 *
 * **Close semantics.** The returned promise rejects on a Canton error frame, a socket error, an invalid frame or a
 * failing `onMessage`. By default it resolves on every other close, including a close that the proactive token refresh
 * started (code 4000 unless `onTokenRefreshNeeded` says otherwise) and an abnormal network close such as 1006. A
 * bounded reader that treats a resolved promise as "window complete" would then skip the rest of the window. To detect
 * that:
 *
 * - Pass `rejectOnAbnormalClose: true` to reject with a retryable {@link UpdatesStreamClosedError} carrying the close
 *   code, who started the close and the last handled offset; only a peer close with code 1000 resolves.
 * - Or pass `onClose` to receive the same {@link UpdatesStreamCloseInfo} before the promise resolves.
 *
 * Every frame with an offset, `OffsetCheckpoint` included, reaches `onMessage`; {@link getUpdateOffset} reads it.
 *
 * **Any party.** With `anyParty: true` the request reads as every party hosted on the participant, which needs the
 * `CanReadAsAnyParty` user right.
 *
 * @example
 *   ```typescript
 *   // Bounded subscription (historical data)
 *   await client.subscribeToUpdates({
 *     beginExclusive: 1000,
 *     endInclusive: 2000,
 *     parties: ['party1'],
 *     onMessage: (msg) => console.log(msg)
 *   });
 *
 *   // Persistent streaming (real-time updates)
 *   await client.subscribeToUpdates({
 *     beginExclusive: 2000,
 *     // endInclusive omitted - connection stays open
 *     parties: ['party1'],
 *     onMessage: (msg) => console.log(msg)
 *   });
 *   ```;
 */
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

    // Build party list - default to client's party list if not provided. An any-party reader lists only the parties the
    // caller asked for: the any-party filter already covers the client's parties.
    const anyParty = validated.anyParty === true;
    const partyList = anyParty
      ? (validated.parties ?? [])
      : validated.parties && validated.parties.length > 0
        ? validated.parties
        : this.client.buildPartyList();

    // Build update format: transactions, plus reassignments (default) and topology events (opt-in)
    const updateFormat = buildUpdateFormat({
      parties: partyList,
      ...(anyParty && { anyParty }),
      ...(validated.templateIds !== undefined && { templateIds: validated.templateIds }),
      ...(validated.interfaceIds !== undefined && { interfaceIds: validated.interfaceIds }),
      ...(validated.includeInterfaceView !== undefined && { includeInterfaceView: validated.includeInterfaceView }),
      ...(validated.includeCreatedEventBlob !== undefined && {
        includeCreatedEventBlob: validated.includeCreatedEventBlob,
      }),
      ...(validated.transactionShape !== undefined && { transactionShape: validated.transactionShape }),
      ...(validated.includeReassignments !== undefined && { includeReassignments: validated.includeReassignments }),
      ...(validated.includeTopologyEvents !== undefined && { includeTopologyEvents: validated.includeTopologyEvents }),
    });

    // Build request message
    const requestMessage = {
      beginExclusive,
      endInclusive: validated.endInclusive,
      verbose: false,
      updateFormat,
    };

    const wsClient = new WebSocketClient(this.client);

    // The socket closes right after `onTokenRefreshNeeded` returns, with whatever code it picks (1000 included), so the
    // close handler cannot tell a token-refresh close from the participant's end of a bounded stream by code alone.
    let tokenRefreshStarted = false;
    const { onTokenRefreshNeeded } = params;

    // Build WebSocket options for token refresh handling (only include defined properties)
    let wsOptions: WebSocketOptions | undefined;
    if (params.onTokenExpiring !== undefined || onTokenRefreshNeeded !== undefined) {
      wsOptions = {
        ...(params.onTokenExpiring !== undefined && { onTokenExpiring: params.onTokenExpiring }),
        ...(onTokenRefreshNeeded !== undefined && {
          onTokenRefreshNeeded: (): ReturnType<NonNullable<WebSocketOptions['onTokenRefreshNeeded']>> => {
            tokenRefreshStarted = true;
            return onTokenRefreshNeeded();
          },
        }),
      };
    }

    // Highest offset whose frame `onMessage` handled. Frame callbacks can finish out of order, but all of them finish
    // before the close handler runs.
    let lastOffset: number | undefined;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let subscription: WebSocketSubscription | undefined;
      let closeWhenConnected = false;
      const closeSubscription = (): void => {
        if (subscription) {
          subscription.close();
        } else {
          closeWhenConnected = true;
        }
      };

      /** Convert a Canton error response to a proper Error object */
      const toError = (errorResponse: JsCantonError | WsCantonError): Error => {
        if ('cause' in errorResponse) {
          // WsCantonError
          return new ApiError(`WebSocket error [${errorResponse.code}]: ${errorResponse.cause}`);
        }
        // JsCantonError
        const codeStr = JSON.stringify(errorResponse.code);
        return new ApiError(`WebSocket error [${codeStr}]: ${errorResponse.message}`);
      };

      /** Check if a message is a Canton error response */
      const isErrorMessage = (msg: UpdatesWsMessage): msg is JsCantonError | WsCantonError =>
        'cause' in msg || ('code' in msg && 'message' in msg && !('update' in msg));

      void wsClient
        .connect<typeof requestMessage, unknown>(
          path,
          requestMessage,
          {
            onMessage: async (parsed): Promise<void> => {
              const decoded = UpdatesWsMessageSchema.safeParse(parsed);
              if (!decoded.success) {
                // Include Zod issue details so Slack/logs can diagnose the next wire-shape mismatch.
                throw new ApiError(
                  `Unexpected ledger updates WebSocket message: ${formatZodIssues(decoded.error)}`,
                  undefined,
                  undefined,
                  {
                    zodIssues: decoded.error.issues,
                  }
                );
              }
              // Deliver normalized Zod output (not the raw wire frame): null optionals → undefined,
              // paidTrafficCost coerced to digit string, while `z.looseObject` preserves unknown Ledger fields.
              const message = decoded.data;

              // Surface Canton error frames immediately; a slow consumer callback must not delay stream failure.
              if (isErrorMessage(message)) {
                const error = toError(message);
                if (!settled) {
                  settled = true;
                  reject(error);
                }
                closeSubscription();

                if (typeof params.onMessage === 'function') {
                  await params.onMessage(message);
                }
                throw error;
              }

              // Call user's onMessage callback if provided
              if (typeof params.onMessage === 'function') {
                await params.onMessage(message);
              }

              const offset = getUpdateOffset(message);
              if (offset !== undefined && (lastOffset === undefined || offset > lastOffset)) {
                lastOffset = offset;
              }
            },
            onError: (err) => {
              if (!settled) {
                settled = true;
                reject(err instanceof Error ? err : new Error(String(err)));
              }
            },
            onClose: (code, reason) => {
              if (settled) return;
              settled = true;
              const initiatedBy: UpdatesStreamCloseInitiator = tokenRefreshStarted ? 'token-refresh' : 'peer';
              const info: UpdatesStreamCloseInfo = {
                code,
                reason,
                initiatedBy,
                complete: initiatedBy === 'peer' && code === NORMAL_CLOSE_CODE,
                lastOffset,
              };
              try {
                params.onClose?.(info);
              } catch (err) {
                reject(err instanceof Error ? err : new Error(String(err)));
                return;
              }
              if (validated.rejectOnAbnormalClose === true && !info.complete) {
                reject(new UpdatesStreamClosedError(info));
                return;
              }
              resolve();
            },
          },
          wsOptions
        )
        .then((connected) => {
          subscription = connected;
          if (closeWhenConnected) {
            connected.close();
          }
        })
        .catch((err: unknown) => {
          if (!settled) {
            settled = true;
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });
    });
  }
}
