/**
 * A page's wallet connection on one DA network: which wallet options it offers, which one is wanted, restoring the one
 * remembered from an earlier visit, and connecting the session to it. It owns the page's `Cip103Session` and
 * `WalletStore`, shares one write latch with them, and remembers the choice in browser storage.
 *
 * Observable for any UI framework: `subscribe` and `getSnapshot` (React: `useSyncExternalStore`). The snapshot carries
 * codes, never sentences: the page words them.
 */
import { MAX_TIMER_MS } from './abort';
import type { Cip103Provider } from './cip103';
import type { DaNetwork } from './da-utilities/client';
import { describeWalletError, type WalletErrorDescription } from './errors';
import { createWriteLatch, type WriteLatch } from './latch';
import { notifyListeners } from './notify';
import type {
  LiveWalletOption,
  LoadedWalletOption,
  WalletAvailability,
  WalletOption,
  WalletOptionInfo,
} from './options';
import { createCip103Session, type Cip103Session, type Cip103SessionState, type ConnectedWallet } from './session';
import { globalStorage, readStorage, writeStorage, type StorageLike } from './storage';
import { createWalletStore, type WalletStore, type WalletStoreOptions } from './store';

/** {@link createWalletConnector}'s input. */
export interface WalletConnectorInput {
  /**
   * The DA network, or null where DA runs none: every option is then `unsupported-network`, and `session`/`store` are
   * null.
   */
  readonly network: DaNetwork | null;
  /** The fixed options: Loop, a live option such as a Privy session's, an app's own. Keys must be unique. */
  readonly options: readonly WalletOption[];
  /**
   * Options found at run time, such as `(signal) => extensionWalletOptions({ signal })`. Run once at creation and again
   * on `rediscover()`. An option whose key a fixed option has is ignored.
   */
  readonly discover?: (signal: AbortSignal) => Promise<readonly WalletOption[]>;
  /**
   * Where the remembered wallet (`local`) and the selected-setup flag (`session`) are kept. Defaults: the page's
   * `localStorage` and `sessionStorage`. `null` disables one.
   */
  readonly storage?: { readonly local?: StorageLike | null; readonly session?: StorageLike | null };
  /** Prefix of the two storage keys, `${storageKey}.wallet` and `${storageKey}.selected`. Default `canton-wallet`. */
  readonly storageKey?: string;
  /**
   * How long a restore of a remembered loaded option may take before it is abandoned and forgotten. Default 15 000 ms;
   * at most `MAX_TIMER_MS`.
   */
  readonly restoreTimeoutMs?: number;
  /** Store options other than `session`, `latch`, `retainKey` and `connectingRetainKey`, which the connector supplies. */
  readonly store?: Omit<WalletStoreOptions, 'session' | 'latch' | 'retainKey' | 'connectingRetainKey'>;
  /** Shared with the app's other writers (a wallet setup session). Default: a new one. */
  readonly latch?: WriteLatch;
}

/**
 * - `disconnected`: nothing is wanted;
 * - `restoring`: restoring a remembered loaded option silently (`cancel()` abandons it);
 * - `preparing`: a live option is wanted and offers no provider yet: the app shows its setup UI;
 * - `connecting`: a connect is in flight, its option's provider still loading included (`cancel()` ends it);
 * - `connected`;
 * - `reconnecting`: a live option offered a new provider for the same retain key; `connection` is the held one (`stale:
 *   true`).
 */
export type WalletConnectorStatus =
  'disconnected' | 'restoring' | 'preparing' | 'connecting' | 'connected' | 'reconnecting';

/** A connected wallet, with the option it came through. */
export interface WalletConnection {
  /** Stable UI key: `${option.key}:${retainKey}` for live options, else the session wallet's `key`. */
  readonly key: string;
  readonly option: WalletOptionInfo;
  /** The session's connected wallet (provider, party, network, key). */
  readonly wallet: ConnectedWallet;
}

/** An option as the snapshot shows it. */
export interface WalletOptionState extends WalletOptionInfo {
  readonly mode: 'load' | 'live';
  readonly availability: WalletAvailability;
  /** Loaded options: their preload state. Live options: `ready` once they offer a provider, else `idle`. */
  readonly provider: 'idle' | 'loading' | 'ready' | 'failed';
  /** Why the last preload failed. */
  readonly loadError: WalletErrorDescription | null;
}

