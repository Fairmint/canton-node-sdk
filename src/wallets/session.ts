/**
 * A CIP-0103 wallet session for a dApp: which wallet is connected, as which party, and whether a reply still belongs to
 * the session that asked. It works with any CIP-0103 provider and holds no wallet SDK: the dApp obtains the provider
 * (Loop's `loop.getCip103Provider()`, `window.canton`, …) and reports the wallet's own callbacks to it.
 *
 * Observable for any UI framework: `subscribe` and `getSnapshot` (React: `useSyncExternalStore`).
 */
import {
  cip103ErrorCode,
  cip103NetworkId,
  describeError,
  primaryAccount,
  CIP103_ERROR_CODES,
  type Cip103Account,
  type Cip103Provider,
} from './cip103';
import type { DaNetwork } from './da-utilities/client';
import { describeWalletError, WalletReadError, type WalletErrorDescription } from './errors';
import { isRecord } from './json';

/** A connected wallet. Each session is one object: compare by identity to tell a live session from an ended one. */
export interface ConnectedWallet {
  readonly provider: Cip103Provider;
  readonly partyId: string;
  /**
   * Unique per `ConnectedWallet` object within its session: use it as a UI key (React `key`), so a new session of the
   * same party (another provider or network) remounts what the previous one rendered.
   */
  readonly key: string;
  /** What the dApp connected for; lets `createTokenWalletStore` build DA's registry client itself. */
  readonly network?: DaNetwork;
}

export type Cip103SessionState =
  | {
      readonly status: 'disconnected';
      /**
       * `user`: the dApp disconnected. `wallet`: the wallet rejected or ended the session. `null`: never connected, or
       * a failure (`error`).
       */
      readonly endedBy: 'user' | 'wallet' | null;
      /** Why the last connect, party lookup or wallet setup failed. */
      readonly error: WalletErrorDescription | null;
    }
  | { readonly status: 'connecting' }
  | { readonly status: 'connected'; readonly wallet: ConnectedWallet };

export interface Cip103ConnectContext {
  /**
   * The network the dApp connects for, carried on the `ConnectedWallet`. A wallet whose primary account reports the
   * CIP-0103 `networkId` of another DA network (`canton:mainnet` when connecting for `devnet`, and the reverse) is
   * refused: the session stays disconnected with an error. CIP-0103 does not fix how a wallet spells its network id, so
   * an id the session does not recognise, or none, is accepted rather than locking every user out.
   */
  readonly network?: DaNetwork;
}

export interface Cip103Session {
  subscribe(listener: () => void): () => void;
  /** The current state; the same object until it changes (for `useSyncExternalStore`). */
  getSnapshot(): Cip103SessionState;
  /**
   * The wallet reports a live session (its accept callback, or a session it restored): reads the primary account
   * (`getPrimaryAccount`) and connects as its party.
   *
   * - A reply that a newer call, `end()`, `fail()` or `dispose()` superseded is dropped. Of overlapping party lookups the
   *   most recently started one decides. A `connected()` lookup supersedes older ones only once it has an answer it
   *   acts on, so one whose failure is ignored (below) leaves a pending `connect()` or `accountsChanged` lookup to
   *   decide.
   * - The same provider, party and network keep the same `ConnectedWallet` object, so a repeated callback changes
   *   nothing.
   * - Ignored after `end()` until `connect()` runs again (wallets can repeat a connect callback after a disconnect).
   * - With `ifConnected: true` it first asks CIP-0103 `isConnected` and does nothing unless the wallet answers `{
   *   isConnected: true }` (4200, any other failure or another answer count as not connected). Of overlapping restores,
   *   the most recently started one decides, whichever answers first: an older one is dropped. A restore is also
   *   dropped when anything else started a party lookup or changed the session while it waited. While it waits it
   *   supersedes nothing: only an `isConnected: true` answer starts its lookup, which then supersedes older ones, so a
   *   restore that finds no session never cancels a pending `connect()` or `accountsChanged` lookup.
   * - A failed account read, or an account on the other DA network, leaves the session disconnected with `error`;
   *   `connect()` recovers from it. While a wallet is connected, such a failure is ignored instead: a stale callback,
   *   or another wallet that cannot be read, never drops a healthy session. The exception is the connected wallet's own
   *   provider answering with an account on the other DA network: the wallet switched networks, so the session ends
   *   with `error`. While a `connect()` is pending (`connecting`), every such failure is ignored: that `connect()`
   *   reads the account itself and reports the outcome.
   */
  connected(
    provider: Cip103Provider,
    context?: Cip103ConnectContext & { readonly ifConnected?: boolean }
  ): Promise<void>;
  /**
   * The user asked to connect: re-arms `connected()`, sets `connecting`, sends CIP-0103 `connect` (the wallet's own
   * sign-in), then always reads the primary account again, also when the wallet answers that it was already connected,
   * so a failed or lost party lookup recovers without a reload. A failure becomes `error` (4001: declined). Resolves
   * when it settled; superseded by a newer `connect()`, `end()`, `fail()` or `dispose()`.
   */
  connect(provider: Cip103Provider, context?: Cip103ConnectContext): Promise<void>;
  /**
   * The session ended. `user`: the dApp disconnected, and CIP-0103 `disconnect` is sent best-effort to the providers
   * the session is on (the connected wallet's, and the one a pending `connect()` signs in to; failures are ignored),
   * before the new state is published. A `connect()` to such a provider waits for its disconnects to settle before it
   * sends `connect`, so a disconnect cannot land after the new sign-in; it waits at most until three seconds after the
   * disconnect was sent, so a disconnect that never answers delays only the first such `connect()`. `wallet`: the
   * wallet rejected or ended the session; nothing is sent. Either way `connected()` is ignored until `connect()` runs
   * again.
   */
  end(by: 'user' | 'wallet'): void;
  /** The wallet's own setup failed (e.g. Loop's `init`): disconnected with `error`. */
  fail(error: unknown): void;
  /** Whether `wallet` is still this session's connected wallet. */
  isCurrent(wallet: ConnectedWallet): boolean;
  /** Stop: listeners are removed, pending replies dropped and no further state is published. */
  dispose(): void;
}

