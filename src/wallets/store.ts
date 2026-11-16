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
  /**
   * A load for the current wallet is in flight, or queued behind the wallet call in flight (an action of this wallet or
   * a previous one, the previous wallet's load, or the load before a Retry).
   */
  readonly loading: boolean;
  /** The last load's failure. A rate limit has kind `rate-limited`, so offer `refresh()` after a moment. */
  readonly loadError: WalletErrorDescription | null;
  /** The running action's id. */
  readonly running: string | null;
  /**
   * True while any wallet call is in flight or a load is queued: an action, or a load (the first one, a Retry, the
   * reload after an action), for the current wallet or a previous one. Disable every action button. `run()` refuses
   * meanwhile, so only one wallet call is ever in flight.
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
   * Reload the snapshot (the Retry button). Starts at once when no wallet call is in flight; otherwise it is queued and
   * runs once that call settles (the load in flight may have read before what prompted the refresh). Queued loads are
   * coalesced into one, so a refresh during a write is the reload after it. Ignored while disconnected.
   */
  refresh(): void;
  /**
   * Run one wallet call (a write, a preview, `signMessage`). Resolves false without calling `action` while busy (any
   * wallet call in flight or load queued) or disconnected; the check is synchronous, so a double click is refused at
   * once. Afterwards it reloads the snapshot, even when the action failed, because a failed write may have committed,
   * and stays busy until that reload answers. A write that settles after its session ended records `interrupted`, never
   * `succeeded` (or nothing when it was refused unsent, below). Resolves true when the action succeeded for a session
   * that is still current. `action` resolves with a message to show, or nothing.
   *
   * `readOnly: true` marks a call that commits nothing (a preview, `signMessage`): no reload follows, and one that
   * settles after its session ended records no outcome instead of `interrupted`.
   *
   * A `TransferPlan`, or any token wallet kept from an earlier run, is bound to the wallet session that made it: submit
   * it only in a run of that same `wallet`. A token wallet the store opened (with the default `open`, or a custom one
   * that passes `isActive` on) refuses every write once its `ConnectedWallet` is no longer the session's, with
   * `invalid-input` and before anything is read or signed, so a plan made for one account is never submitted after the
   * session switched to another. A run that is still current records that refusal as a `failed` outcome. A run whose
   * session ended while it ran, and whose action rejected with a refusal (`TokenWalletError`, `describeWalletError`
   * kind `refused`: nothing was submitted), records no outcome rather than `interrupted`.
   */
  run(
    id: string,
    action: (context: WalletActionContext<W>) => Promise<string | void>,
    options?: { readonly readOnly?: boolean }
  ): Promise<boolean>;
  /**
   * Stop following the session; pending replies are dropped, a queued load never starts and no further view is
   * published.
   */
  dispose(): void;
}

/** What `open` gets besides the connected wallet. */
export interface OpenTokenWalletContext {
  /**
   * Whether `wallet` is still the session's connected wallet (`session.isCurrent(wallet)`). Pass it as the token
   * wallet's `isActive`, so its writes, and the `TransferPlan`s it made, are refused once the session left `wallet`.
   */
  readonly isActive: () => boolean;
}

export interface TokenWalletStoreOptions<W extends TokenStandardWallet> {
  readonly session: Cip103Session;
  /**
   * Builds the token wallet of each connected wallet. Default: `createTokenWallet({ provider, partyId, network,
   * isActive })`, which needs `wallet.network` (a wallet without one gets a `refused` load error). Pass
   * `context.isActive` on as the token wallet's `isActive`, as the default does, or a plan made for one wallet can
   * still be submitted after the session switched to another.
   */
  readonly open?: (wallet: ConnectedWallet, context: OpenTokenWalletContext) => W;
}

/** Whether the outcome leaves open if a write committed: `interrupted`, or a failure the wallet could not confirm. */
function outcomeUnknown(outcome: ActionOutcome): boolean {
  return outcome.status === 'interrupted' || (outcome.status === 'failed' && outcome.error.kind === 'outcome-unknown');
}

