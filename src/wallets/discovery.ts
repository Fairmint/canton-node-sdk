/**
 * Discovery of the CIP-0103 wallets installed in the browser as extensions: one call, `discoverCip103Wallets()`, lists
 * them as `{ id, name, icon?, load(network) }`, and `load` resolves a {@link Cip103Provider} that the session, the store
 * and `createWallet` take like any other.
 *
 * - Handshake (the Canton dApp SDK's): the page dispatches `canton:requestProvider`, and each installed wallet answers
 *   `canton:announceProvider` with `{ id, name, icon?, target? }` within 300 ms. Several wallets may answer; the user
 *   picks one. The page's `canton` global holds one wallet only (the last extension to write it), so it is offered only
 *   when no wallet announced itself.
 * - Channel: an announced wallet is reached over the dApp SDK's message channel: a `SPLICE_WALLET_REQUEST` message `{
 *   type, target, request: { jsonrpc: '2.0', id, method, params } }` posted to the page, answered by a
 *   `SPLICE_WALLET_RESPONSE` `{ type, response: { jsonrpc, id, result | error } }` with the same id; a request without
 *   an id addressed to the target is an event (`on`). This is the wire format of `@canton-network/core-rpc-transport`'s
 *   `WindowTransport` (1.18.0), implemented here so the wallets module keeps no runtime dependency.
 * - Corrections, which change nothing for a wallet that follows CIP-0103:
 *
 *   - `ledgerApi`: a result `{ response: '<raw body>' }` is answered as the parsed body (Console Wallet answers `{
 *       ...parsedBody, response }`, which turns a list body into an object).
 *   - `getPrimaryAccount`: network ids `CANTON_NETWORK_DEV`, `CANTON_NETWORK_TEST` and `CANTON_NETWORK` become
 *       `canton:devnet`, `canton:testnet` and `canton:mainnet`; an account on another network than the one loaded is
 *       refused with 4901 (an extension serves the network selected in the wallet, not one the page picks); a -32002
 *       read (a sleeping extension worker) is retried twice.
 * - Console Wallet (1.15): its channel answers successes only, so an error (a declined connect) would hang. It is reached
 *   through the page's `canton` global instead (`source: 'consoleWallet'`), and its `signMessage` is sent the base64 of
 *   the message's UTF-8 bytes, which it decodes and signs (it signs exactly the message's bytes).
 */
import { newCommandId, type Cip103EventListener, type Cip103Provider, type Cip103Request } from './cip103';
import type { DaNetwork } from './da-utilities/client';
import type { WalletCallOptions } from './wallet';
import { createAbortError } from '../core/http/abort';
import { awaitWithAbort, cancelledBeforeSubmit, throwIfAborted } from './abort';

/** The browser global this module uses; a page's global object satisfies it. Tests pass a fake. */
export interface Cip103DiscoveryHost {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
  dispatchEvent(event: Event): boolean;
  postMessage(message: unknown, targetOrigin: string): void;
  /** The provider a wallet extension injected, if any. */
  readonly canton?: unknown;
}

/** An installed wallet extension. */
export interface DiscoveredWallet {
  /**
   * The id it announced (stable across page loads: remember it to reconnect), or `injected` (`injected:console`) for
   * the `canton` global.
   */
  readonly id: string;
  readonly name: string;
  /** A data URL or URL of its icon, as it announced it. */
  readonly icon?: string;
  /**
   * Its CIP-0103 provider for a DA network, the same object on every call. Its `getPrimaryAccount` refuses (4901) an
   * account the wallet has on another network. Making the provider is instant; `options.signal` only rejects the call
   * with an `AbortError` when it has already aborted.
   */
  load(network: DaNetwork, options?: WalletCallOptions): Promise<Cip103Provider>;
}

export interface DiscoverCip103WalletsOptions {
  /** How long to collect announcements; defaults to 300 ms, the dApp SDK's default. */
  readonly waitMs?: number;
  /** Cancels the discovery: it rejects with an `AbortError`. */
  readonly signal?: AbortSignal;
  /** Defaults to `globalThis` (the page's window); without one (outside a browser) nothing is found. */
  readonly host?: Cip103DiscoveryHost;
}

const REQUEST_EVENT = 'canton:requestProvider';
const ANNOUNCE_EVENT = 'canton:announceProvider';
const DEFAULT_WAIT_MS = 300;
const REQUEST_MESSAGE = 'SPLICE_WALLET_REQUEST';
const RESPONSE_MESSAGE = 'SPLICE_WALLET_RESPONSE';

