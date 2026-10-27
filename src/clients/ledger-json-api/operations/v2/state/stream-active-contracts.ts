import { WebSocketClient, type WebSocketSubscription } from '../../../../../core/ws/WebSocketClient';
import type { LedgerJsonApiClient } from '../../../LedgerJsonApiClient.generated';
import type { JsGetActiveContractsResponseItem } from '../../../schemas/api/state';
import {
  ACTIVE_CONTRACTS_PATH,
  activeContractsCloseError,
  buildActiveContractsRequest,
  decodeActiveContractsFrame,
  type ActiveContractsParams,
  type ActiveContractsRequestMessage,
} from './active-contracts-request';

/**
 * Most received items that wait for the consumer before the socket stops reading. Past it the participant's sends back
 * up behind TCP flow control instead of the snapshot collecting in memory; reading resumes once half have been taken.
 */
export const ACTIVE_CONTRACTS_STREAM_HIGH_WATER_MARK = 256;

/** Parameters of `streamActiveContracts`: those of `getActiveContracts` without its `onItem` callback. */
export type StreamActiveContractsParams = ActiveContractsParams;

/** Items received from the socket and not yet taken by the iterator, followed by how the stream ended. */
class SnapshotQueue {
  private readonly items: JsGetActiveContractsResponseItem[] = [];
  private subscription: WebSocketSubscription | undefined;
  private paused = false;
  private failure: Error | undefined;
  private wake: (() => void) | undefined;
  private ended = false;
  private closed = false;

  public get hasEnded(): boolean {
    return this.ended;
  }

  public attach(subscription: WebSocketSubscription): void {
    this.subscription = subscription;
    if (this.paused) {
      subscription.pause?.();
    }
  }

  public push(item: JsGetActiveContractsResponseItem): void {
    this.items.push(item);
    if (!this.paused && this.items.length >= ACTIVE_CONTRACTS_STREAM_HIGH_WATER_MARK) {
      this.paused = true;
      this.subscription?.pause?.();
    }
    this.signal();
  }

  /** Ends the stream; items already queued are still taken before the failure, if any, is thrown. */
  public end(failure?: Error): void {
    if (this.ended) return;
    this.ended = true;
    this.failure = failure;
    this.signal();
  }

  /** Waits for the next item. Resolves to `undefined` once the stream has ended and every item has been taken. */
  public async take(): Promise<JsGetActiveContractsResponseItem | undefined> {
    for (;;) {
      const item = this.items.shift();
      if (item !== undefined) {
        if (this.paused && this.items.length <= ACTIVE_CONTRACTS_STREAM_HIGH_WATER_MARK / 2) {
          this.paused = false;
          this.subscription?.resume?.();
        }
        return item;
      }
      if (this.ended) {
        if (this.failure !== undefined) throw this.failure;
        return undefined;
      }
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    }
  }

  /** Ends the stream, drops the items no one will take, and closes the socket; closing again does nothing. */
  public close(): void {
    this.end();
    this.items.length = 0;
    if (this.closed) return;
    this.closed = true;
    this.subscription?.close();
  }

  private signal(): void {
    const { wake } = this;
    this.wake = undefined;
    wake?.();
  }
}

/**
 * The iterator of an {@link ActiveContractsStream}. It reports `done` only after the participant's normal close has
 * completed the snapshot. Once the read fails, every later `next()` rejects with the same error, and once `return()`
 * has closed the stream early, every later `next()` rejects too, so that no caller takes part of the snapshot for all
 * of it. Calls to `next()` are served one at a time in the order they were made, each checking the stored failure again
 * after it has waited, so a call that was already pending when the stream failed or was closed rejects too. `return()`
 * closes the socket at once, whether or not a `next()` is waiting for a frame or the connection is still being set up.
 */
class SnapshotIterator implements AsyncIterator<JsGetActiveContractsResponseItem, void, undefined> {
  private completed = false;
  private cancelled = false;
  private failure: { readonly error: unknown } | undefined;
  private queue: SnapshotQueue | undefined;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly open: () => Promise<SnapshotQueue>) {}

  public async next(): Promise<IteratorResult<JsGetActiveContractsResponseItem, void>> {
    const result = this.tail.then(async () => this.advance());
    this.tail = result.catch(() => undefined);
    return result;
  }

  public async return(): Promise<IteratorResult<JsGetActiveContractsResponseItem, void>> {
    if (!this.completed) {
      this.cancelled = true;
      this.failure ??= { error: new Error('Active-contracts stream was closed before the snapshot completed') };
      this.queue?.close();
    }
    return Promise.resolve({ done: true, value: undefined });
  }

  private async advance(): Promise<IteratorResult<JsGetActiveContractsResponseItem, void>> {
    this.rethrow();
    if (this.completed) return { done: true, value: undefined };
    try {
      this.queue ??= await this.open();
      // A return() that came while the connection was being set up could not close a socket that did not exist yet.
      if (this.cancelled) this.queue.close();
      const item = await this.queue.take();
      this.rethrow();
      if (item === undefined) {
        this.completed = true;
        this.queue.close();
        return { done: true, value: undefined };
      }
      return { done: false, value: item };
    } catch (error) {
      this.failure ??= { error };
      this.queue?.close();
      throw this.failure.error;
    }
  }

  private rethrow(): void {
    if (this.failure !== undefined) throw this.failure.error;
  }
}