/** Whether `error` is the SDK's refusal before anything was submitted (`TokenWalletError`). */
function refusedUnsent(error: unknown): boolean {
  return describeWalletError(error).kind === 'refused';
}

/** The default token wallet: DA's registry for the network the wallet connected for, acting as its party only. */
function openTokenWallet(wallet: ConnectedWallet, context: OpenTokenWalletContext): TokenWallet {
  const { provider, partyId, network } = wallet;
  if (network === undefined) {
    throw new TokenWalletError(
      'invalid-input',
      'The connected wallet names no network: connect with { network }, or pass open to createTokenWalletStore'
    );
  }
  return createTokenWallet({ provider, partyId, network, isActive: context.isActive });
}

/**
 * The observable state and actions of a token wallet page over `session`. The store follows the session: each new
 * `ConnectedWallet` gets its own token wallet (from `open`) and a fresh load, and its state is cleared.
 *
 * One wallet call at a time: an execution latch counts every call in flight (actions and loads, of the current wallet
 * or a previous one, since a dropped reply does not cancel its request). `run()` refuses while it is held. A load asked
 * for meanwhile (a new wallet's first load, a Retry, the reload after a write) is queued; queued loads coalesce into
 * one, which runs for the wallet current when the latch frees. Ending the session drops the queued load, and so does
 * `dispose()`. A wallet call that never settles holds the latch, since it cannot be cancelled. The token wallet's own
 * write latch (`busy`) stays as the inner guard.
 */
