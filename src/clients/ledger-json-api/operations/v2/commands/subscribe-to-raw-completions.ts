import { z } from 'zod';
import { ValidationError } from '../../../../../core/errors';
import { type WebSocketOptions } from '../../../../../core/ws/WebSocketClient';
import type { LedgerJsonApiClient } from '../../../LedgerJsonApiClient.generated';
import { openRawFrameStream, type RawFrame, type RawStreamSubscription } from '../utils/raw-frame-stream';

const path = '/v2/commands/completions' as const;

/** The completion response kinds the Ledger API sends on `/v2/commands/completions`. */
export type RawCompletionKind = 'Completion' | 'Empty' | 'OffsetCheckpoint';

/** Completions and checkpoints carry `value.offset`; `Empty` does not. */
const OFFSET_KINDS: readonly RawCompletionKind[] = ['Completion', 'OffsetCheckpoint'];

/**
 * One `/v2/commands/completions` frame exactly as the participant sent it: `{ "completionResponse": { "<kind>": {
 * "value": { ... } } } }`. A `Completion` carries `commandId`, `userId`, `actAs`, `submissionId`, `status`, `updateId`,
 * `offset`, `synchronizerTime`, `paidTrafficCost`, the deduplication period and `traceContext`.
 */
export type RawCompletionFrame = RawFrame<RawCompletionKind>;

const SubscribeToRawCompletionsParamsSchema = z.object({
  userId: z.string().min(1, 'userId must be a non-empty string'),
  parties: z.array(z.string().min(1, 'each party must be a non-empty string')).min(1, 'parties must not be empty'),
  beginExclusive: z.number().int().min(0),
  idleTimeoutMs: z.number().min(0).optional(),
});

export interface SubscribeToRawCompletionsParams {
  /**
   * The user whose submissions to read. Completions are stored per user and the participant returns only those of the
   * exact user id asked for. A user with `CanReadAsAnyParty` may read any user's completions; others only their own.
   */
  readonly userId: string;
  /**
   * Parties to read for; required and non-empty, as the Ledger API demands. The participant drops a completion none of
   * whose `actAs` parties is listed, and trims `actAs` to the listed parties, so a reader that needs every completion
   * with its full `actAs` lists every party that can submit on the participant. There is no client-party fallback.
   */
  readonly parties: readonly string[];
  /** Read completions after this offset. Pass the subscription's `lastOffset` to resume. */
  readonly beginExclusive: number;
  /**
   * Called for each frame, one at a time, in the order received; the next frame waits until the returned promise
   * resolves. Throwing ends the stream: `done` rejects with that error and `lastOffset` stays at the frame before.
   */
  readonly onFrame: (frame: RawCompletionFrame) => void | Promise<void>;
  /** End the stream with an error when no frame arrives for this many milliseconds (default `0`, never). */
  readonly idleTimeoutMs?: number;
  /** Called when the access token is about to expire, before the stream ends with reason `token-refresh`. */
  readonly onTokenExpiring?: WebSocketOptions['onTokenExpiring'];
  /** Called just before the stream closes for a token refresh; it may return the close code and reason. */
  readonly onTokenRefreshNeeded?: WebSocketOptions['onTokenRefreshNeeded'];
}

/**
 * Streams `/v2/commands/completions` frames for one user exactly as the participant sends them: completions (accepted
 * and rejected), offset checkpoints and empty responses, each with its text, its `JSON.parse` value (checked to keep
 * every number and key), its kind and its offset.
 *
 * Unlike `subscribeToCompletions`, it takes no defaults: `userId` and a non-empty `parties` list are required, and
 * neither falls back to the client's configuration. Ordering, back-pressure, `lastOffset`, token refresh and how `done`
 * settles are those of `subscribeToRawUpdates`.
 *
 * A reader with `CanReadAsAnyParty` reads every user's completions by opening one stream per user id (`listUsers` lists
 * them and needs admin rights), each with every party that can submit on the participant.
 *
 * @example
 *   ```typescript
 *   const stream = client.subscribeToRawCompletions({
 *     userId: 'ta-service',
 *     parties: hostedParties,
 *     beginExclusive: cursor,
 *     onFrame: async (frame) => storeCompletion(frame.kind, frame.offset, frame.json),
 *   });
 *   await stream.done;
 *   ```;
 */
export class SubscribeToRawCompletions {
  constructor(private readonly client: LedgerJsonApiClient) {}

  public connect(params: SubscribeToRawCompletionsParams): RawStreamSubscription {
    const validated = SubscribeToRawCompletionsParamsSchema.safeParse(params);
    if (!validated.success) {
      throw new ValidationError(
        `Parameter validation failed: ${validated.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }
    const { userId, parties, beginExclusive, idleTimeoutMs } = validated.data;

    return openRawFrameStream<RawCompletionKind>({
      client: this.client,
      name: 'completions',
      path,
      request: { userId, parties, beginExclusive },
      beginExclusive,
      dataKey: 'completionResponse',
      offsetKinds: OFFSET_KINDS,
      onFrame: params.onFrame,
      idleTimeoutMs,
      onTokenExpiring: params.onTokenExpiring,
      onTokenRefreshNeeded: params.onTokenRefreshNeeded,
    });
  }
}