/** Why the last connect, select or option load failed. */
export interface WalletConnectorError {
  /**
   * - `load-failed`: an option's `load` rejected (`description` from `describeWalletError`);
   * - `connect-failed`: the session's connect failed (`description` is the session's own error; 4001 is `declined`);
   * - `unavailable`: `connect(key)` for an option whose availability is false (`availability` says why).
   */
  readonly code: 'load-failed' | 'connect-failed' | 'unavailable';
  readonly key: string;
  readonly description: WalletErrorDescription | null;
  readonly availability?: WalletAvailability;
}

/** What {@link WalletConnector.getSnapshot} returns: the same frozen object until something changes. */
export interface WalletConnectorSnapshot {
  readonly network: DaNetwork | null;
  readonly status: WalletConnectorStatus;
  /** The option being restored, prepared, connected or reconnected; null when disconnected. */
  readonly target: WalletOptionInfo | null;
  /**
   * The live option whose setup UI is open. It survives a reload in this tab (session storage), so a login redirect
   * lands back on it.
   */
  readonly selected: string | null;
  /**
   * The live connection, or the held one while `reconnecting`. Null while `connecting`, also while a loaded option's
   * provider loads and the session is still on the previous wallet.
   */
  readonly connection: WalletConnection | null;
  /** `connection` is the held one. */
  readonly stale: boolean;
  /** Fixed options first, then discovered ones in discovery order. */
  readonly options: readonly WalletOptionState[];
  readonly discovering: boolean;
  /** Cleared by the next connect, select, cancel or disconnect. A restore never sets it. */
  readonly error: WalletConnectorError | null;
}

/** How a `connect()` ended. */
export type WalletConnectResult =
  | { readonly status: 'connected' }
  /** A live option without a provider yet: it connects on its own once one appears. */
  | { readonly status: 'preparing' }
  /** See `snapshot.error`. */
  | { readonly status: 'failed' }
  /** `cancel()`, `disconnect()`, another `connect()` or `dispose()` superseded it. */
  | { readonly status: 'cancelled' }
  | {
      readonly status: 'refused';
      readonly reason: 'busy' | 'unavailable' | 'unknown-option' | 'no-network' | 'disposed';
    };

/** A page's wallet connection. Create it with {@link createWalletConnector}. */
export interface WalletConnector {
  subscribe(listener: () => void): () => void;
  getSnapshot(): WalletConnectorSnapshot;
  /** Null when `network` is null. */
  readonly session: Cip103Session | null;
  /** Null when `network` is null. */
  readonly store: WalletStore | null;
  readonly latch: WriteLatch;
  /**
   * The user's click. Refused while the latch is held (`busy`). It retires any restore and bumps the latch. A live
   * option is remembered at once, and `selected` is cleared unless it is that option; without a provider yet, the
   * previous wallet is left and the result is `preparing`. A loaded option is remembered, and the previous live option
   * and `selected` cleared, only once the session leaves the previous wallet for it (and it is remembered only once
   * connected): a load that fails keeps the previous wallet. With a preloaded provider, `session.connect` is called
   * synchronously inside the click (a wallet's sign-in window needs the gesture); otherwise it loads first, and is
   * refused `busy` if a write took the latch meanwhile (the provider stays ready). Each call is a new attempt, so a
   * click after a cancelled or failed connect retries it. It never rejects.
   */
  connect(key: string): Promise<WalletConnectResult>;
  /**
   * Opens a live option's setup UI without connecting (`selected = key`), or closes it (`null`, "choose another
   * wallet"). Closing forgets the remembered key when it is that option's, and stops wanting a live option a
   * `connect()` is still preparing. Refused (false) while the latch is held or `connecting`, and for a key that names
   * no live option.
   */
  select(key: string | null): boolean;
  /**
   * Loads loaded options' providers (all available ones, or `keys`) while the chooser is open, so a click connects at
   * once. Returns a release that aborts loads still pending; finished ones stay ready.
   */
  preload(keys?: readonly string[]): () => void;
  /** Runs `discover` again; options that disappear lose their preload. */
  rediscover(): Promise<void>;
  /**
   * - `restoring`: abandon the restore, and forget its key if it is still the remembered one;
   * - `connecting` / `reconnecting`: the same, forget the cancelled option's key if it is still the remembered one, then
   *   `session.disconnect()` (the CIP-0103 disconnect ends the wallet's own sign-in window). A connect still loading
   *   its option's provider stops loading and never connects; a wallet the session is connected to stays, since the
   *   connect had not left it yet;
   * - `preparing`: stop wanting the live option (`selected` stays) and forget its key if it is the remembered one;
   * - Otherwise nothing.
   */
  cancel(): void;
  /** Retires any restore, bumps the latch, disconnects the session, clears target and selected, forgets both keys. */
  disconnect(): void;
  /**
   * Stops everything: the restore, preloads and discovery; unsubscribes from live options; bumps and disposes the latch
   * only if the connector created it; disposes the store; and sends a best-effort CIP-0103 disconnect for a connected
   * wallet before disposing the session. Storage is not touched, so a later connector for the same network restores.
   * Afterwards every method is a no-op or refused `disposed`.
   */
  dispose(): void;
}