const CONSOLE_NAME = 'Console Wallet';
const CONSOLE_SOURCE = 'consoleWallet';
/** The id of a wallet found through the page's `canton` global only (`injected:console` for Console Wallet). */
export const INJECTED_WALLET_ID = 'injected';
const INJECTED_CONSOLE_ID = 'injected:console';

const NETWORK_IDS: Readonly<Record<string, string>> = {
  CANTON_NETWORK_DEV: 'canton:devnet',
  CANTON_NETWORK_TEST: 'canton:testnet',
  CANTON_NETWORK: 'canton:mainnet',
};

/** -32002: an extension's account read that timed out (a sleeping worker); retried after these waits. */
const RESOURCE_UNAVAILABLE = -32002;
const ACCOUNT_READ_RETRY_DELAYS_MS: readonly number[] = [300, 1000];
const CHAIN_DISCONNECTED = 4901;

type InjectedProvider = Cip103Provider & { readonly source?: unknown };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isProvider(value: unknown): value is InjectedProvider {
  return (
    isObject(value) &&
    typeof value['request'] === 'function' &&
    typeof value['on'] === 'function' &&
    typeof value['removeListener'] === 'function'
  );
}

function isHost(value: unknown): value is Cip103DiscoveryHost {
  return (
    isObject(value) &&
    typeof value['addEventListener'] === 'function' &&
    typeof value['removeEventListener'] === 'function' &&
    typeof value['dispatchEvent'] === 'function' &&
    typeof value['postMessage'] === 'function'
  );
}

function injectedProvider(host: Cip103DiscoveryHost): InjectedProvider | undefined {
  const candidate = host.canton;
  return isProvider(candidate) ? candidate : undefined;
}

/** A provider error as CIP-0103 shapes it: an `Error` with a numeric `code` (and the wallet's `data`). */
function providerError(code: number, message: string, data?: unknown): Error {
  return Object.assign(new Error(message), { code }, data !== undefined && { data });
}

function utf8ToBase64(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The Ledger API body: the raw `response` text, parsed, when the wallet sent one. */
function ledgerApiBody(result: unknown): unknown {
  return isObject(result) && typeof result['response'] === 'string'
    ? (JSON.parse(result['response']) as unknown)
    : result;
}

/** The account with a CIP-0103 network id; refused when the wallet is on another network than `network`. */
function accountOn(account: unknown, network: DaNetwork, name: string): unknown {
  if (!isObject(account) || typeof account['networkId'] !== 'string') return account;
  const networkId = NETWORK_IDS[account['networkId']] ?? account['networkId'];
  if (networkId.startsWith('canton:') && networkId !== `canton:${network}`) {
    throw providerError(
      CHAIN_DISCONNECTED,
      `${name} is on ${networkId.slice('canton:'.length)}, not ${network}: switch networks in the wallet, then connect again.`
    );
  }
  return { ...account, networkId };
}

async function readAccount(wallet: Cip103Provider, request: Cip103Request, options?: RequestOptions): Promise<unknown> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await wallet.request(request, options);
    } catch (error) {
      const delay = ACCOUNT_READ_RETRY_DELAYS_MS[attempt];
      if (!isObject(error) || error['code'] !== RESOURCE_UNAVAILABLE || delay === undefined) throw error;
      await new Promise((resolve) => {
        setTimeout(resolve, delay);
      });
    }
  }
}

type RequestOptions = Parameters<Cip103Provider['request']>[1];

/** `wallet` with the corrections above; `signsBase64` for Console's `signMessage`. */
function adapt(wallet: Cip103Provider, network: DaNetwork, name: string, signsBase64: boolean): Cip103Provider {
  return {
    async request(request, options) {
      switch (request.method) {
        case 'ledgerApi':
          return ledgerApiBody(await wallet.request(request, options));
        case 'signMessage':
          return wallet.request(
            signsBase64
              ? { method: 'signMessage', params: { message: utf8ToBase64(request.params.message) } }
              : request,
            options
          );
        case 'getPrimaryAccount':
          return accountOn(await readAccount(wallet, request, options), network, name);
        case 'connect':
        case 'disconnect':
        case 'isConnected':
        case 'prepareExecuteAndWait':
          return wallet.request(request, options);
      }
    },
    on: (event, listener) => wallet.on(event, listener),
    removeListener: (event, listener) => wallet.removeListener(event, listener),
  };
}

/** Whether `event` is a message posted by `host` itself: another window (a cross-origin iframe) cannot speak for it. */
function fromHost(host: Cip103DiscoveryHost, event: Event): boolean {
  return isObject(event) && (event as { source?: unknown }).source === host;
}

