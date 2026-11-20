/**
 * Cancellation errors the wallets module throws before it submits anything. Each is an `AbortError` carrying a brand (a
 * non-enumerable symbol from the global registry, so it is recognised across copies of this module), which is how
 * `describeWalletError` tells it from a foreign `AbortError` or `TimeoutError` (for example one a wallet or `fetch`
 * raised, which may arrive after a submission was sent).
 */
import { createAbortError } from '../core/http/abort';

const BEFORE_SUBMIT = Symbol.for('@fairmint/canton-node-sdk/wallets/cancelled-before-submit');

/** An `AbortError` for `signal` that the wallets module throws before it submits anything. */
export function cancelledBeforeSubmit(signal: AbortSignal | undefined): Error {
  const error = createAbortError(signal);
  Object.defineProperty(error, BEFORE_SUBMIT, { value: true, enumerable: false });
  return error;
}

/** Whether `error` is an {@link cancelledBeforeSubmit} error of any copy of this module. */
export function isCancelledBeforeSubmit(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  try {
    return (error as Record<symbol, unknown>)[BEFORE_SUBMIT] === true;
  } catch {
    return false;
  }
}

/** Throws a branded `AbortError` when `signal` has aborted. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw cancelledBeforeSubmit(signal);
}

/** Races pre-submission work against `signal`; an abort rejects with a branded `AbortError`. */
export async function awaitWithAbort<Value>(
  work: () => Value | Promise<Value>,
  signal: AbortSignal | undefined
): Promise<Value> {
  throwIfAborted(signal);
  const workPromise = Promise.resolve().then(async () => {
    // Cancellation may have won before this microtask ran: never start the work (a prompt, a send) then.
    throwIfAborted(signal);
    return work();
  });
  if (signal === undefined) return workPromise;
  return new Promise<Value>((resolve, reject) => {
    const onAbort = (): void => {
      signal.removeEventListener('abort', onAbort);
      reject(cancelledBeforeSubmit(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    void workPromise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
    if (signal.aborted) onAbort();
  });
}

/**
 * A signal that aborts when any of `signals` does (`undefined` entries are ignored; `undefined` when none is given).
 * `release()` detaches it from the source signals once the call it served has settled.
 */
export function anySignal(...signals: ReadonlyArray<AbortSignal | undefined>): {
  readonly signal: AbortSignal | undefined;
  readonly release: () => void;
} {
  const sources = signals.filter((signal): signal is AbortSignal => signal !== undefined);
  if (sources.length === 0) return { signal: undefined, release: () => undefined };
  if (sources.length === 1) return { signal: sources[0], release: () => undefined };
  const controller = new AbortController();
  const listeners: Array<() => void> = [];
  const release = (): void => {
    for (const detach of listeners) detach();
    listeners.length = 0;
  };
  for (const source of sources) {
    if (source.aborted) {
      controller.abort(source.reason);
      return { signal: controller.signal, release };
    }
    const onAbort = (): void => {
      release();
      controller.abort(source.reason);
    };
    source.addEventListener('abort', onAbort, { once: true });
    listeners.push(() => {
      source.removeEventListener('abort', onAbort);
    });
  }
  return { signal: controller.signal, release };
}