/** The default {@link WalletConnectorInput.restoreTimeoutMs}. */
export const DEFAULT_RESTORE_TIMEOUT_MS = 15_000;

const UNSUPPORTED: WalletAvailability = Object.freeze({ available: false, reason: 'unsupported-network' });
const DISCONNECTED: Cip103SessionState = Object.freeze({ status: 'disconnected', error: null });
/** A wallet the session connected outside the connector (through `connector.session` directly). */
const UNKNOWN_OPTION: WalletOptionInfo = Object.freeze({ key: 'unknown', kind: 'unknown', name: 'CIP-0103 wallet' });

/** The provider the session was last asked to connect or restore, and the option it came from. */
interface Via {
  readonly provider: Cip103Provider;
  readonly option: WalletOption;
  /** A live option's retain key when it was connected. */
  readonly retainKey: string | null;
  /**
   * The party the retain key belongs to: the first wallet the session connects through this provider. A wallet for
   * another party (the provider's `accountsChanged`) does not keep it.
   */
  party: string | null;
}

/** A loaded option's preload. */
interface Preload {
  readonly provider: 'idle' | 'loading' | 'ready' | 'failed';
  readonly loaded: Cip103Provider | null;
  readonly loadError: WalletErrorDescription | null;
  readonly controller: AbortController | null;
}

interface RestoreRun {
  readonly key: string;
  readonly controller: AbortController;
  timer: ReturnType<typeof setTimeout> | undefined;
  option: WalletOptionInfo | null;
}

const IDLE: Preload = { provider: 'idle', loaded: null, loadError: null, controller: null };

function info(option: WalletOption): WalletOptionInfo {
  const { key, kind, name, icon } = option;
  return Object.freeze(icon === undefined ? { key, kind, name } : { key, kind, name, icon });
}

/**
 * A wallet connection for `input.network`: the session, the store over it and the shared latch, plus restore and
 * remember (see {@link WalletConnector}). Create one per network a page serves, and `dispose()` it when the page leaves
 * that network.
 */
