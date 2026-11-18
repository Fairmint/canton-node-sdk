/**
 * A CIP-0103 wallet session for a dApp on one DA network: which wallet is connected, as which party, and whether a
 * reply still belongs to the session that asked. It works with any CIP-0103 provider and holds no wallet SDK: the dApp
 * obtains the provider and hands it to `connect` (a user's click) or `restore` (page load).
 *
 * Observable for any UI framework: `subscribe` and `getSnapshot` (React: `useSyncExternalStore`).
 */
import { notifyListeners } from './notify';
import {
  cip103ErrorCode,
  cip103NetworkId,
  describeError,
  isDaNetwork,
  primaryAccount,
  reportsOtherNetwork,
  CIP103_ERROR_CODES,
  type Cip103Account,
  type Cip103Connection,
  type Cip103Provider,
} from './cip103';
import type { DaNetwork } from './da-utilities/client';
import { describeWalletError, WalletReadError, type WalletErrorDescription } from './errors';
import { isRecord } from './json';

/** A connected wallet. Each session is one object: compare by identity to tell a live session from an ended one. */
export interface ConnectedWallet extends Cip103Connection {
  /**
   * Unique per `ConnectedWallet` object within its session: use it as a UI key (React `key`), so a new session of the
   * same party (another provider or account) remounts what the previous one rendered.
   */
  readonly key: string;
}

export type Cip103SessionState =
  | {
      readonly status: 'disconnected';
      /** Why the last connect, account read or wallet setup failed; null after a disconnect or before any connect. */
      readonly error: WalletErrorDescription | null;
    }
  | { readonly status: 'connecting' }
  | { readonly status: 'connected'; readonly wallet: ConnectedWallet };

export interface Cip103SessionOptions {
  /**
   * The DA network the dApp works on, carried on every `ConnectedWallet`. A wallet whose primary account reports the
   * CIP-0103 `networkId` of the other DA network is refused. CIP-0103 does not fix how a wallet spells its network id,
   * so an id the session does not recognise, or none, is accepted.
   */
  readonly network: DaNetwork;
}

export interface Cip103Session {
  readonly network: DaNetwork;
  subscribe(listener: () => void): () => void;
  /** The current state; the same object until it changes (for `useSyncExternalStore`). */
  getSnapshot(): Cip103SessionState;
  /**
   * The user asked to connect: signs out any other wallet the session is on (CIP-0103 `disconnect`, best-effort), sets
   * `connecting`, waits for a disconnect of this wallet still in flight, sends CIP-0103 `connect` (the wallet's own
   * sign-in), then reads the primary account (`getPrimaryAccount`). A failure becomes `error` (4001: declined).
   * Resolves when it settled; superseded by a newer `connect()`, `disconnect()`, `fail()` or `dispose()`.
   */
  connect(provider: Cip103Provider): Promise<void>;
  /**
   * On page load: when the session is disconnected and the wallet answers CIP-0103 `isConnected` with `{ isConnected:
   * true }`, reads the primary account and connects silently. It never publishes an error: any failure (4200 included)
   * leaves the session as it was. Ignored while connecting or connected, and for a wallet the user signed out of
   * (`disconnect()`, or a switch to another wallet) until `connect()` signs in to it again, also when the wallet still
   * reports a session; dropped when anything else changed the session meanwhile, or a newer `restore()` started.
   */
  restore(provider: Cip103Provider): Promise<void>;
  /**
   * The user disconnected: sends CIP-0103 `disconnect` (best-effort) to the wallets the session is on (the connected
   * one, and the one a pending `connect()` signs in to), then publishes `disconnected`. A later `connect()` to such a
   * wallet waits for its disconnect, at most three seconds after it was sent, so it cannot land after the new sign-in.
   */
  disconnect(): void;
  /** The wallet's own setup failed: disconnected with `error`. */
  fail(error: unknown): void;
  /** Whether `wallet` is still this session's connected wallet. */
  isCurrent(wallet: ConnectedWallet): boolean;
  /** Stop: listeners are removed, pending replies dropped and no further state is published. */
  dispose(): void;
}

/** How long after a disconnect was sent a `connect()` to the same provider still waits for it. */
const DISCONNECT_WAIT_MS = 3000;

const DISCONNECTED: Cip103SessionState = { status: 'disconnected', error: null };
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

/** Disconnects of one provider in flight: settled once they all answered (each bounded by its deadline). */
interface Disconnecting {
  readonly settled: Promise<void>;
  readonly deadline: number;
}

/** The provider's events this session follows while connected. */
interface Attachment {
  readonly provider: Cip103Provider;
  readonly onAccountsChanged: () => void;
  readonly onStatusChanged: (status: unknown) => void;
}

