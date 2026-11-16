/**
 * A token wallet page's state and actions over a `Cip103Session`: one token wallet per connected wallet, its ledger
 * snapshot, one wallet call at a time, a reload after every write attempt, and outcomes tagged with the session they
 * ran for, so a reply from an ended session is never shown as a success.
 *
 * Observable for any UI framework: `subscribe` and `getSnapshot` (React: `useSyncExternalStore(store.subscribe,
 * store.getSnapshot, store.getSnapshot)`).
 */
import { describeWalletError, TokenWalletError, type WalletErrorDescription } from './errors';
import type { Cip103Session, Cip103SessionState, ConnectedWallet } from './session';
import type { TokenStandardWallet } from './token-standard-wallet';
import { createTokenWallet, type TokenWallet, type TokenWalletState } from './token-wallet';

/** How the last action ended, for the party it ran as. */
export type ActionOutcome =
  | { readonly id: string; readonly partyId: string; readonly status: 'succeeded'; readonly message: string | null }
  | { readonly id: string; readonly partyId: string; readonly status: 'failed'; readonly error: WalletErrorDescription }
  /**
   * The session ended (disconnect, wallet end, account switch) before the action settled: whether it committed is
   * unknown.
   */
  | { readonly id: string; readonly partyId: string; readonly status: 'interrupted' };

export interface TokenWalletView<S = TokenWalletState> {
  readonly session: Cip103SessionState;
  /** The connected wallet the state belongs to (null when disconnected). */
  readonly wallet: ConnectedWallet | null;
  /**
   * Ledger state from one snapshot. Null until the first load answers, and cleared when a load fails or the wallet
   * changes.
   */
  readonly state: S | null;
  /** A load for the current wallet is in flight. */
  readonly loading: boolean;
  /** The last load's failure. A rate limit has kind `rate-limited`, so offer `refresh()` after a moment. */
  readonly loadError: WalletErrorDescription | null;
  /** The running action's id. */
  readonly running: string | null;
  /**
   * True while an action runs or any load (the first one, a Retry, the reload after an action) is pending: disable
   * every action button. `run()` refuses meanwhile, so only one wallet call is ever in flight.
   */
  readonly busy: boolean;
  /**
   * The last action's outcome. A wallet change clears it, except when whether it committed is unknown (`interrupted`,
   * or `failed` with kind `outcome-unknown`).
   */
  readonly outcome: ActionOutcome | null;
  /**
   * The party of a write whose outcome is unknown and is not shown as the current wallet's failure: still running for
   * an ended session, `interrupted`, or an `outcome-unknown` failure of a wallet that is no longer connected.
   */
  readonly unknownOutcomeParty: string | null;
}

export interface WalletActionContext<W> {
  /** The token wallet of `wallet`. */
  readonly tokens: W;
  /** The connected wallet the action runs for. */
  readonly wallet: ConnectedWallet;
}

export interface TokenWalletStore<W extends TokenStandardWallet = TokenWallet> {
  subscribe(listener: () => void): () => void;
  /** The current view; the same object until it changes (for `useSyncExternalStore`). */
  getSnapshot(): TokenWalletView<Awaited<ReturnType<W['loadState']>>>;
  /**
   * Reload the snapshot (the Retry button). A reply that a newer load or wallet superseded is dropped. Ignored while an
   * action runs (the reload after it follows) or while disconnected.
   */
  refresh(): void;
  /**
   * Run one wallet call (a write, a preview, `signMessage`). Resolves false without calling `action` while busy or
   * disconnected; the check is synchronous, so a double click is refused at once. Afterwards it reloads the snapshot,
   * even when the action failed, because a failed write may have committed, and stays busy until that reload answers. A
   * write that settles after its session ended records `interrupted`, never `succeeded`. Resolves true when the action
   * succeeded for a session that is still current. `action` resolves with a message to show, or nothing.
   *
   * `readOnly: true` marks a call that commits nothing (a preview, `signMessage`): no reload follows, and one that
   * settles after its session ended records no outcome instead of `interrupted`.
   */
  run(
    id: string,
    action: (context: WalletActionContext<W>) => Promise<string | void>,
    options?: { readonly readOnly?: boolean }
  ): Promise<boolean>;
  /** Stop following the session; pending replies are dropped and no further view is published. */
  dispose(): void;
}

export interface TokenWalletStoreOptions<W extends TokenStandardWallet> {
  readonly session: Cip103Session;
  /**
   * Builds the token wallet of each connected wallet. Default: `createTokenWallet({ provider, partyId, network })`,
   * which needs `wallet.network` (a wallet without one gets a `refused` load error).
   */
  readonly open?: (wallet: ConnectedWallet) => W;
}

/** Whether the outcome leaves open if a write committed: `interrupted`, or a failure the wallet could not confirm. */
function outcomeUnknown(outcome: ActionOutcome): boolean {
  return outcome.status === 'interrupted' || (outcome.status === 'failed' && outcome.error.kind === 'outcome-unknown');
}

/** The default token wallet: DA's registry for the network the wallet connected for, acting as its party only. */
function openTokenWallet(wallet: ConnectedWallet): TokenWallet {
  const { provider, partyId, network } = wallet;
  if (network === undefined) {
    throw new TokenWalletError(
      'invalid-input',
      'The connected wallet names no network: connect with { network }, or pass open to createTokenWalletStore'
    );
  }
  return createTokenWallet({ provider, partyId, network });
}

/**
 * The observable state and actions of a token wallet page over `session`. The store follows the session: each new
 * `ConnectedWallet` gets its own token wallet (from `open`) and a fresh load, and its state is cleared. Its latch
 * covers every wallet call run through it and every load (the reload after an action included), so one wallet call is
 * in flight at a time; the token wallet's own write latch (`busy`) stays as the inner guard.
 */
