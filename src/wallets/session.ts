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
   * The network the dApp connects for, carried on the `ConnectedWallet`. A wallet whose primary account reports another
   * CIP-0103 `networkId` (`canton:<network>`) is refused: the session stays disconnected with an error.
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
   * - A reply that a newer call, `end()`, `fail()` or `dispose()` superseded is dropped.
   * - The same provider, party and network keep the same `ConnectedWallet` object, so a repeated callback changes
   *   nothing.
   * - Ignored after `end()` until `connect()` runs again (wallets can repeat a connect callback after a disconnect).
   * - With `ifConnected: true` it first asks CIP-0103 `isConnected` and does nothing unless the wallet answers `{
   *   isConnected: true }` (4200, any other failure or another answer count as not connected).
   * - A failed account read leaves the session disconnected with `error`; `connect()` recovers from it.
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
   * The session ended. `user`: the dApp disconnected, and CIP-0103 `disconnect` is sent best-effort to the session's
   * provider (failures are ignored). `wallet`: the wallet rejected or ended the session; nothing is sent. Either way
   * `connected()` is ignored until `connect()` runs again.
   */
  end(by: 'user' | 'wallet'): void;
  /** The wallet's own setup failed (e.g. Loop's `init`): disconnected with `error`. */
  fail(error: unknown): void;
  /** Whether `wallet` is still this session's connected wallet. */
  isCurrent(wallet: ConnectedWallet): boolean;
  /** Stop: listeners are removed, pending replies dropped and no further state is published. */
  dispose(): void;
}

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
  // Every party lookup takes a new generation; a reply counts only while its generation is still the latest.
  let generation = 0;
  // Bumped by connect(), end(), fail() and dispose(): a connect() whose epoch is no longer current stops.
  let epoch = 0;
  // Set by end(): connected() is ignored until the user connects again.
  let closed = false;
  let disposed = false;
  // Numbers each ConnectedWallet's `key`.
  let connections = 0;
  // The provider of the latest connected() or connect(), for end('user')'s disconnect.
  let lastProvider: Cip103Provider | null = null;
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

  /** Read the primary account and connect as its party, unless a newer lookup or session change superseded it. */
  async function lookup(provider: Cip103Provider, context: Cip103ConnectContext): Promise<void> {
    const attempt = ++generation;
    let account: Cip103Account;
    try {
      account = await primaryAccount(provider);
    } catch (error) {
      if (attempt !== generation || disposed) return;
      detach();
      publish({ status: 'disconnected', endedBy: null, error: lookupError(error) });
      return;
    }
    if (attempt !== generation || disposed) return;
    const { network } = context;
    const { partyId, networkId } = account;
    if (network !== undefined && networkId !== undefined && networkId !== cip103NetworkId(network)) {
      // DA's registry and ledger for `network` would refuse every call of a wallet on another network.
      detach();
      const message = `The wallet is on ${networkId}, not ${cip103NetworkId(network)}: switch networks in the wallet, then connect again.`;
      publish({ status: 'disconnected', endedBy: null, error: { kind: 'other', message } });
      return;
    }
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

  /** Supersede every pending reply and stop following the provider. */
  function interrupt(): void {
    epoch += 1;
    generation += 1;
    detach();
  }

  function end(by: 'user' | 'wallet'): void {
    if (disposed) return;
    interrupt();
    closed = true;
    publish({ status: 'disconnected', endedBy: by, error: null });
    const provider = lastProvider;
    if (by === 'user' && provider !== null) {
      // Best-effort: the session has ended whatever the wallet answers (or throws).
      void (async () => provider.request({ method: 'disconnect' }))().catch(() => undefined);
    }
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
      lastProvider = provider;
      const { network } = context;
      if (context.ifConnected === true) {
        // Dropped when anything started a lookup or changed the session meanwhile (that newer call decides).
        const seen = generation;
        let answer: unknown = null;
        try {
          answer = await provider.request({ method: 'isConnected' });
        } catch {
          // 4200 or any other failure: not connected.
        }
        if (seen !== generation || !armed() || connectionFlag(answer) !== true) return;
      }
      await lookup(provider, network === undefined ? {} : { network });
    },

    async connect(provider, context = {}) {
      if (disposed) return;
      interrupt();
      const own = epoch;
      const current = (): boolean => own === epoch && !disposed;
      closed = false;
      lastProvider = provider;
      publish(CONNECTING);
      try {
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
