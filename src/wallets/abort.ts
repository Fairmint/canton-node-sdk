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

/** An `Error` named `TimeoutError` (the name `AbortSignal.timeout()` gives its reason), for {@link withTimeout}. */
function timeoutError(ms: number): Error {
  const error = new Error(`Timed out after ${String(ms)} ms`);
  error.name = 'TimeoutError';
  return error;
}

/** The longest delay `setTimeout` honours (2^31 - 1 ms, about 24.8 days); a longer one fires at once. */
export const MAX_TIMER_MS = 2_147_483_647;

/**
 * Runs `work` with a deadline. `work` gets a signal that aborts when `ms` milliseconds pass or `options.signal` aborts;
 * pass it on (to `fetch`, a wallet call) so the work stops too. The call settles as `work` does, else rejects at the
 * deadline with an `Error` named `TimeoutError` (match it by `name`), or, when `options.signal` aborted first, with an
 * `AbortError`. A rejection here does not say whether the work had an effect: work that may submit something must be
 * treated as of unknown outcome. `ms` must be a non-negative finite number of at most {@link MAX_TIMER_MS} (else a
 * `RangeError`).
 */
export async function withTimeout<Value>(
  work: (signal: AbortSignal) => Promise<Value>,
  ms: number,
  options: { readonly signal?: AbortSignal } = {}
): Promise<Value> {
  if (!Number.isFinite(ms) || ms < 0 || ms > MAX_TIMER_MS) {
    throw new RangeError(`withTimeout: ms must be a non-negative finite number, at most ${MAX_TIMER_MS}`);
  }
  const { signal } = options;
  if (signal?.aborted === true) throw createAbortError(signal);
  const controller = new AbortController();
  return new Promise<Value>((resolve, reject) => {
    let settled = false;
    const finish = (): boolean => {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      return true;
    };
    const timer = setTimeout(() => {
      if (!finish()) return;
      const error = timeoutError(ms);
      controller.abort(error);
      reject(error);
    }, ms);
    const onAbort = (): void => {
      if (!finish()) return;
      controller.abort(signal?.reason);
      reject(createAbortError(signal));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    let running: Promise<Value>;
    try {
      running = work(controller.signal);
    } catch (error) {
      running = Promise.reject(error);
    }
    running.then(
      (value) => {
        if (finish()) resolve(value);
      },
      (error: unknown) => {
        if (finish()) reject(error);
      }
    );
  });
}