export function createTokenWalletStore(options: TokenWalletStoreOptions<TokenWallet>): TokenWalletStore<TokenWallet>;
export function createTokenWalletStore<W extends TokenStandardWallet>(
  options: TokenWalletStoreOptions<W> & { readonly open: (wallet: ConnectedWallet) => W }
): TokenWalletStore<W>;
export function createTokenWalletStore<W extends TokenStandardWallet>(
  options: TokenWalletStoreOptions<W>
): TokenWalletStore<W> {
  type S = Awaited<ReturnType<W['loadState']>>;
  const { session } = options;
  // Without `open`, the first overload fixes W to TokenWallet.
  const open = options.open ?? (openTokenWallet as unknown as (wallet: ConnectedWallet) => W);
  const listeners = new Set<() => void>();

  let sessionState = session.getSnapshot();
  let wallet: ConnectedWallet | null = null;
  let tokens: W | null = null;
  let state: S | null = null;
  let loading = false;
  let loadError: WalletErrorDescription | null = null;
  // Every load takes a new number; a reply counts only while its number is the latest and its wallet still current.
  let loads = 0;
  let running: { readonly id: string; readonly wallet: ConnectedWallet; readonly readOnly: boolean } | null = null;
  let outcome: ActionOutcome | null = null;
  let disposed = false;
  let view = buildView();

  function unknownOutcomeParty(): string | null {
    if (running !== null && !running.readOnly && running.wallet !== wallet) return running.wallet.partyId;
    if (outcome === null || !outcomeUnknown(outcome)) return null;
    // The current wallet's own `outcome-unknown` failure is shown as the outcome itself.
    return outcome.status === 'interrupted' || outcome.partyId !== wallet?.partyId ? outcome.partyId : null;
  }

  function buildView(): TokenWalletView<S> {
    return {
      session: sessionState,
      wallet,
      state,
      loading,
      loadError,
      running: running?.id ?? null,
      busy: running !== null || loading,
      outcome,
      unknownOutcomeParty: unknownOutcomeParty(),
    };
  }

  function publish(): void {
    if (disposed) return;
    view = buildView();
    for (const listener of [...listeners]) listener();
  }

  /** Whether `candidate` is still the wallet this store and its session show. Read after an await. */
  function isCurrent(candidate: ConnectedWallet): boolean {
    return !disposed && candidate === wallet && session.isCurrent(candidate);
  }

  /** Load the current wallet's snapshot; the reply is dropped when a newer load or another wallet superseded it. */
  function load(): void {
    const forWallet = wallet;
    const forTokens = tokens;
    if (forWallet === null || forTokens === null) return;
    const attempt = ++loads;
    loading = true;
    publish();
    const current = (): boolean => !disposed && attempt === loads && forWallet === wallet;
    void (async () => {
      let next: S;
      try {
        next = (await forTokens.loadState()) as S;
      } catch (error) {
        if (!current()) return;
        state = null; // nothing is offered from a stale snapshot
        loadError = describeWalletError(error);
        loading = false;
        publish();
        return;
      }
      if (!current()) return;
      state = next;
      loadError = null;
      loading = false;
      publish();
    })();
  }

  /** Follow the session: a new connected wallet gets a new token wallet, cleared state and a fresh load. */
  function onSession(): void {
    if (disposed) return;
    sessionState = session.getSnapshot();
    const next = sessionState.status === 'connected' ? sessionState.wallet : null;
    if (next === wallet) {
      publish();
      return;
    }
    wallet = next;
    loads += 1; // drop the previous wallet's load
    state = null;
    loading = false;
    loadError = null;
    tokens = null;
    // Another wallet never sees this one's result, but a write whose outcome is unknown stays reported.
    if (outcome !== null && !outcomeUnknown(outcome)) outcome = null;
    if (next === null) {
      publish();
      return;
    }
    try {
      tokens = open(next);
    } catch (error) {
      loadError = describeWalletError(error);
      publish();
      return;
    }
    load();
  }

  const unsubscribe = session.subscribe(onSession);
  onSession();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot: () => view,

    refresh() {
      if (disposed || running !== null) return;
      load();
    },

    async run(id, action, runOptions = {}) {
      // Synchronous, before the first await: a second call in the same tick is refused.
      const ranFor = wallet;
      const ranTokens = tokens;
      if (disposed || running !== null || loading || ranFor === null || ranTokens === null) return false;
      const readOnly = runOptions.readOnly === true;
      running = { id, wallet: ranFor, readOnly };
      outcome = null;
      publish();

      let settled:
        { readonly ok: true; readonly message: string | null } | { readonly ok: false; readonly error: unknown };
      try {
        const message = await action({ tokens: ranTokens, wallet: ranFor });
        settled = { ok: true, message: typeof message === 'string' ? message : null };
      } catch (error) {
        settled = { ok: false, error };
      }

      running = null;
      const live = isCurrent(ranFor);
      const { partyId } = ranFor;
      if (!live) {
        outcome = readOnly ? null : { id, partyId, status: 'interrupted' };
      } else if (settled.ok) {
        outcome = { id, partyId, status: 'succeeded', message: settled.message };
      } else {
        outcome = { id, partyId, status: 'failed', error: describeWalletError(settled.error) };
      }
      // A failed write may still have committed, so reload after failures too. This only reads; nothing is retried.
      if (live && !readOnly) {
        load(); // publishes, and stays busy until the reload answers
      } else {
        publish();
      }
      return live && settled.ok;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      listeners.clear();
    },
  };
}