/** How long after an `end('user')` disconnect was sent a `connect()` to the same provider still waits for it. */
const DISCONNECT_WAIT_MS = 3000;

const NEVER_CONNECTED: Cip103SessionState = { status: 'disconnected', endedBy: null, error: null };
const CONNECTING: Cip103SessionState = { status: 'connecting' };

/** Whether a CIP-0103 `isConnected` answer or `statusChanged` connection says connected (`undefined`: it says nothing). */
function connectionFlag(connection: unknown): boolean | undefined {
  const flag = isRecord(connection) ? connection['isConnected'] : undefined;
  return typeof flag === 'boolean' ? flag : undefined;
}

/** A failed CIP-0103 `connect`, for the user. */
function connectError(error: unknown): WalletErrorDescription {
  const code = cip103ErrorCode(error);
  if (code === CIP103_ERROR_CODES.userRejected) {
    return { kind: 'declined', message: 'You declined to connect in the wallet.', code };
  }
  const message = `The wallet did not connect: ${describeError(error)}`;
  return code === undefined ? { kind: 'other', message } : { kind: 'other', message, code };
}

/** A failed primary-account read, for the user. */
function lookupError(error: unknown): WalletErrorDescription {
  if (error instanceof WalletReadError && error.code === CIP103_ERROR_CODES.unauthorized) {
    const message = `The wallet has no signed-in account: connect again. Details: ${error.message}`;
    return { kind: 'read-failed', message, code: error.code };
  }
  return describeWalletError(error);
}

/** The provider's events this session follows while connected. */
interface Attachment {
  readonly provider: Cip103Provider;
  readonly onAccountsChanged: () => void;
  readonly onStatusChanged: (status: unknown) => void;
}

/**
 * A CIP-0103 wallet session. While connected it listens on the provider: `accountsChanged` reads the primary account
 * again (another party becomes a new `ConnectedWallet`), and a `statusChanged` whose `connection.isConnected` is false
 * ends the session (`wallet`). A wallet that never emits these events loses nothing.
 */
