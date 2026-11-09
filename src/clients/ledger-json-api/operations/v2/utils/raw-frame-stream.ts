/**
 * The raw WebSocket reader behind `subscribeToRawUpdates` and `subscribeToRawCompletions`.
 *
 * It hands each frame to the consumer exactly as the participant sent it (the text, and its `JSON.parse` value checked
 * to keep every number and key), one at a time and in order, and keeps the offset of the last frame the consumer has
 * handled so that a new subscription can resume from it. No Zod schema touches a frame.
 */
import { type BaseClient } from '../../../../../core/BaseClient';
import { ApiError, type ErrorContext } from '../../../../../core/errors';
import { assertLosslessJson, LossyJsonError } from '../../../../../core/utils/lossless-json';
import { isRecord } from '../../../../../core/utils/type-guards';
import {
  WebSocketClient,
  type WebSocketOptions,
  type WebSocketSubscription,
} from '../../../../../core/ws/WebSocketClient';

/**
 * Most received frames that wait for the consumer before the socket stops reading. Past it the participant's sends back
 * up behind TCP flow control instead of collecting in memory; reading resumes once half have been handled.
 */
export const RAW_STREAM_HIGH_WATER_MARK = 256;

/** The frame kind whose offset is a resume point rather than an update. */
const CHECKPOINT_KIND = 'OffsetCheckpoint';

/** Close code of a stream the participant ended normally (a bounded range read to its end). */
const NORMAL_CLOSE_CODE = 1000;

/** A frame kind the SDK knows, or any other kind a newer participant sends. */
export type RawFrameKind<Known extends string> = Known | (string & Record<never, never>);

/** One WebSocket frame exactly as the participant sent it. */
export interface RawFrame<Known extends string = string> {
  /** The frame as received (its UTF-8 text). Store this to keep the exact bytes. */
  readonly text: string;
  /**
   * `JSON.parse(text)`, unnormalized. Every number in it equals the number written in `text`, and no key was dropped; a
   * frame that would lose either ends the stream with a `RawStreamError` instead of being delivered.
   */
  readonly json: unknown;
  /** The frame's variant, e.g. `Transaction` or `OffsetCheckpoint`; a kind this SDK does not know is still delivered. */
  readonly kind: RawFrameKind<Known>;
  /** The offset the frame carries, if any (every known kind except `Empty` carries one). */
  readonly offset: number | undefined;
}

/** Why a raw stream ended without an error. */
export type RawStreamEndReason =
  /** The participant closed the stream normally (code 1000): a bounded range was read to its end. */
  | 'completed'
  /** The access token was about to expire; the stream was closed (code 4000 unless the hook chose another). */
  | 'token-refresh'
  /** `close()` was called. */
  | 'closed';

/** How a raw stream ended. */
export interface RawStreamEnd {
  readonly reason: RawStreamEndReason;
  /** Offset of the last frame the consumer handled, or the `beginExclusive` passed in. Resume from it. */
  readonly lastOffset: number;
  /** The WebSocket close code, when the socket closed rather than `close()` being called. */
  readonly closeCode: number | undefined;
}

/** A running raw stream. */
export interface RawStreamSubscription {
  /**
   * Offset of the last frame (an update, a completion or an offset checkpoint) whose `onFrame` has resolved; the
   * `beginExclusive` passed in until then. It never goes back. Pass it as `beginExclusive` to resume after any end or
   * failure: every frame after it is delivered again, none before it.
   */
  readonly lastOffset: number;
  /**
   * Settles once the stream has ended and no `onFrame` call is still running: resolves with how it ended, or rejects
   * with the first failure (a `RawStreamError`, the error a `onFrame` call threw, or a connection error).
   */
  readonly done: Promise<RawStreamEnd>;
  /** Stops reading and closes the socket; frames not yet handed to `onFrame` are dropped. Closing twice does nothing. */
  readonly close: () => void;
}