/**
 * One read of the active contracts at an offset, returned by `streamActiveContracts`. It can be iterated once: a second
 * `for await` over the same stream throws instead of reporting an empty snapshot, so a retry has to call
 * `streamActiveContracts` again.
 */
export class ActiveContractsStream implements AsyncIterable<JsGetActiveContractsResponseItem> {
  private offset: number | undefined;
  private iterated = false;

  constructor(
    private readonly client: LedgerJsonApiClient,
    private readonly params: StreamActiveContractsParams
  ) {}

  /**
   * The offset the snapshot is read at: the `activeAtOffset` passed in or, when it is omitted, the ledger end read as
   * iteration starts. It is `undefined` until the first `next()` has built the request, and set before the first item
   * is yielded. A reader that continues with `subscribeToUpdates` passes it as `beginExclusive`; reading the ledger end
   * again instead would skip the updates in between.
   */
  public get activeAtOffset(): number | undefined {
    return this.offset;
  }

  public [Symbol.asyncIterator](): AsyncIterator<JsGetActiveContractsResponseItem, void, undefined> {
    if (this.iterated) {
      throw new Error(
        'An active-contracts stream can be iterated only once; call streamActiveContracts again to read another snapshot'
      );
    }
    this.iterated = true;
    return new SnapshotIterator(async () => this.open());
  }

  private async open(): Promise<SnapshotQueue> {
    const { requestMessage, idleTimeoutMs } = await buildActiveContractsRequest(this.client, this.params);
    this.offset = requestMessage.activeAtOffset;

    const queue = new SnapshotQueue();
    const subscription = await new WebSocketClient(this.client).connect<ActiveContractsRequestMessage, unknown>(
      ACTIVE_CONTRACTS_PATH,
      requestMessage,
      {
        // Synchronous on purpose: WebSocketClient dispatches the next frame without waiting for this handler, so only a
        // handler that returns before then keeps the items in order.
        onMessage: (parsed): void => {
          if (queue.hasEnded) return;
          const frame = decodeActiveContractsFrame(parsed);
          if ('error' in frame) {
            queue.end(frame.error);
            // Rethrown so that WebSocketClient closes the socket.
            throw frame.error;
          }
          queue.push(frame.item);
        },
        onError: (err) => {
          queue.end(err);
        },
        onClose: (code, reason) => {
          queue.end(activeContractsCloseError(code, reason));
        },
      },
      { idleTimeoutMs }
    );
    queue.attach(subscription);
    return queue;
  }
}

/**
 * Streams the active contracts at an offset one item at a time, without collecting the snapshot.
 *
 * Takes the filters, offset and idle timeout of `getActiveContracts`. Canton 3.4's state service serves the snapshot
 * only as a stream, so this reads the same WebSocket but hands each item to the consumer as it arrives and keeps no
 * reference to it afterwards. The returned {@link ActiveContractsStream} connects when iteration starts and yields items
 * in the order the participant sends them. When the consumer falls {@link ACTIVE_CONTRACTS_STREAM_HIGH_WATER_MARK} items
 * behind, the socket stops reading until it catches up. A Canton error frame, an unexpected frame, the idle timeout or
 * a close other than the participant's normal close (1000), such as a dropped connection, ends the iteration with an
 * error once the items received before it have been yielded. Leaving a `for await` loop early, by `break`, `return` or
 * a throw, closes the socket; an iterator driven by hand must be run to the end or closed with `return()`. A stream is
 * read once; to retry, call `streamActiveContracts` again.
 *
 * To continue from the snapshot with `subscribeToUpdates`, pass its {@link ActiveContractsStream.activeAtOffset} as
 * `beginExclusive`.
 *
 * @example
 *   ```typescript
 *   const snapshot = client.streamActiveContracts({ parties: [party], interfaceIds: [interfaceId] });
 *   for await (const item of snapshot) {
 *     if ('JsActiveContract' in item.contractEntry) {
 *       handle(item.contractEntry.JsActiveContract.createdEvent);
 *     }
 *   }
 *   const beginExclusive = snapshot.activeAtOffset; // the offset the snapshot was read at
 *   ```;
 */
export class StreamActiveContracts {
  constructor(private readonly client: LedgerJsonApiClient) {}

  public execute(params: StreamActiveContractsParams): ActiveContractsStream {
    return new ActiveContractsStream(this.client, params);
  }
}
