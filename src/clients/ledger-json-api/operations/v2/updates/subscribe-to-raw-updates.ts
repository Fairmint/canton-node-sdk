import { z } from 'zod';
import { ValidationError } from '../../../../../core/errors';
import { type WebSocketOptions } from '../../../../../core/ws/WebSocketClient';
import type { LedgerJsonApiClient } from '../../../LedgerJsonApiClient.generated';
import { UpdateFormatSchema, type UpdateFormat } from '../../../schemas/operations/updates';
import { openRawFrameStream, type RawFrame, type RawStreamSubscription } from '../utils/raw-frame-stream';

const path = '/v2/updates' as const;

/** The update kinds the Ledger API sends on `/v2/updates`. */
export type RawUpdateKind = 'OffsetCheckpoint' | 'Reassignment' | 'TopologyTransaction' | 'Transaction';

/** Every known update kind carries `value.offset`. */
const OFFSET_KINDS: readonly RawUpdateKind[] = [
  'OffsetCheckpoint',
  'Reassignment',
  'TopologyTransaction',
  'Transaction',
];

/** One `/v2/updates` frame exactly as the participant sent it: `{ "update": { "<kind>": { "value": { ... } } } }`. */
export type RawUpdateFrame = RawFrame<RawUpdateKind>;

const SubscribeToRawUpdatesParamsSchema = z.object({
  updateFormat: UpdateFormatSchema,
  beginExclusive: z.number().int().min(0),
  endInclusive: z.number().int().min(0).optional(),
  idleTimeoutMs: z.number().min(0).optional(),
});

export interface SubscribeToRawUpdatesParams {
  /**
   * What to read. Build it with `buildUpdateFormat`: `buildUpdateFormat({ anyParty: true, includeCreatedEventBlob:
   * true, includeTopologyEvents: true })` reads every party's transactions, reassignments and topology events. It is
   * validated, then sent exactly as given, so a caller can store the format it read with.
   */
  readonly updateFormat: UpdateFormat;
  /** Read updates after this offset. Pass the subscription's `lastOffset` to resume. */
  readonly beginExclusive: number;
  /**
   * Read up to and including this offset, then end with reason `completed`. Omit it to tail the ledger: the stream then
   * stays open and the participant also sends `OffsetCheckpoint` frames (only tailing streams carry them).
   */
  readonly endInclusive?: number;
  /**
   * Called for each frame, one at a time, in the order received; the next frame waits until the returned promise
   * resolves. Throwing ends the stream: `done` rejects with that error and `lastOffset` stays at the frame before.
   */
  readonly onFrame: (frame: RawUpdateFrame) => void | Promise<void>;
  /**
   * End the stream with an error when no frame arrives for this many milliseconds (default `0`, never). A tailing
   * stream receives an offset checkpoint after about a minute without updates, so a few minutes detects a hung socket.
   */
  readonly idleTimeoutMs?: number;
  /** Called when the access token is about to expire, before the stream ends with reason `token-refresh`. */
  readonly onTokenExpiring?: WebSocketOptions['onTokenExpiring'];
  /** Called just before the stream closes for a token refresh; it may return the close code and reason. */
  readonly onTokenRefreshNeeded?: WebSocketOptions['onTokenRefreshNeeded'];
}

/**
 * Streams `/v2/updates` frames exactly as the participant sends them, for a reader that must store what the ledger said
 * rather than the SDK's reading of it.
 *
 * Unlike `subscribeToUpdates`, no Zod schema touches a frame (no null is turned into `undefined`, no `paidTrafficCost`
 * is coerced), and every kind is delivered: transactions, reassignments, topology transactions and offset checkpoints.
 * Each frame carries its text, its `JSON.parse` value (checked to keep every number and key), its kind and its offset.
 *
 * Frames reach `onFrame` one at a time and in order; while the consumer falls behind, the socket stops reading. The
 * returned subscription's `lastOffset` is the offset of the last frame `onFrame` finished, and `done` settles once the
 * stream has ended:
 *
 * - Resolves with reason `completed` when the participant closes a bounded stream normally, `token-refresh` shortly
 *   before the access token expires (the token is cleared, so the next subscription authenticates afresh), or `closed`
 *   after `close()`.
 * - Rejects with a `RawStreamError` for an error frame (its `ledgerCode`, e.g. `PARTICIPANT_PRUNED_DATA_ACCESSED`), an
 *   unexpected or lossy frame, an offset out of order, or an abnormal close; with the error `onFrame` threw; or with a
 *   connection error. Frames received before a failure are still handled first.
 *
 * In every case a new subscription from `lastOffset` continues without a gap or a repeat.
 *
 * @example
 *   ```typescript
 *   await assertCanReadAsAnyParty(client);
 *   const updateFormat = buildUpdateFormat({
 *     anyParty: true,
 *     includeCreatedEventBlob: true,
 *     includeTopologyEvents: true,
 *   });
 *   let beginExclusive = cursor;
 *   for (;;) {
 *     const stream = client.subscribeToRawUpdates({
 *       updateFormat,
 *       beginExclusive,
 *       onFrame: async (frame) => store(frame.kind, frame.offset, frame.json),
 *     });
 *     try {
 *       await stream.done; // 'token-refresh': loop and resume
 *     } finally {
 *       beginExclusive = stream.lastOffset;
 *     }
 *   }
 *   ```;
 */
export class SubscribeToRawUpdates {
  constructor(private readonly client: LedgerJsonApiClient) {}

  public connect(params: SubscribeToRawUpdatesParams): RawStreamSubscription {
    const validated = SubscribeToRawUpdatesParamsSchema.safeParse(params);
    if (!validated.success) {
      throw new ValidationError(
        `Parameter validation failed: ${validated.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }
    const { beginExclusive, endInclusive, idleTimeoutMs } = validated.data;
    if (endInclusive !== undefined && endInclusive < beginExclusive) {
      throw new ValidationError(`endInclusive (${endInclusive}) must not be before beginExclusive (${beginExclusive})`);
    }

    return openRawFrameStream<RawUpdateKind>({
      client: this.client,
      name: 'updates',
      path,
      request: {
        beginExclusive,
        ...(endInclusive !== undefined && { endInclusive }),
        updateFormat: params.updateFormat,
      },
      beginExclusive,
      dataKey: 'update',
      offsetKinds: OFFSET_KINDS,
      onFrame: params.onFrame,
      idleTimeoutMs,
      onTokenExpiring: params.onTokenExpiring,
      onTokenRefreshNeeded: params.onTokenRefreshNeeded,
    });
  }
}