export function createTokenWalletStore(options: TokenWalletStoreOptions<TokenWallet>): TokenWalletStore<TokenWallet>;
export function createTokenWalletStore<W extends TokenStandardWallet>(
  options: TokenWalletStoreOptions<W> & {
    readonly open: (wallet: ConnectedWallet, context: OpenTokenWalletContext) => W;
  }
): TokenWalletStore<W>;
export function createTokenWalletStore<W extends TokenStandardWallet>(
  options: TokenWalletStoreOptions<W>
): TokenWalletStore<W> {
  type S = Awaited<ReturnType<W['loadState']>>;
  const { session } = options;
  // Without `open`, the first overload fixes W to TokenWallet.
  const open =
    options.open ?? (openTokenWallet as unknown as (wallet: ConnectedWallet, context: OpenTokenWalletContext) => W);
  const listeners = new Set<() => void>();

  let sessionState = session.getSnapshot();
  let wallet: ConnectedWallet | null = null;
  let tokens: W | null = null;
  let state: S | null = null;
  let loadError: WalletErrorDescription | null = null;
  // Stale replies: every load and wallet change takes a new number; a load's reply counts only while its number is the
  // latest and its wallet still current. This drops replies; it does not free the latch.
  let generation = 0;
  // Execution latch: wallet calls (actions and loads, of any wallet) asked and not yet settled.
  let inFlight = 0;
  // A load for the current wallet waits for the latch (one at most: queued loads coalesce).
  let queued = false;
  // A load for the current wallet is in flight.
  let loadInFlight = false;
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
      loading: loadInFlight || queued,
      loadError,
      running: running?.id ?? null,
      busy: inFlight > 0 || queued,
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

  /**
   * Ask for a load of the current wallet's snapshot: it starts now when no wallet call is in flight, and otherwise
   * waits for the latch (`drain`). Publishes.
   */
  function requestLoad(): void {
    // A session listener that runs before this store's own may ask after the session left `wallet`: the store's
    // pending `onSession` then resets it, and no load goes to a wallet whose session ended.
    if (disposed || wallet === null || tokens === null || !session.isCurrent(wallet)) return;
    queued = true;
    drain();
  }

  /** Start the queued load if the latch is free, then publish. Called whenever the latch may have freed. */
  function drain(): void {
    if (disposed) return;
    // A wallet the session has left gets no load: `onSession` drops the queued load and queues the next wallet's. A
    // session that left it without publishing (`dispose()`) never calls `onSession`, so the queued load is dropped here:
    // a wallet never becomes current again once the session left it.
    if (queued && wallet !== null && !session.isCurrent(wallet)) queued = false;
    if (queued && inFlight === 0 && wallet !== null && tokens !== null) {
      queued = false;
      startLoad(wallet, tokens);
    }
    publish();
  }

  /**
   * Load `forWallet`'s snapshot, holding the latch until the wallet answers. The reply is dropped when another wallet
   * superseded it (loads never overlap, so a newer load of the same wallet cannot); the latch frees either way, and the
   * queued load, if any, starts.
   */
  function startLoad(forWallet: ConnectedWallet, forTokens: W): void {
    const attempt = ++generation;
    inFlight += 1;
    loadInFlight = true;
    const current = (): boolean => !disposed && attempt === generation && forWallet === wallet;
    void (async () => {
      let next: { readonly ok: true; readonly snapshot: S } | { readonly ok: false; readonly error: unknown };
      try {
        next = { ok: true, snapshot: (await forTokens.loadState()) as S };
      } catch (error) {
        next = { ok: false, error };
      }
      inFlight -= 1;
      if (disposed) return;
      if (current()) {
        loadInFlight = false;
        if (next.ok) {
          state = next.snapshot;
          loadError = null;
        } else {
          state = null; // nothing is offered from a stale snapshot
          loadError = describeWalletError(next.error);
        }
      }
      drain();
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
    generation += 1; // drop the previous wallet's load reply (its call still holds the latch until it settles)
    queued = false; // a queued load was for the previous wallet
    loadInFlight = false;
    state = null;
    loadError = null;
    tokens = null;
    // Another wallet never sees this one's result, but a write whose outcome is unknown stays reported.
    if (outcome !== null && !outcomeUnknown(outcome)) outcome = null;
    if (next === null) {
      publish();
      return;
    }
    try {
      tokens = open(next, { isActive: () => session.isCurrent(next) });
    } catch (error) {
      loadError = describeWalletError(error);
      publish();
      return;
    }
    requestLoad(); // queued while the previous wallet's call is in flight
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
      requestLoad();
    },

    async run(id, action, runOptions = {}) {
      // Synchronous, before the first await: a second call in the same tick is refused.
      const ranFor = wallet;
      const ranTokens = tokens;
      if (disposed || inFlight > 0 || queued || ranFor === null || ranTokens === null) return false;
      const readOnly = runOptions.readOnly === true;
      const previous = outcome;
      inFlight += 1;
      running = { id, wallet: ranFor, readOnly };
      outcome = null;
      publish();
      // A listener of that publish may have ended the session, switched the wallet or disposed the store: then the
      // action must not start (nothing was sent, so no outcome is recorded), and queued work runs instead. A previous
      // write whose outcome is unknown stays reported, as it does across a wallet change.
      if (!isCurrent(ranFor)) {
        inFlight -= 1;
        running = null;
        if (previous !== null && outcomeUnknown(previous)) outcome = previous;
        drain();
        return false;
      }

      let settled:
        { readonly ok: true; readonly message: string | null } | { readonly ok: false; readonly error: unknown };
      try {
        const message = await action({ tokens: ranTokens, wallet: ranFor });
        settled = { ok: true, message: typeof message === 'string' ? message : null };
      } catch (error) {
        settled = { ok: false, error };
      }

      inFlight -= 1;
      running = null;
      const live = isCurrent(ranFor);
      const { partyId } = ranFor;
      if (!live) {
        // Whether a write committed is unknown, unless the SDK refused it before submitting anything (the token
        // wallet's check before signing, once its session ended mid-write).
        outcome =
          readOnly || (!settled.ok && refusedUnsent(settled.error)) ? null : { id, partyId, status: 'interrupted' };
      } else if (settled.ok) {
        outcome = { id, partyId, status: 'succeeded', message: settled.message };
      } else {
        outcome = { id, partyId, status: 'failed', error: describeWalletError(settled.error) };
      }
      // A failed write may still have committed, so reload after failures too. This only reads; nothing is retried.
      if (live && !readOnly) queued = true;
      // Start the queued load: this write's reload, a refresh asked meanwhile, or the first load of a wallet that
      // replaced this action's one. Busy until it answers.
      drain();
      return live && settled.ok;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      queued = false;
      unsubscribe();
      listeners.clear();
    },
  };
}