export function createWalletConnector(input: WalletConnectorInput): WalletConnector {
  const { network, discover } = input;
  const storageKey = input.storageKey ?? 'canton-wallet';
  const walletStorageKey = `${storageKey}.wallet`;
  const selectedStorageKey = `${storageKey}.selected`;
  const restoreTimeoutMs = input.restoreTimeoutMs ?? DEFAULT_RESTORE_TIMEOUT_MS;
  if (!Number.isFinite(restoreTimeoutMs) || restoreTimeoutMs < 0 || restoreTimeoutMs > MAX_TIMER_MS) {
    throw new RangeError(`createWalletConnector: restoreTimeoutMs must be between 0 and ${MAX_TIMER_MS}`);
  }
  const local = input.storage?.local === undefined ? globalStorage('local') : input.storage.local;
  const tab = input.storage?.session === undefined ? globalStorage('session') : input.storage.session;
  const ownsLatch = input.latch === undefined;
  const latch = input.latch ?? createWriteLatch();
  const listeners = new Set<() => void>();
  const fixed = input.options;

  let via: Via | null = null;
  let discovered: readonly WalletOption[] = [];
  const preloads = new Map<string, Preload>();
  let restore: RestoreRun | null = null;
  // A loaded option's connect that is still loading its provider.
  let pendingLoad: { readonly option: LoadedWalletOption; readonly controller: AbortController } | null = null;
  // The live option wanted, and the provider the connector last connected the session to for it.
  let live: { readonly option: LiveWalletOption; connected: Cip103Provider | null } | null = null;
  // The connection shown while a live option reconnects with a new provider for the same retain key.
  let held: WalletConnection | null = null;
  let lastConnection: WalletConnection | null = null;
  // Every connect takes a new number; a connect whose number is no longer the latest reports `cancelled`.
  let attempts = 0;
  // Wakes the connects waiting on the session when a newer attempt supersedes them, so they report at once.
  const superseders = new Set<() => void>();
  let selected: string | null = null;
  let error: WalletConnectorError | null = null;
  let discovery: { readonly controller: AbortController; readonly promise: Promise<void> } | null = null;
  let discovering = false;
  let disposed = false;
  // Per key, the option object subscribed to and its unsubscribe: a replacement with the same key is subscribed anew.
  const liveSubscriptions = new Map<string, { readonly option: WalletOption; readonly unsubscribe: () => void }>();

  /** Read through a call, so a check after an await is not narrowed by one before it. */
  function isDisposed(): boolean {
    return disposed;
  }

  /** Whether a connect that took `attempt` was superseded (by another connect, a cancel, a disconnect or dispose). */
  function superseded(attempt: number): boolean {
    return disposed || attempt !== attempts;
  }

  /** Start a new attempt: every connect in flight is superseded and reports `cancelled` now. */
  function nextAttempt(): number {
    attempts += 1;
    for (const wake of [...superseders]) wake();
    superseders.clear();
    return attempts;
  }

  /** The UI key of a session wallet: the live option's retain key when it came through one. */
  function connectionKey(wallet: ConnectedWallet): string {
    if (via !== null && via.provider === wallet.provider && via.option.mode === 'live') {
      via.party ??= wallet.partyId;
      const retained = via.party === wallet.partyId ? via.retainKey : null;
      return `${via.option.key}:${retained ?? wallet.key}`;
    }
    return wallet.key;
  }

  const session = network === null ? null : createCip103Session({ network });
  const store =
    session === null
      ? null
      : createWalletStore({
          ...input.store,
          session,
          latch,
          retainKey: (wallet) => connectionKey(wallet),
          // The store holds its snapshot through a connect only while this connector holds the connection
          // (`reconnecting`: a rebuilt provider for the same retain key), never through a connect to another wallet.
          connectingRetainKey: () => held?.key ?? null,
        });

  function options(): readonly WalletOption[] {
    return [...fixed, ...discovered];
  }

  function findOption(key: string): WalletOption | undefined {
    return options().find((option) => option.key === key);
  }

  function sessionState(): Cip103SessionState {
    return session?.getSnapshot() ?? DISCONNECTED;
  }

  function availability(option: WalletOption): WalletAvailability {
    if (network === null) return UNSUPPORTED;
    try {
      return option.availability(network);
    } catch {
      return UNSUPPORTED;
    }
  }

  function currentConnection(): WalletConnection | null {
    const state = sessionState();
    if (state.status !== 'connected') return null;
    const { wallet } = state;
    const key = connectionKey(wallet);
    if (lastConnection?.wallet === wallet && lastConnection.key === key) return lastConnection;
    const option = via !== null && via.provider === wallet.provider ? info(via.option) : UNKNOWN_OPTION;
    lastConnection = Object.freeze({ key, option, wallet });
    return lastConnection;
  }

  function status(): WalletConnectorStatus {
    // The user's connect is loading its option's provider: it is in flight even while the session is still on the
    // previous wallet (or still signing in to an earlier one), and cancel() must reach it.
    if (pendingLoad !== null) return 'connecting';
    const state = sessionState();
    if (state.status === 'connected') return 'connected';
    if (state.status === 'connecting') return held !== null ? 'reconnecting' : 'connecting';
    if (restore !== null) return 'restoring';
    if (live !== null && network !== null) return 'preparing';
    return 'disconnected';
  }

  function target(current: WalletConnectorStatus, connection: WalletConnection | null): WalletOptionInfo | null {
    switch (current) {
      case 'connected':
        return connection?.option ?? null;
      case 'reconnecting':
        return held?.option ?? null;
      case 'restoring':
        return restore?.option ?? null;
      case 'connecting':
        if (pendingLoad !== null) return info(pendingLoad.option);
        return via === null ? null : info(via.option);
      case 'preparing':
        return live === null ? null : info(live.option);
      case 'disconnected':
        return null;
    }
  }

  function optionState(option: WalletOption): WalletOptionState {
    const base = { ...info(option), mode: option.mode, availability: availability(option) };
    if (option.mode === 'live') {
      let offers = false;
      try {
        offers = option.live.getProvider() !== null;
      } catch {
        offers = false;
      }
      return Object.freeze({ ...base, provider: offers ? 'ready' : 'idle', loadError: null });
    }
    const preload = preloads.get(option.key) ?? IDLE;
    return Object.freeze({ ...base, provider: preload.provider, loadError: preload.loadError });
  }

  function buildSnapshot(): WalletConnectorSnapshot {
    const current = status();
    const connection = current === 'reconnecting' ? held : current === 'connecting' ? null : currentConnection();
    return Object.freeze({
      network,
      status: current,
      target: target(current, connection),
      selected,
      connection,
      stale: current === 'reconnecting' && connection !== null,
      options: Object.freeze(options().map(optionState)),
      discovering,
      error,
    });
  }

  let snapshot = buildSnapshot();

  function publish(): void {
    if (disposed) return;
    snapshot = buildSnapshot();
    notifyListeners(listeners);
  }

  function setSelected(key: string | null): void {
    selected = key;
    writeStorage(tab, selectedStorageKey, key);
  }

  // ----- restore -----

  function retireRestore(): void {
    const run = restore;
    if (run === null) return;
    restore = null;
    clearTimeout(run.timer);
    run.controller.abort();
  }

  /** Cancel or the timeout: retire the run and forget its wallet, unless the user picked another since. */
  function abandonRestore(run: RestoreRun): void {
    if (restore !== run) return;
    retireRestore();
    if (readStorage(local, walletStorageKey) === run.key) writeStorage(local, walletStorageKey, null);
  }

  /** Waits for discovery to settle (a rediscovery started meanwhile included). Never rejects. */
  async function discoverySettled(): Promise<void> {
    let awaited: Promise<void> | null = null;
    while (discovery !== null && discovery.promise !== awaited) {
      awaited = discovery.promise;
      await awaited;
    }
  }

  /**
   * Restore the loaded option remembered under `key`: resolve it (after discovery when it is not a fixed option), load
   * its provider, then `session.restore(provider)`. Retiring the run aborts its signal: the session drops an aborted
   * restore without changing anything, so a retired run never connects late and never disconnects a wallet.
   */
  function startRestore(key: string, forSession: Cip103Session, forNetwork: DaNetwork): void {
    const run: RestoreRun = { key, controller: new AbortController(), timer: undefined, option: null };
    restore = run;
    run.timer = setTimeout(() => {
      abandonRestore(run);
      publish();
    }, restoreTimeoutMs);
    const { signal } = run.controller;
    void (async () => {
      try {
        let option = findOption(key);
        if (option === undefined) {
          await discoverySettled();
          if (restore !== run) return;
          option = findOption(key);
        }
        if (option?.mode === 'live') {
          // A discovered live option: the same recovery as a fixed one.
          restore = null;
          clearTimeout(run.timer);
          wantRemembered(option);
          publish();
          return;
        }
        // Nothing has it (an extension no longer installed): the key stays for a later visit.
        if (option?.mode !== 'load' || !availability(option).available) return;
        run.option = info(option);
        publish();
        const provider = await option.load(forNetwork, signal);
        if (restore !== run) return;
        via = { provider, option, retainKey: null, party: null };
        // Connects only when the wallet still reports its session; rejects only when the run was retired.
        await forSession.restore(provider, { signal });
      } catch {
        // Retired, or the wallet is gone or could not be set up: the page starts disconnected.
      } finally {
        if (restore === run) {
          restore = null;
          clearTimeout(run.timer);
          publish();
        }
      }
    })();
  }

  // ----- connecting -----

  /** How a connect of `provider` (attempt `attempt`) ended, once `session.connect` settled. */
  function settle(attempt: number, key: string, provider: Cip103Provider): WalletConnectResult {
    if (superseded(attempt)) return { status: 'cancelled' };
    const state = sessionState();
    if (state.status === 'connected' && state.wallet.provider === provider) return { status: 'connected' };
    if (state.status === 'disconnected' && state.error !== null) {
      error = Object.freeze({ code: 'connect-failed', key, description: state.error });
      publish();
      return { status: 'failed' };
    }
    return { status: 'cancelled' };
  }

  async function connectProvider(
    forSession: Cip103Session,
    option: WalletOption,
    provider: Cip103Provider,
    retainKey: string | null
  ): Promise<WalletConnectResult> {
    const attempt = nextAttempt();
    via = { provider, option, retainKey, party: null };
    // Started synchronously: inside the user's click when nothing was awaited before.
    const pending = forSession.connect(provider).catch(() => undefined); // rejects only for a signal; none is passed
    publish();
    // A superseded connect reports at once; the session drops its late answer itself.
    let wake: () => void = () => undefined;
    const woken = new Promise<void>((resolve) => {
      wake = resolve;
    });
    superseders.add(wake);
    await Promise.race([pending, woken]);
    superseders.delete(wake);
    return settle(attempt, option.key, provider);
  }

  /** Connect the wanted live option's current provider, unless it is the one already connected or a write runs. */
  function evaluateLive(): void {
    if (disposed || session === null || live === null) return;
    const wanted = live;
    let provider: Cip103Provider | null;
    let retainKey: string | null;
    try {
      provider = wanted.option.live.getProvider();
      retainKey = wanted.option.live.getRetainKey();
    } catch {
      provider = null;
      retainKey = null;
    }
    if (provider === null) {
      const previous = wanted.connected;
      if (previous === null) return;
      // Torn down (logout, another wallet or party): leave it.
      wanted.connected = null;
      held = null;
      const state = sessionState();
      const onIt =
        (state.status === 'connected' && state.wallet.provider === previous) ||
        (state.status === 'connecting' && via?.provider === previous);
      if (onIt) session.disconnect();
      publish();
      return;
    }
    if (provider === wanted.connected) return;
    // The user's connect to a loaded option is loading: it decides first (a failure evaluates again).
    if (pendingLoad !== null) return;
    // An option that cannot connect here offers nothing: its next change evaluates again.
    if (!availability(wanted.option).available) return;
    // Never reconnect under a write: the latch's release evaluates again.
    if (latch.getSnapshot().holder !== null) return;
    wanted.connected = provider;
    const current = currentConnection();
    held =
      current !== null && retainKey !== null && current.key === `${wanted.option.key}:${retainKey}` ? current : null;
    void connectProvider(session, wanted.option, provider, retainKey);
  }

  function stopPendingLoad(): void {
    if (pendingLoad === null) return;
    pendingLoad.controller.abort();
    pendingLoad = null;
  }

  // ----- discovery -----

  function unsubscribeLive(key: string): void {
    liveSubscriptions.get(key)?.unsubscribe();
    liveSubscriptions.delete(key);
  }

  function subscribeLive(option: WalletOption): void {
    const current = liveSubscriptions.get(option.key);
    if (current?.option === option) return;
    unsubscribeLive(option.key);
    if (option.mode !== 'live') return;
    const onChange = (): void => {
      if (live?.option === option) evaluateLive();
      publish();
    };
    liveSubscriptions.set(option.key, { option, unsubscribe: option.live.subscribe(onChange) });
  }

  function setDiscovered(found: readonly WalletOption[]): void {
    const fixedKeys = new Set(fixed.map((option) => option.key));
    const seen = new Set<string>();
    const next = found.filter((option) => {
      if (fixedKeys.has(option.key) || seen.has(option.key)) return false;
      seen.add(option.key);
      return true;
    });
    const nextKeys = new Set(next.map((option) => option.key));
    for (const option of discovered) {
      if (nextKeys.has(option.key)) continue;
      preloads.get(option.key)?.controller?.abort();
      preloads.delete(option.key);
      unsubscribeLive(option.key);
    }
    discovered = next;
    for (const option of next) subscribeLive(option);
    // The wanted live option was replaced by a new object with its key: want the replacement.
    const wanted = live;
    if (wanted !== null) {
      const replacement = next.find((option) => option.key === wanted.option.key);
      if (replacement !== undefined && replacement !== wanted.option && replacement.mode === 'live') {
        live = { option: replacement, connected: wanted.connected };
        evaluateLive();
      }
    }
  }

  async function runDiscover(): Promise<void> {
    if (disposed || discover === undefined) return Promise.resolve();
    discovery?.controller.abort();
    const controller = new AbortController();
    discovering = true;
    const promise = (async () => {
      try {
        // Called after `discovery` is set below, so a synchronous throw is cleaned up like a rejection.
        await Promise.resolve();
        const found = await discover(controller.signal);
        if (!isDisposed() && !controller.signal.aborted) setDiscovered(found);
      } catch {
        // Nothing found this time: the options found before stay.
      } finally {
        if (discovery?.controller === controller) {
          discovering = false;
          publish();
        }
      }
    })();
    discovery = { controller, promise };
    publish();
    await promise;
  }

  /** The remembered option is live: open its setup UI, want it, and let it start its own recovery. */
  function wantRemembered(option: LiveWalletOption): void {
    selected = option.key;
    if (network !== null) live = { option, connected: null };
    try {
      option.live.restore();
    } catch {
      // The option's own recovery failed: its setup UI is open anyway.
    }
    evaluateLive();
  }

  // ----- wiring -----

  const unsubscribeSession =
    session?.subscribe(() => {
      if (sessionState().status !== 'connecting') held = null;
      publish();
    }) ?? (() => undefined);
  // A live connect deferred while a write held the latch runs once it is free.
  const unsubscribeLatch = latch.subscribe(evaluateLive);
  for (const option of fixed) subscribeLive(option);

  const flagged = readStorage(tab, selectedStorageKey);
  if (flagged !== null && fixed.some((option) => option.key === flagged && option.mode === 'live')) {
    selected = flagged;
  }
  void runDiscover();
  const remembered = readStorage(local, walletStorageKey);
  if (remembered !== null) {
    const option = fixed.find((candidate) => candidate.key === remembered);
    if (option?.mode === 'live') {
      wantRemembered(option);
    } else if (session !== null && network !== null) {
      startRestore(remembered, session, network);
    }
  }
  snapshot = buildSnapshot();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot: () => snapshot,

    session,
    store,
    latch,

    async connect(key) {
      if (disposed) return { status: 'refused', reason: 'disposed' };
      if (network === null || session === null) return { status: 'refused', reason: 'no-network' };
      const option = findOption(key);
      if (option === undefined) return { status: 'refused', reason: 'unknown-option' };
      if (latch.getSnapshot().holder !== null) return { status: 'refused', reason: 'busy' };
      const available = availability(option);
      if (!available.available) {
        error = Object.freeze({ code: 'unavailable', key, description: null, availability: available });
        publish();
        return { status: 'refused', reason: 'unavailable' };
      }
      retireRestore();
      latch.bump();
      error = null;
      stopPendingLoad();
      held = null;

      if (option.mode === 'live') {
        // Remembered at once: its connect may finish only after a login redirect, which the next page load restores.
        writeStorage(local, walletStorageKey, key);
        if (selected !== null && selected !== key) setSelected(null);
        // A new attempt: the same provider connects again (after a cancelled or failed connect).
        live = { option, connected: null };
        let provider: Cip103Provider | null;
        let retainKey: string | null;
        try {
          provider = option.live.getProvider();
          retainKey = option.live.getRetainKey();
        } catch {
          provider = null;
          retainKey = null;
        }
        if (provider === null) {
          nextAttempt();
          // Leave the previous wallet (or its sign-in), so it neither shows nor connects late while this one prepares.
          if (sessionState().status !== 'disconnected') session.disconnect();
          publish();
          return { status: 'preparing' };
        }
        live.connected = provider;
        return connectProvider(session, option, provider, retainKey);
      }

      // A loaded option is remembered, and the live one stops being wanted, only once the session leaves the previous
      // wallet for it: a load that fails or is refused keeps the previous wallet, its tracking and its remembered key.
      const leavePrevious = (): void => {
        live = null;
        if (selected !== null) setSelected(null);
      };
      const remember = (result: WalletConnectResult): WalletConnectResult => {
        if (result.status === 'connected') writeStorage(local, walletStorageKey, key);
        return result;
      };
      const preload = preloads.get(key);
      if (preload?.provider === 'ready' && preload.loaded !== null) {
        leavePrevious();
        return remember(await connectProvider(session, option, preload.loaded, null));
      }
      const attempt = nextAttempt();
      const controller = new AbortController();
      pendingLoad = { option, controller };
      publish();
      let provider: Cip103Provider;
      try {
        provider = await option.load(network, controller.signal);
      } catch (failure) {
        if (superseded(attempt)) return { status: 'cancelled' };
        pendingLoad = null;
        const description = describeWalletError(failure);
        preloads.set(key, { provider: 'failed', loaded: null, loadError: description, controller: null });
        error = Object.freeze({ code: 'load-failed', key, description });
        evaluateLive();
        publish();
        return { status: 'failed' };
      }
      if (superseded(attempt)) return { status: 'cancelled' };
      pendingLoad = null;
      preloads.set(key, { provider: 'ready', loaded: provider, loadError: null, controller: null });
      // A write started while the provider loaded: connecting now would leave its wallet under it. The provider stays
      // ready, so the next click connects at once.
      if (latch.getSnapshot().holder !== null) {
        publish();
        return { status: 'refused', reason: 'busy' };
      }
      leavePrevious();
      return remember(await connectProvider(session, option, provider, null));
    },

    select(key) {
      if (disposed || latch.getSnapshot().holder !== null || status() === 'connecting') return false;
      if (key !== null) {
        if (findOption(key)?.mode !== 'live') return false;
        retireRestore();
        // Written now, so a login that redirects at once still finds it.
        setSelected(key);
        error = null;
        publish();
        return true;
      }
      const previous = selected;
      retireRestore();
      setSelected(null);
      if (previous !== null && readStorage(local, walletStorageKey) === previous) {
        writeStorage(local, walletStorageKey, null);
      }
      // Stop wanting the live option whose setup UI closes, or one a connect() is still preparing.
      const dismissed = live;
      if (
        dismissed !== null &&
        currentConnection()?.option.key !== dismissed.option.key &&
        (dismissed.option.key === previous || status() === 'preparing')
      ) {
        live = null;
        if (readStorage(local, walletStorageKey) === dismissed.option.key) writeStorage(local, walletStorageKey, null);
      }
      error = null;
      publish();
      return true;
    },

    preload(keys) {
      if (disposed || network === null) return () => undefined;
      const started: Array<{ readonly key: string; readonly controller: AbortController }> = [];
      for (const option of options()) {
        if (option.mode !== 'load' || (keys !== undefined && !keys.includes(option.key))) continue;
        if (!availability(option).available) continue;
        const current = preloads.get(option.key)?.provider;
        if (current === 'loading' || current === 'ready') continue;
        const controller = new AbortController();
        const { key } = option;
        preloads.set(key, { provider: 'loading', loaded: null, loadError: null, controller });
        started.push({ key, controller });
        const mine = (): boolean => !disposed && preloads.get(key)?.controller === controller;
        option.load(network, controller.signal).then(
          (provider) => {
            if (!mine()) return;
            preloads.set(key, { provider: 'ready', loaded: provider, loadError: null, controller: null });
            publish();
          },
          (failure: unknown) => {
            if (!mine()) return;
            preloads.set(
              key,
              controller.signal.aborted
                ? IDLE
                : { provider: 'failed', loaded: null, loadError: describeWalletError(failure), controller: null }
            );
            publish();
          }
        );
      }
      if (started.length > 0) publish();
      return () => {
        let changed = false;
        for (const { key, controller } of started) {
          const current = preloads.get(key);
          if (current?.controller !== controller || current.provider !== 'loading') continue;
          controller.abort();
          preloads.set(key, IDLE);
          changed = true;
        }
        if (changed) publish();
      };
    },

    rediscover: runDiscover,

    cancel() {
      if (disposed) return;
      const current = status();
      if (current === 'restoring') {
        if (restore !== null) abandonRestore(restore);
      } else if (current === 'connecting' || current === 'reconnecting') {
        if (restore !== null) abandonRestore(restore);
        const cancelled = target(current, null)?.key ?? null;
        if (cancelled !== null && readStorage(local, walletStorageKey) === cancelled) {
          writeStorage(local, walletStorageKey, null);
        }
        nextAttempt();
        // A connect still loading its provider has not left the session's wallet: that wallet stays. Otherwise the
        // session is signing in (or reconnecting) and is ended.
        const loadingOnly = pendingLoad !== null && sessionState().status === 'connected';
        stopPendingLoad();
        held = null;
        if (loadingOnly) evaluateLive();
        else session?.disconnect();
      } else if (current === 'preparing') {
        const dismissed = live;
        live = null;
        if (dismissed !== null && readStorage(local, walletStorageKey) === dismissed.option.key) {
          writeStorage(local, walletStorageKey, null);
        }
      } else {
        return;
      }
      error = null;
      publish();
    },

    disconnect() {
      if (disposed) return;
      retireRestore();
      latch.bump();
      nextAttempt();
      stopPendingLoad();
      live = null;
      held = null;
      session?.disconnect();
      setSelected(null);
      writeStorage(local, walletStorageKey, null);
      error = null;
      publish();
    },

    dispose() {
      if (disposed) return;
      retireRestore();
      stopPendingLoad();
      nextAttempt();
      discovery?.controller.abort();
      for (const preload of preloads.values()) preload.controller?.abort();
      for (const { unsubscribe } of liveSubscriptions.values()) unsubscribe();
      liveSubscriptions.clear();
      unsubscribeLatch();
      unsubscribeSession();
      disposed = true;
      listeners.clear();
      if (ownsLatch) {
        latch.bump();
        latch.dispose();
      }
      store?.dispose();
      if (session !== null) {
        // Best effort: the wallet's own session ends too.
        if (session.getSnapshot().status !== 'disconnected') session.disconnect();
        session.dispose();
      }
    },
  };
}