/**
 * A CIP-0103 wallet session on `options.network`. While connected it listens on the provider: `accountsChanged` reads
 * the primary account again (another party becomes a new `ConnectedWallet`), and a `statusChanged` whose
 * `connection.isConnected` is false (the wallet ended the session) leaves it disconnected without an error.
 */
export function createCip103Session(options: Cip103SessionOptions): Cip103Session {
  const { network } = options;
  if (!isDaNetwork(network)) throw new TypeError('createCip103Session: network must be devnet or mainnet');
  const listeners = new Set<() => void>();
  let state: Cip103SessionState = DISCONNECTED;
  // Bumped by connect(), disconnect(), fail(), a wallet-side end and dispose(): work started before is dropped.
  let epoch = 0;
  // Every account read takes the next number; only the newest one's reply counts.
  let lookups = 0;
  // Every restore() takes the next number; only the newest one may connect.
  let restores = 0;
  let disposed = false;
  // Numbers each ConnectedWallet's `key`.
  let connections = 0;
  // The provider a pending connect() signs in to, and whether it has sent CIP-0103 `connect` yet.
  let signingIn: Cip103Provider | null = null;
  let signInSent = false;
  // Wallets the user signed out of (disconnect(), or a switch to another wallet): restore() leaves them alone until
  // connect() signs in to them again, also when their CIP-0103 disconnect failed and they still report a session.
  const signedOut = new WeakSet<Cip103Provider>();
  // Disconnects in flight, per provider: a connect() to that provider waits for them until `deadline`.
  const disconnecting = new Map<Cip103Provider, Disconnecting>();
  let attachment: Attachment | null = null;

  function publish(next: Cip103SessionState): void {
    if (disposed || next === state) return;
    state = next;
    notifyListeners(listeners);
  }

  function detach(): void {
    const current = attachment;
    attachment = null;
    if (current === null) return;
    current.provider.removeListener('accountsChanged', current.onAccountsChanged);
    current.provider.removeListener('statusChanged', current.onStatusChanged);
  }

  /** Supersede every pending reply and connect(), and stop following the provider. */
  function interrupt(): void {
    epoch += 1;
    lookups += 1;
    signingIn = null;
    signInSent = false;
    detach();
  }

  function attach(provider: Cip103Provider): void {
    if (attachment?.provider === provider) return;
    detach();
    const own: Attachment = {
      provider,
      onAccountsChanged: () => {
        // Only for this provider's published wallet: a provider that answers a new listener at once does so before its
        // wallet is published (the lookup that attaches it has just read the account anyway).
        if (attachment !== own || state.status !== 'connected' || state.wallet.provider !== provider) return;
        void lookup(provider, false);
      },
      onStatusChanged: (status) => {
        if (attachment !== own || !isRecord(status) || connectionFlag(status['connection']) !== false) return;
        interrupt();
        publish(DISCONNECTED);
      },
    };
    attachment = own;
    provider.on('accountsChanged', own.onAccountsChanged);
    provider.on('statusChanged', own.onStatusChanged);
  }

  /**
   * Read the primary account and connect as its party, unless something newer superseded it. A failure, or an account
   * on the other DA network, leaves the session disconnected with `error`; `quiet` (a restore) publishes nothing then.
   */
  async function lookup(
    provider: Cip103Provider,
    quiet: boolean,
    stillWanted: () => boolean = () => true
  ): Promise<void> {
    const attempt = ++lookups;
    const current = (): boolean => attempt === lookups && !disposed && stillWanted();
    const failed = (error: WalletErrorDescription): void => {
      if (quiet) return;
      interrupt();
      publish({ status: 'disconnected', error });
    };
    let account: Cip103Account;
    try {
      account = await primaryAccount(provider);
    } catch (error) {
      if (current()) failed(lookupError(error));
      return;
    }
    if (!current()) return;
    const { partyId, networkId } = account;
    if (reportsOtherNetwork(networkId, network)) {
      // DA's registry and ledger for `network` would refuse every call of a wallet on another network.
      failed({
        kind: 'other',
        message: `The wallet is on ${String(networkId)}, not ${cip103NetworkId(network)}: switch networks in the wallet, then connect again.`,
      });
      return;
    }
    if (state.status === 'connected' && state.wallet.provider === provider && state.wallet.partyId === partyId) {
      return; // the same session: keep its object
    }
    const wallet: ConnectedWallet = { provider, partyId, network, key: String(++connections) };
    attach(provider);
    // A provider may answer a new listener at once (a sticky `statusChanged`) and so end the session.
    if (!current()) return;
    publish({ status: 'connected', wallet });
  }

  /** The providers the session is on: the connected wallet's, and the one a pending connect() signs in to. */
  function sessionProviders(): Set<Cip103Provider> {
    const providers = new Set<Cip103Provider>();
    if (state.status === 'connected') providers.add(state.wallet.provider);
    if (signingIn !== null && signInSent) providers.add(signingIn);
    return providers;
  }

  /** `entry` settled, or its deadline passed: never later than its deadline, however long it goes unanswered. */
  async function settledOrDue(entry: Disconnecting): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const due = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, entry.deadline - Date.now());
    });
    return Promise.race([entry.settled, due]).finally(() => {
      clearTimeout(timer);
    });
  }

  /** The in-flight disconnect of `provider` still within its deadline, if any. */
  function pendingDisconnect(provider: Cip103Provider): Disconnecting | undefined {
    const pending = disconnecting.get(provider);
    if (pending === undefined || pending.deadline > Date.now()) return pending;
    disconnecting.delete(provider); // it never answered in time: never wait for it again
    return undefined;
  }

  /**
   * Record a CIP-0103 `disconnect` of `provider`, so a `connect()` to it waits for it, and return the function that
   * sends it (best-effort). Recorded before anything is sent: a `connect()` that sending sets off finds it.
   */
  function recordDisconnect(provider: Cip103Provider): () => void {
    let answered: () => void = () => undefined;
    const sent = new Promise<void>((resolve) => {
      answered = resolve;
    });
    // An earlier disconnect of the same provider must settle too, but only until its own deadline.
    const earlier = pendingDisconnect(provider);
    const settled = earlier === undefined ? sent : Promise.all([settledOrDue(earlier), sent]).then(() => undefined);
    const own: Disconnecting = { settled, deadline: Date.now() + DISCONNECT_WAIT_MS };
    disconnecting.set(provider, own);
    void settled.then(() => {
      if (disconnecting.get(provider) === own) disconnecting.delete(provider);
    });
    return () => {
      void (async () => provider.request({ method: 'disconnect' }))().then(answered, answered);
    };
  }

  return {
    network,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot: () => state,

    async connect(provider) {
      if (disposed) return;
      // Another wallet the session is on is signed out: the user switched wallets.
      const previous = [...sessionProviders()].filter((other) => other !== provider);
      interrupt();
      const own = epoch;
      const current = (): boolean => own === epoch && !disposed;
      signingIn = provider;
      signedOut.delete(provider);
      for (const other of previous) signedOut.add(other);
      const sends = previous.map(recordDisconnect);
      for (const send of sends) send();
      if (!current()) return; // sending set off a disconnect(), fail(), dispose() or another connect()
      publish(CONNECTING);
      if (!current()) return; // a listener of that publish changed the session
      try {
        try {
          // A disconnect the user sent this wallet just before must not land after the new sign-in.
          const pending = pendingDisconnect(provider);
          if (pending !== undefined) {
            await settledOrDue(pending);
            if (!current()) return;
          }
          signInSent = true;
          await provider.request({ method: 'connect' });
        } catch (error) {
          if (current()) {
            interrupt();
            publish({ status: 'disconnected', error: connectError(error) });
          }
          return;
        }
        if (!current()) return;
        // Read the account even when the wallet was already connected.
        await lookup(provider, false);
      } finally {
        if (own === epoch) {
          signingIn = null;
          signInSent = false;
        }
      }
    },

    async restore(provider) {
      if (disposed || state.status !== 'disconnected' || signedOut.has(provider)) return;
      const own = epoch;
      const attempt = ++restores;
      const wanted = (): boolean =>
        !disposed && own === epoch && attempt === restores && state.status === 'disconnected';
      let answer: unknown = null;
      try {
        answer = await provider.request({ method: 'isConnected' });
      } catch {
        return; // 4200 or any other failure: not connected
      }
      if (!wanted() || connectionFlag(answer) !== true) return;
      await lookup(provider, true, wanted);
    },

    disconnect() {
      if (disposed) return;
      const providers = sessionProviders();
      interrupt();
      const own = epoch;
      for (const provider of providers) signedOut.add(provider);
      // Every disconnect is recorded before the first is sent, so a connect() that sending sets off waits for each.
      const sends = [...providers].map(recordDisconnect);
      for (const send of sends) send();
      // Whatever sending set off (a connect(), fail() or dispose()) owns the state now.
      if (epoch !== own) return;
      publish(DISCONNECTED);
    },

    fail(error) {
      if (disposed) return;
      interrupt();
      publish({ status: 'disconnected', error: describeWalletError(error) });
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