function messageData(event: Event): unknown {
  return isObject(event) ? (event as { data?: unknown }).data : undefined;
}

/** How long a request that submits nothing waits for an answer before its pending state is freed. */
const UNANSWERED_TIMEOUT_MS = 5 * 60 * 1000;
const UNANSWERED_TIMEOUT_METHODS: ReadonlySet<string> = new Set([
  'connect',
  'disconnect',
  'isConnected',
  'getPrimaryAccount',
]);

/**
 * A CIP-0103 provider over the dApp SDK's message channel to `target`. Requests carry a fresh random id and resolve
 * with the response of that id; requests without an id addressed to `target` are events. A wallet that announced no
 * target is untargeted, as in the dApp SDK's extension adapter: requests carry no `target` and notifications are not
 * filtered by one.
 */
export function channelProvider(host: Cip103DiscoveryHost, target?: string): Cip103Provider {
  const listeners = new Map<string, Set<Cip103EventListener>>();
  const onNotification = (event: Event): void => {
    if (!fromHost(host, event)) return;
    const data = messageData(event);
    if (!isObject(data) || data['type'] !== REQUEST_MESSAGE) return;
    if (target !== undefined && data['target'] !== target) return;
    const { request } = data;
    if (!isObject(request) || request['id'] != null || typeof request['method'] !== 'string') return;
    listeners.get(request['method'])?.forEach((listener) => listener(request['params']));
  };
  return {
    request: async (request, options) =>
      new Promise((resolve, reject) => {
        const signal = options?.signal;
        if (signal?.aborted === true) {
          reject(createAbortError(signal));
          return;
        }
        const id = newCommandId();
        let timer: ReturnType<typeof setTimeout> | undefined;
        // Frees the pending request: its listeners and timer. Safe to run twice.
        const settle = (): void => {
          host.removeEventListener('message', onResponse);
          signal?.removeEventListener('abort', onAbort);
          if (timer !== undefined) clearTimeout(timer);
        };
        function onAbort(): void {
          settle();
          reject(createAbortError(signal));
        }
        function onResponse(event: Event): void {
          if (!fromHost(host, event)) return;
          const data = messageData(event);
          const response = isObject(data) && data['type'] === RESPONSE_MESSAGE ? data['response'] : undefined;
          if (!isObject(response) || response['id'] !== id) return;
          settle();
          const { error } = response;
          if (error === undefined) {
            resolve(response['result']);
            return;
          }
          const { code, message, data: details } = isObject(error) ? error : {};
          reject(
            providerError(
              typeof code === 'number' ? code : -32603,
              typeof message === 'string' ? message : 'The wallet answered with an error',
              details
            )
          );
        }
        host.addEventListener('message', onResponse);
        signal?.addEventListener('abort', onAbort, { once: true });
        // A wallet that never answers must not hold a listener for good. Only requests that submit nothing time out:
        // a submission may still be completed by the wallet after any deadline.
        if (UNANSWERED_TIMEOUT_METHODS.has(request.method)) {
          timer = setTimeout(() => {
            settle();
            reject(
              providerError(
                -32603,
                `The wallet did not answer ${request.method} within ${UNANSWERED_TIMEOUT_MS / 1000}s`
              )
            );
          }, UNANSWERED_TIMEOUT_MS);
          // Never keeps a Node process alive (a browser's timer id has no unref).
          (timer as { unref?: () => void }).unref?.();
        }
        host.postMessage(
          {
            type: REQUEST_MESSAGE,
            ...(target !== undefined && { target }),
            request: {
              jsonrpc: '2.0',
              id,
              method: request.method,
              ...('params' in request && { params: request.params }),
            },
          },
          '*'
        );
      }),
    on: (event, listener) => {
      if (listeners.size === 0) host.addEventListener('message', onNotification);
      const set = listeners.get(event) ?? new Set<Cip103EventListener>();
      set.add(listener);
      listeners.set(event, set);
    },
    removeListener: (event, listener) => {
      const set = listeners.get(event);
      set?.delete(listener);
      if (set?.size === 0) listeners.delete(event);
      if (listeners.size === 0) host.removeEventListener('message', onNotification);
    },
  };
}

interface Identity {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
}

/** A wallet whose providers are made once per network. */
function walletOf(identity: Identity, connect: () => Cip103Provider, signsBase64: boolean): DiscoveredWallet {
  const providers = new Map<DaNetwork, Cip103Provider>();
  return Object.freeze({
    ...identity,
    // Async so a wallet that cannot be reached (another extension holds Console's global) rejects, never throws.
    load: async (network: DaNetwork, { signal }: WalletCallOptions = {}) => {
      throwIfAborted(signal);
      let provider = providers.get(network);
      if (provider === undefined) {
        provider = adapt(connect(), network, identity.name, signsBase64);
        providers.set(network, provider);
      }
      return Promise.resolve(provider);
    },
  });
}

