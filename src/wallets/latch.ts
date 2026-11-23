/**
 * One write at a time for a whole page: a single-flight latch that a wallet store's actions, other writes (a Canton
 * Coin prepare, sign and submit) and wallet setup steps share, so signature requests never stack or interleave. Its
 * epoch counts context changes (a disconnect, another wallet or party): a run that started in an earlier epoch is
 * abandoned, its signal aborts, and it reports whether it had handed anything to a wallet.
 *
 * Observable for any UI framework: `subscribe` and `getSnapshot`.
 */
import { notifyListeners } from './notify';

/** Who holds the latch. `label` is the caller's own code (an action type, `privy`, ...); the page words it. */
export interface WriteLatchHolder {
  /** Unique per run of one latch. */
  readonly id: number;
  readonly label: string;
}

/** What {@link WriteLatch.getSnapshot} returns: the same object until it changes. */
export interface WriteLatchState {
  /** The run holding the latch, or null when it is free. */
  readonly holder: WriteLatchHolder | null;
  /** Counts context changes (`bump()`). A run that started in an earlier epoch is abandoned. */
  readonly epoch: number;
}

/** What a run receives. */
export interface WriteRunContext {
  /** Aborted by `bump()` (a context change) or `dispose()`. Pass it to every call the run makes. */
  readonly signal: AbortSignal;
  /** False once the epoch the run started in has ended. */
  isCurrent(): boolean;
  /**
   * Call it just before handing anything to a wallet or ledger to submit. An abandoned run then reports
   * `unknown-outcome` instead of `dropped`.
   */
  markSubmitted(): void;
}

/**
 * How a run ended:
 *
 * - `done` / `failed`: it resolved / threw in the epoch it started in;
 * - `refused`: it never ran, because another run held the latch (`busy`) or the latch was disposed;
 * - `dropped`: it was abandoned (a bump or dispose) before `markSubmitted()`, so nothing was sent;
 * - `unknown-outcome`: it was abandoned after `markSubmitted()`, so what it sent may have committed (`error` is what it
 *   threw, if it threw).
 */
export type WriteRunOutcome<T> =
  | { readonly status: 'done'; readonly value: T }
  | { readonly status: 'failed'; readonly error: unknown }
  | { readonly status: 'refused'; readonly reason: 'busy'; readonly holder: WriteLatchHolder }
  | { readonly status: 'refused'; readonly reason: 'disposed' }
  | { readonly status: 'dropped' }
  | { readonly status: 'unknown-outcome'; readonly error?: unknown };

/** A page's single write latch. Create one with {@link createWriteLatch}. */
export interface WriteLatch {
  subscribe(listener: () => void): () => void;
  getSnapshot(): WriteLatchState;
  /**
   * Single-flight. The latch is taken synchronously, before `fn` runs (and `fn` starts synchronously), so a double
   * click is refused at once. It is released when `fn` settles, only by the run that holds it. `run()` never rejects.
   */
  run<T>(label: string, fn: (context: WriteRunContext) => Promise<T>): Promise<WriteRunOutcome<T>>;
  /** Marks every run so far as abandoned and aborts its signal. It does not free the latch: the run's own end does. */
  bump(): void;
  /** Abandons every run (as `bump()`), refuses new ones and stops publishing. */
  dispose(): void;
}

/** A new, free {@link WriteLatch}. */
export function createWriteLatch(): WriteLatch {
  const listeners = new Set<() => void>();
  let state: WriteLatchState = Object.freeze({ holder: null, epoch: 0 });
  let nextId = 1;
  let disposed = false;
  // The controllers of runs in flight; bump() and dispose() abort them all.
  const running = new Set<AbortController>();

  function commit(next: WriteLatchState): void {
    state = Object.freeze(next);
    if (!disposed) notifyListeners(listeners);
  }

  /** Read through a call, so a check after an await is not narrowed by one before it. */
  function holderId(): number | null {
    return state.holder?.id ?? null;
  }

  /** Abort the runs in flight now. Captured before a bump publishes, so a run a listener starts in the new epoch stays. */
  function abandon(controllers: readonly AbortController[]): void {
    for (const controller of controllers) controller.abort();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot: () => state,

    async run<T>(label: string, fn: (context: WriteRunContext) => Promise<T>): Promise<WriteRunOutcome<T>> {
      if (disposed) return { status: 'refused', reason: 'disposed' };
      if (state.holder !== null) return { status: 'refused', reason: 'busy', holder: state.holder };
      const holder: WriteLatchHolder = Object.freeze({ id: nextId, label });
      nextId += 1;
      const { epoch } = state;
      const controller = new AbortController();
      running.add(controller);
      let submitted = false;
      const isCurrent = (): boolean => !disposed && state.epoch === epoch;
      const context: WriteRunContext = {
        signal: controller.signal,
        isCurrent,
        markSubmitted: () => {
          submitted = true;
        },
      };
      commit({ holder, epoch: state.epoch });
      let outcome: WriteRunOutcome<T>;
      try {
        const value = await fn(context);
        outcome = isCurrent() ? { status: 'done', value } : abandoned<T>(submitted);
      } catch (error) {
        outcome = isCurrent() ? { status: 'failed', error } : abandoned<T>(submitted, error);
      } finally {
        running.delete(controller);
        // A stale or repeated release changes nothing: only the holder frees the latch.
        if (holderId() === holder.id) commit({ holder: null, epoch: state.epoch });
      }
      return outcome;
    },

    bump() {
      if (disposed) return;
      const stale = [...running];
      commit({ holder: state.holder, epoch: state.epoch + 1 });
      abandon(stale);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      state = Object.freeze({ holder: state.holder, epoch: state.epoch + 1 });
      abandon([...running]);
      listeners.clear();
    },
  };
}

/** What an abandoned run reports: before it handed anything over nothing was sent; after, the outcome is unknown. */
function abandoned<T>(submitted: boolean, ...error: [unknown?]): WriteRunOutcome<T> {
  if (!submitted) return { status: 'dropped' };
  return error.length > 0 ? { status: 'unknown-outcome', error: error[0] } : { status: 'unknown-outcome' };
}
