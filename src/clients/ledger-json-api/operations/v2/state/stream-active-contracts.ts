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

  /** Ends the stream, drops the items no one will take, and closes the socket. */
  public close(): void {
    this.end();
    this.items.length = 0;
    this.subscription?.close();
  }

  private signal(): void {
    const { wake } = this;
    this.wake = undefined;
    wake?.();
  }
}

/**
 * Streams the active contracts at an offset one item at a time, without collecting the snapshot.
 *
 * Takes the filters, offset and idle timeout of `getActiveContracts`. Canton 3.4's state service serves the snapshot
 * only as a stream, so this reads the same WebSocket but hands each item to the consumer as it arrives and keeps no
 * reference to it afterwards. The iterator connects on its first `next()` and yields items in the order the participant
 * sends them. When the consumer falls {@link ACTIVE_CONTRACTS_STREAM_HIGH_WATER_MARK} items behind, the socket stops
 * reading until it catches up. A Canton error frame, an unexpected frame, the idle timeout or a close other than the
 * participant's normal close (1000), such as a dropped connection, ends the iteration with an error once the items
 * received before it have been yielded. Leaving a `for await` loop early, by `break`, `return` or a throw, closes the
 * socket; an iterator driven by hand must be run to the end or closed with `return()`.
 *
 * @example
 *   ```typescript
 *   for await (const item of client.streamActiveContracts({ parties: [party], interfaceIds: [interfaceId] })) {
 *     if ('JsActiveContract' in item.contractEntry) {
 *       handle(item.contractEntry.JsActiveContract.createdEvent);
 *     }
 *   }
 *   ```;
 */
export class StreamActiveContracts {
  constructor(private readonly client: LedgerJsonApiClient) {}

  public async *execute(
    params: StreamActiveContractsParams
  ): AsyncGenerator<JsGetActiveContractsResponseItem, void, undefined> {
    const { requestMessage, idleTimeoutMs } = await buildActiveContractsRequest(this.client, params);

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

    try {
      for (;;) {
        const item = await queue.take();
        if (item === undefined) return;
        yield item;
      }
    } finally {
      queue.close();
    }
  }
}