/** What went wrong in a raw stream. */
export type RawStreamErrorReason =
  /** The participant sent an error frame (`ledgerCode` holds its code, e.g. `PARTICIPANT_PRUNED_DATA_ACCESSED`). */
  | 'error-frame'
  /** A frame that is neither a data frame of this stream nor an error frame, or a data frame without its offset. */
  | 'unexpected-frame'
  /** `JSON.parse` would have changed a number or dropped a repeated key (see `LossyJsonError`). */
  | 'lossy-json'
  /** A frame's offset did not follow the previous frame's. */
  | 'out-of-order'
  /** The socket closed with a code other than 1000 before the stream ended. */
  | 'abnormal-close';

/** A raw stream ended because of the ledger or the connection rather than the consumer. */
export class RawStreamError extends ApiError {
  public override readonly name: string;

  constructor(
    message: string,
    /** What went wrong. */
    public readonly reason: RawStreamErrorReason,
    /** The Canton error code of an error frame. */
    public readonly ledgerCode?: string,
    /** The WebSocket close code of an abnormal close. */
    public readonly closeCode?: number,
    context?: ErrorContext
  ) {
    super(message, undefined, undefined, { reason, ...(ledgerCode !== undefined && { code: ledgerCode }), ...context });
    this.name = 'RawStreamError';
  }
}

/** What a raw stream reads, and how its frames look. */
export interface RawStreamSpec<Known extends string> {
  readonly client: BaseClient;
  /** Name used in error messages, e.g. `updates`. */
  readonly name: string;
  readonly path: string;
  /** The request message, sent as given. */
  readonly request: Record<string, unknown>;
  readonly beginExclusive: number;
  /** The top-level key of a data frame: `update` or `completionResponse`. */
  readonly dataKey: string;
  /** Kinds that must carry `value.offset`; a frame of one of them without it ends the stream. */
  readonly offsetKinds: readonly string[];
  readonly onFrame: (frame: RawFrame<Known>) => void | Promise<void>;
  readonly idleTimeoutMs?: number | undefined;
  readonly onTokenExpiring?: WebSocketOptions['onTokenExpiring'] | undefined;
  readonly onTokenRefreshNeeded?: WebSocketOptions['onTokenRefreshNeeded'] | undefined;
}

type Ending =
  | { readonly kind: 'end'; readonly reason: RawStreamEndReason; readonly closeCode: number | undefined }
  | { readonly kind: 'error'; readonly error: unknown };

type Classified<Known extends string> = { readonly frame: RawFrame<Known> } | { readonly error: RawStreamError };