export function createCip103Session(): Cip103Session {
  const listeners = new Set<() => void>();
  let state: Cip103SessionState = NEVER_CONNECTED;
  // Every party lookup, and every interrupt(), takes the next number. A reply counts only while its number is at least
  // `floor`: an interrupt() or a connect() or accountsChanged lookup raises the floor when it starts, a connected()
  // lookup only when it acts on its answer, so a callback whose failure is ignored supersedes nothing.
  let lookups = 0;
  let floor = 0;
  // Every connected(..., { ifConnected: true }) takes a new number: only the latest restore may start its lookup.
  let restores = 0;
  // Bumped by connect(), end(), fail() and dispose(): a connect() whose epoch is no longer current stops.
  let epoch = 0;
  // Set by end(): connected() is ignored until the user connects again.
  let closed = false;
  let disposed = false;
  // Numbers each ConnectedWallet's `key`.
  let connections = 0;
  // The provider the pending connect() signs in to, until that connect() settles or is superseded, whatever state is
  // published meanwhile (a failed callback may publish an error while it waits), for end('user')'s disconnect.
  let signingIn: Cip103Provider | null = null;
  // end('user')'s disconnects in flight, per provider: a connect() to that provider waits for them until `deadline`.
  const disconnecting = new Map<Cip103Provider, { readonly settled: Promise<void>; readonly deadline: number }>();
  let attachment: Attachment | null = null;

  function publish(next: Cip103SessionState): void {
    if (disposed || next === state) return;
    state = next;
    for (const listener of [...listeners]) listener();
  }

  function detach(): void {
    const current = attachment;
    attachment = null;
    if (current === null) return;
    current.provider.removeListener('accountsChanged', current.onAccountsChanged);
    current.provider.removeListener('statusChanged', current.onStatusChanged);
  }

  function attach(provider: Cip103Provider): void {
    if (attachment?.provider === provider) return;
    detach();
    const own: Attachment = {
      provider,
      onAccountsChanged: () => {
        if (attachment !== own || state.status !== 'connected') return;
        const { network } = state.wallet;
        void lookup(provider, network === undefined ? {} : { network });
      },
      onStatusChanged: (status) => {
        if (attachment !== own || !isRecord(status)) return;
        if (connectionFlag(status['connection']) === false) end('wallet');
      },
    };
    attachment = own;
    provider.on('accountsChanged', own.onAccountsChanged);
    provider.on('statusChanged', own.onStatusChanged);
  }

  /**
   * Read the primary account and connect as its party, unless a newer lookup or session change superseded it.
   * `passive`: a wallet callback (`connected()`). It supersedes pending lookups only once it acts on its answer, and
   * its failure leaves an already connected session alone (unless that wallet itself reports the other network), and
   * never interrupts a pending connect().
   */
  async function lookup(provider: Cip103Provider, context: Cip103ConnectContext, passive = false): Promise<void> {
    const attempt = ++lookups;
    if (!passive) floor = attempt;
    const current = (): boolean => attempt >= floor && !disposed;
    const failed = (error: WalletErrorDescription, otherNetwork: boolean): void => {
      // A stale callback, or another wallet that cannot be read, does not drop a healthy session, nor does it cancel a
      // pending lookup. The connected wallet reporting the other network is no stale callback: the session ends.
      // While a connect() is pending, its own lookup decides (it always reads the account again), so a callback's
      // failure must not flash an error over `connecting`.
      const ownWallet = state.status === 'connected' && state.wallet.provider === provider;
      if (passive && state.status === 'connecting') return;
      if (passive && state.status === 'connected' && !(otherNetwork && ownWallet)) return;
      floor = attempt;
      detach();
      publish({ status: 'disconnected', endedBy: null, error });
    };
    let account: Cip103Account;
    try {
      account = await primaryAccount(provider);
    } catch (error) {
      if (current()) failed(lookupError(error), false);
      return;
    }
    if (!current()) return;
    const { network } = context;
    const { partyId, networkId } = account;
    if (network !== undefined && networkId !== undefined && reportsOtherNetwork(networkId, network)) {
      // DA's registry and ledger for `network` would refuse every call of a wallet on another network.
      const message = `The wallet is on ${networkId}, not ${cip103NetworkId(network)}: switch networks in the wallet, then connect again.`;
      failed({ kind: 'other', message }, true);
      return;
    }
    floor = attempt;
    if (
      state.status === 'connected' &&
      state.wallet.provider === provider &&
      state.wallet.partyId === partyId &&
      state.wallet.network === network
    ) {
      return; // the same session: keep its object
    }
    const key = String(++connections);
    const wallet: ConnectedWallet = { provider, partyId, key, ...(network !== undefined && { network }) };
    attach(provider);
    publish({ status: 'connected', wallet });
  }

  /** Whether connected() is followed: not disposed, and not ended since the last connect(). Read after an await. */
  function armed(): boolean {
    return !disposed && !closed;
  }

  /** Supersede every pending reply and pending connect(), and stop following the provider. */
  function interrupt(): void {
    epoch += 1;
    floor = ++lookups;
    signingIn = null;
    detach();
  }

  /** The providers the session is on: the connected wallet's, and the one a pending connect() signs in to. */
  function sessionProviders(): Set<Cip103Provider> {
    const providers = new Set<Cip103Provider>();
    if (state.status === 'connected') providers.add(state.wallet.provider);
    if (signingIn !== null) providers.add(signingIn);
    return providers;
  }

  /** Send CIP-0103 `disconnect` best-effort, and record it so a `connect()` to `provider` waits for it. */
  function disconnect(provider: Cip103Provider): void {
    const sent = (async () => provider.request({ method: 'disconnect' }))().then(
      () => undefined,
      () => undefined
    );
    // An earlier disconnect of the same provider still in flight must settle too.
    const earlier = disconnecting.get(provider);
    const settled = earlier === undefined ? sent : Promise.all([earlier.settled, sent]).then(() => undefined);
    const own = { settled, deadline: Date.now() + DISCONNECT_WAIT_MS };
    disconnecting.set(provider, own);
    void settled.then(() => {
      if (disconnecting.get(provider) === own) disconnecting.delete(provider);
    });
  }

  function end(by: 'user' | 'wallet'): void {
    if (disposed) return;
    const providers = by === 'user' ? sessionProviders() : new Set<Cip103Provider>();
    interrupt();
    closed = true;
    // Before publishing: a listener that connects again in response must find the disconnect in flight.
    for (const provider of providers) disconnect(provider);
    publish({ status: 'disconnected', endedBy: by, error: null });
  }

  /**
   * An in-flight disconnect of `provider`, settled or past its deadline; `null` when there is none (or its deadline
   * passed), so `connect()` then sends `connect` in the same tick (inside the user's click, where a wallet may open a
   * popup).
   */
  function disconnectSettled(provider: Cip103Provider): Promise<void> | null {
    const pending = disconnecting.get(provider);
    if (pending === undefined) return null;
    const left = pending.deadline - Date.now();
    if (left <= 0) {
      // It never answered in time: never wait for it again.
      disconnecting.delete(provider);
      return null;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, left);
    });
    return Promise.race([pending.settled, timeout]).finally(() => {
      clearTimeout(timer);
    });
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot: () => state,

    async connected(provider, context = {}) {
      if (disposed || closed) return;
      const { network } = context;
      if (context.ifConnected === true) {
        // Dropped when a newer restore started, or anything started a lookup or changed the session meanwhile (that
        // newer call decides). Taking a restore number rather than a lookup number supersedes no pending lookup while
        // `isConnected` is in flight, so a restore that finds no session cannot strand a `connect()` in `connecting`.
        const restore = ++restores;
        const seen = lookups;
        let answer: unknown = null;
        try {
          answer = await provider.request({ method: 'isConnected' });
        } catch {
          // 4200 or any other failure: not connected.
        }
        if (restore !== restores || seen !== lookups || !armed() || connectionFlag(answer) !== true) return;
      }
      await lookup(provider, network === undefined ? {} : { network }, true);
    },

    async connect(provider, context = {}) {
      if (disposed) return;
      interrupt();
      const own = epoch;
      const current = (): boolean => own === epoch && !disposed;
      closed = false;
      signingIn = provider;
      publish(CONNECTING);
      try {
        try {
          // A disconnect the user sent this wallet just before must not land after the new sign-in.
          const disconnected = disconnectSettled(provider);
          if (disconnected !== null) {
            await disconnected;
            if (!current()) return;
          }
          await provider.request({ method: 'connect' });
        } catch (error) {
          if (current()) {
            // The wallet's accept callback may have connected meanwhile: drop its pending lookup and stop following it.
            interrupt();
            publish({ status: 'disconnected', endedBy: null, error: connectError(error) });
          }
          return;
        }
        if (!current()) return;
        // Always read the account again, even when the wallet was already connected and sends no new accept callback.
        await lookup(provider, context.network === undefined ? {} : { network: context.network });
      } finally {
        if (own === epoch) signingIn = null;
      }
    },

    end,

    fail(error) {
      if (disposed) return;
      interrupt();
      publish({ status: 'disconnected', endedBy: null, error: describeWalletError(error) });
    },

    isCurrent: (wallet) => !disposed && state.status === 'connected' && state.wallet === wallet,

    dispose() {
      if (disposed) return;
      interrupt();
      disposed = true;
      listeners.clear();
    },
  };
}

const DA_NETWORKS: readonly DaNetwork[] = ['devnet', 'mainnet'];

/** Whether `networkId` is the CIP-0103 id of a DA network other than `network`. */
function reportsOtherNetwork(networkId: string, network: DaNetwork): boolean {
  return DA_NETWORKS.some((other) => other !== network && networkId === cip103NetworkId(other));
}