function consoleWallet(host: Cip103DiscoveryHost, identity: Identity): DiscoveredWallet {
  return walletOf(
    identity,
    () => {
      const canton = injectedProvider(host);
      if (canton?.source !== CONSOLE_SOURCE) {
        throw new Error(
          `Another wallet extension holds the page's canton provider, which ${CONSOLE_NAME} needs: turn the other extension off, then reload.`
        );
      }
      return canton;
    },
    true
  );
}

interface Announced extends Identity {
  readonly target?: string;
}

function readAnnounced(detail: unknown): Announced | undefined {
  if (!isObject(detail)) return undefined;
  const { id, name, icon, target } = detail;
  if (typeof id !== 'string' || id === '' || typeof name !== 'string') return undefined;
  return {
    id,
    name,
    ...(typeof icon === 'string' && icon !== '' && { icon }),
    ...(typeof target === 'string' && target !== '' && { target }),
  };
}

async function announcedWallets(host: Cip103DiscoveryHost, waitMs: number, signal?: AbortSignal): Promise<Announced[]> {
  const found = new Map<string, Announced>();
  const onAnnounce = (event: Event): void => {
    const announced = readAnnounced(isObject(event) ? (event as { detail?: unknown }).detail : undefined);
    if (announced !== undefined && !found.has(announced.id)) found.set(announced.id, announced);
  };
  host.addEventListener(ANNOUNCE_EVENT, onAnnounce);
  try {
    host.dispatchEvent(new CustomEvent(REQUEST_EVENT, { detail: {} }));
    await awaitWithAbort(
      async () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, waitMs);
        }),
      signal
    );
  } finally {
    host.removeEventListener(ANNOUNCE_EVENT, onAnnounce);
  }
  return [...found.values()];
}

// One wallet object per host and id, so its providers (and a session's view of them) survive another discovery.
const remembered = new WeakMap<object, Map<string, DiscoveredWallet>>();

function rememberedWallet(host: Cip103DiscoveryHost, id: string, make: () => DiscoveredWallet): DiscoveredWallet {
  let byId = remembered.get(host);
  if (byId === undefined) {
    byId = new Map();
    remembered.set(host, byId);
  }
  let wallet = byId.get(id);
  if (wallet === undefined) {
    wallet = make();
    byId.set(id, wallet);
  }
  return wallet;
}

/**
 * The CIP-0103 wallet extensions installed in this browser, in the order they announced themselves; the wallet behind
 * the page's `canton` global when none announced; none outside a browser. A wallet found again is the same object.
 */
export async function discoverCip103Wallets(options: DiscoverCip103WalletsOptions = {}): Promise<DiscoveredWallet[]> {
  const { signal } = options;
  throwIfAborted(signal);
  const host: unknown = options.host ?? globalThis;
  if (!isHost(host) || typeof CustomEvent !== 'function') return [];
  const waitMs = options.waitMs ?? DEFAULT_WAIT_MS;
  if (!Number.isFinite(waitMs) || waitMs < 0) throw new TypeError('waitMs must be a non-negative number');
  const announced = await announcedWallets(host, waitMs, signal);
  if (signal?.aborted === true) throw cancelledBeforeSubmit(signal);
  if (announced.length > 0) {
    return announced.map((wallet) =>
      rememberedWallet(host, wallet.id, () => {
        const identity: Identity = {
          id: wallet.id,
          name: wallet.name,
          ...(wallet.icon !== undefined && { icon: wallet.icon }),
        };
        return wallet.name === CONSOLE_NAME
          ? consoleWallet(host, identity)
          : walletOf(identity, () => channelProvider(host, wallet.target), false);
      })
    );
  }
  // No announcement: a wallet that only injected the `canton` global.
  const canton = injectedProvider(host);
  if (canton === undefined) return [];
  if (canton.source === CONSOLE_SOURCE) {
    return [
      rememberedWallet(host, INJECTED_CONSOLE_ID, () =>
        consoleWallet(host, { id: INJECTED_CONSOLE_ID, name: CONSOLE_NAME })
      ),
    ];
  }
  const name = typeof canton.source === 'string' && canton.source !== '' ? canton.source : 'Browser wallet';
  return [
    rememberedWallet(host, INJECTED_WALLET_ID, () => walletOf({ id: INJECTED_WALLET_ID, name }, () => canton, false)),
  ];
}