function readOffset(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function describeErrorFrame(frame: Record<string, unknown>): { code: string | undefined; detail: string } {
  const { code, cause, message } = frame;
  const detail = typeof cause === 'string' ? cause : typeof message === 'string' ? message : '';
  if (typeof code === 'string') return { code, detail };
  return { code: undefined, detail: `${JSON.stringify(code)} ${detail}`.trim() };
}

class RawFrameStream<Known extends string> {
  public readonly done: Promise<RawStreamEnd>;
  private resolveDone: (end: RawStreamEnd) => void = () => undefined;
  private rejectDone: (error: unknown) => void = () => undefined;
  private lastHandled: number;
  private lastReceived: number;
  private readonly queue: Array<RawFrame<Known>> = [];
  private subscription: WebSocketSubscription | undefined;
  private paused = false;
  private handling = false;
  /** How the stream ends; once it is set no frame is queued. */
  private ending: Ending | undefined;
  /** Set by `close()` or a failing `onFrame`: queued frames are dropped instead of handled. */
  private stopped = false;
  private settled = false;
  private tokenRefreshStarted = false;

  constructor(private readonly spec: RawStreamSpec<Known>) {
    this.lastHandled = spec.beginExclusive;
    this.lastReceived = spec.beginExclusive;
    this.done = new Promise<RawStreamEnd>((resolve, reject) => {
      this.resolveDone = resolve;
      this.rejectDone = reject;
    });
    // A caller that awaits `done` later still sees the rejection; one that never does must not crash the process.
    void this.done.catch(() => undefined);
  }

  public get lastOffset(): number {
    return this.lastHandled;
  }

  public start(): void {
    const { spec } = this;
    const options: WebSocketOptions = {
      idleTimeoutMs: spec.idleTimeoutMs ?? 0,
      ...(spec.onTokenExpiring !== undefined && { onTokenExpiring: spec.onTokenExpiring }),
      // Always end the stream before the token expires, so the participant never cuts it off mid-read. The token is
      // cleared so that the next subscription authenticates afresh instead of reusing the expiring one.
      onTokenRefreshNeeded: async (): Promise<{ code?: number; reason?: string } | void> => {
        let closeParams: { code?: number; reason?: string } | void;
        try {
          closeParams = await spec.onTokenRefreshNeeded?.();
        } finally {
          // The expiring token is cleared even when the hook fails, so the next subscription never reuses it.
          spec.client.clearToken();
        }
        // Set only once the caller's hook has succeeded: an error the hook throws still fails the stream.
        this.tokenRefreshStarted = true;
        return closeParams;
      },
    };
    void new WebSocketClient(spec.client)
      .connect<Record<string, unknown>, unknown>(
        spec.path,
        spec.request,
        {
          onMessage: (parsed, rawText): void => {
            this.receive(parsed, rawText);
          },
          onError: (error): void => {
            // Closing for a token refresh before the handshake completes reports an error; it is still the refresh.
            this.endAfterQueue(
              this.tokenRefreshStarted
                ? { kind: 'end', reason: 'token-refresh', closeCode: undefined }
                : { kind: 'error', error }
            );
          },
          onClose: (code, reason): void => {
            this.onSocketClose(code, reason);
          },
        },
        options
      )
      .then(
        (subscription) => {
          this.subscription = subscription;
          if (this.ending !== undefined) {
            subscription.close();
          } else if (this.paused) {
            subscription.pause?.();
          }
        },
        (error: unknown) => {
          this.endAfterQueue({ kind: 'error', error });
        }
      );
  }

  public close(): void {
    this.stop({ kind: 'end', reason: 'closed', closeCode: undefined });
  }

  private receive(parsed: unknown, rawText: string | undefined): void {
    if (this.ending !== undefined) return;
    const classified = this.classify(parsed, rawText);
    if ('error' in classified) {
      this.endAfterQueue({ kind: 'error', error: classified.error });
      return;
    }
    this.queue.push(classified.frame);
    if (!this.paused && this.queue.length >= RAW_STREAM_HIGH_WATER_MARK) {
      this.paused = true;
      this.subscription?.pause?.();
    }
    void this.pump();
  }

  private classify(parsed: unknown, rawText: string | undefined): Classified<Known> {
    const { name, dataKey } = this.spec;
    if (rawText === undefined) {
      return { error: new RawStreamError(`Raw ${name} frame arrived without its text`, 'unexpected-frame') };
    }
    try {
      assertLosslessJson(rawText);
    } catch (error) {
      if (!(error instanceof LossyJsonError)) throw error;
      return {
        error: new RawStreamError(`Raw ${name} frame cannot be parsed losslessly: ${error.message}`, 'lossy-json'),
      };
    }
    if (!isRecord(parsed)) {
      return { error: new RawStreamError(`Unexpected ${name} frame: not a JSON object`, 'unexpected-frame') };
    }
    const data = parsed[dataKey];
    if (data === undefined) {
      if ('code' in parsed && ('cause' in parsed || 'message' in parsed)) {
        const { code, detail } = describeErrorFrame(parsed);
        return {
          error: new RawStreamError(
            `Ledger ${name} stream error [${code ?? 'unknown'}]: ${detail}`,
            'error-frame',
            code,
            undefined,
            { frame: parsed }
          ),
        };
      }
      return { error: new RawStreamError(`Unexpected ${name} frame: no "${dataKey}" field`, 'unexpected-frame') };
    }
    const kinds = isRecord(data) ? Object.keys(data) : [];
    const [kind] = kinds;
    if (!isRecord(data) || kind === undefined || kinds.length !== 1) {
      return {
        error: new RawStreamError(
          `Unexpected ${name} frame: "${dataKey}" must hold exactly one kind`,
          'unexpected-frame'
        ),
      };
    }
    const variant = data[kind];
    const offset = isRecord(variant) && isRecord(variant['value']) ? readOffset(variant['value']['offset']) : undefined;
    if (offset === undefined && this.spec.offsetKinds.includes(kind)) {
      return { error: new RawStreamError(`Unexpected ${name} frame: ${kind} without an offset`, 'unexpected-frame') };
    }
    if (offset !== undefined) {
      // Every update or completion has an offset greater than the frame before it, a checkpoint included. A checkpoint
      // may repeat the offset of the update before it.
      if (kind !== CHECKPOINT_KIND && offset <= this.lastReceived) {
        return {
          error: new RawStreamError(
            `Out-of-order ${name} frame: ${kind} at offset ${offset} after offset ${this.lastReceived}`,
            'out-of-order'
          ),
        };
      }
      this.lastReceived = Math.max(this.lastReceived, offset);
    }
    return { frame: { text: rawText, json: parsed, kind, offset } };
  }

  private onSocketClose(code: number, reason: string): void {
    if (this.tokenRefreshStarted) {
      this.endAfterQueue({ kind: 'end', reason: 'token-refresh', closeCode: code });
    } else if (code === NORMAL_CLOSE_CODE) {
      this.endAfterQueue({ kind: 'end', reason: 'completed', closeCode: code });
    } else {
      this.endAfterQueue({
        kind: 'error',
        error: new RawStreamError(
          `Ledger ${this.spec.name} stream closed [${code}]${reason === '' ? '' : `: ${reason}`}`,
          'abnormal-close',
          undefined,
          code
        ),
      });
    }
  }

  private async pump(): Promise<void> {
    if (this.handling) return;
    this.handling = true;
    try {
      while (!this.stopped) {
        const frame = this.queue.shift();
        if (frame === undefined) break;
        if (this.paused && this.queue.length <= RAW_STREAM_HIGH_WATER_MARK / 2) {
          this.paused = false;
          this.subscription?.resume?.();
        }
        try {
          await this.spec.onFrame(frame);
        } catch (error) {
          // A failed onFrame always surfaces, even when close() already stopped the stream: it replaces a pending
          // successful ending, never an earlier error.
          if (this.ending?.kind !== 'error') this.ending = { kind: 'error', error };
          this.stop({ kind: 'error', error });
          break;
        }
        if (frame.offset !== undefined && frame.offset > this.lastHandled) this.lastHandled = frame.offset;
      }
    } finally {
      this.handling = false;
    }
    this.settleIfIdle();
  }

  /** Ends the stream once the frames already received are handled. The first ending wins. */
  private endAfterQueue(ending: Ending): void {
    if (this.ending !== undefined) return;
    this.ending = ending;
    // No frame after this one is wanted; close the socket (a no-op once it has closed).
    this.subscription?.close();
    this.settleIfIdle();
  }

  /** Ends the stream now: queued frames are dropped. It replaces a pending end, but never an earlier error. */
  private stop(ending: Ending): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.ending?.kind !== 'error') this.ending = ending;
    this.queue.length = 0;
    this.subscription?.close();
    this.settleIfIdle();
  }

  private settleIfIdle(): void {
    const { ending } = this;
    if (this.settled || this.handling || ending === undefined) return;
    if (!this.stopped && this.queue.length > 0) return;
    this.settled = true;
    if (ending.kind === 'error') {
      this.rejectDone(ending.error);
    } else {
      this.resolveDone({ reason: ending.reason, lastOffset: this.lastHandled, closeCode: ending.closeCode });
    }
  }
}

/** Opens a raw stream; see {@link RawStreamSubscription}. */
export function openRawFrameStream<Known extends string>(spec: RawStreamSpec<Known>): RawStreamSubscription {
  const stream = new RawFrameStream<Known>(spec);
  stream.start();
  return {
    get lastOffset(): number {
      return stream.lastOffset;
    },
    done: stream.done,
    close: (): void => {
      stream.close();
    },
  };
}
