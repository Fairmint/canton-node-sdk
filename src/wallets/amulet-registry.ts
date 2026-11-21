/** The DSO's CIP-56 registry (Scan), read for Canton Coin's DSO party and metadata. Browser-safe. */
import { awaitWithAbort, throwIfAborted } from './abort';
import { AMULET_INSTRUMENT_ID, CANTON_COIN_METADATA } from './amulet';
import { globalFetch, parseInstrumentMetadata, trimTrailingSlashes, type FetchLike } from './da-utilities/client';
import type { InstrumentMetadata } from './holdings';
import { isRecord, nonEmptyString } from './json';
import type { InstrumentId } from './types';

/** How a wallet recognises and describes Canton Coin. */
export interface CantonCoinOptions {
  /**
   * The DSO party of the wallet's network. When set, only Canton Coin of this DSO counts, and its balance carries
   * {@link CANTON_COIN_METADATA} when the registry does not answer.
   */
  readonly dsoParty?: string;
  /**
   * The base URL of the DSO's CIP-56 registry (a Scan URL, or a read-only proxy of one): the SDK reads
   * `${registryUrl}/registry/metadata/v1/info` (the DSO party, when `dsoParty` is not set) and
   * `${registryUrl}/registry/metadata/v1/instruments/Amulet`. Unset: no registry request is made.
   */
  readonly registryUrl?: string;
  /**
   * Defaults to `globalThis.fetch`. Never the wallet's `registry.fetch`: that one was given for DA's Utilities API and
   * may add headers or route requests meant for that host only.
   */
  readonly fetch?: FetchLike;
}

/** The DSO's registry, as far as reading Canton Coin needs it. */
export interface AmuletRegistry {
  /**
   * Whether the options name the wallet's DSO (`dsoParty` or `registryUrl`). When they do and {@link dsoParty} answers
   * nothing, no Canton Coin can be confirmed, so none is listed (never every DSO's).
   */
  readonly namesDso: boolean;
  /** The DSO party: `dsoParty`, else the registry's `adminId`; undefined when neither is known. A failure is retried. */
  dsoParty(signal?: AbortSignal): Promise<string | undefined>;
  /**
   * Canton Coin's metadata when `instrumentId` is the confirmed DSO's `Amulet`: the registry's answer, else
   * {@link CANTON_COIN_METADATA} for a pinned DSO. Undefined for an unconfirmed DSO, so a look-alike is never labelled
   * Canton Coin.
   */
  instrumentMetadata(instrumentId: InstrumentId, signal?: AbortSignal): Promise<InstrumentMetadata | undefined>;
}

/** A registry request still unanswered after this long is aborted and counts as a failure. */
const REGISTRY_REQUEST_TIMEOUT_MS = 5000;
/** How long a caller waits for a registry answer; a slower one is still cached for the next call. */
const REGISTRY_WAIT_MS = 1500;
/** After a failed lookup, the registry is not asked again for this long (the lookup answers undefined meanwhile). */
const REGISTRY_FAILURE_BACKOFF_MS = 30_000;

/** Test hooks of {@link createAmuletRegistry}; not part of the public options. */
export interface AmuletRegistryInternalOptions {
  /** The clock of the failure back-off, in milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** Resolves undefined after `ms`; `cancel` clears the timer. */
function after(ms: number): { readonly promise: Promise<undefined>; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}

/**
 * A cached lookup: a defined answer is kept; a failure (an error, an undefined answer, a request aborted after
 * {@link REGISTRY_REQUEST_TIMEOUT_MS}) is asked again only after {@link REGISTRY_FAILURE_BACKOFF_MS}. A caller waits at
 * most {@link REGISTRY_WAIT_MS}, or until its `signal` aborts.
 */
function cachedLookup<T>(
  lookup: (signal: AbortSignal) => Promise<T | undefined>,
  now: () => number
): (signal?: AbortSignal) => Promise<T | undefined> {
  let pending: Promise<T | undefined> | undefined;
  let retryAt = 0;
  return async (signal) => {
    throwIfAborted(signal);
    if (pending === undefined) {
      if (now() < retryAt) return undefined;
      const controller = new AbortController();
      const timeout = after(REGISTRY_REQUEST_TIMEOUT_MS);
      void timeout.promise.then(() => controller.abort());
      // The race also ends a custom fetch that ignores the signal.
      const request: Promise<T | undefined> = Promise.race([
        lookup(controller.signal).catch(() => undefined),
        timeout.promise,
      ]).finally(() => timeout.cancel());
      pending = request;
      void request.then((answer) => {
        if (answer === undefined && pending === request) {
          pending = undefined;
          retryAt = now() + REGISTRY_FAILURE_BACKOFF_MS;
        }
      });
    }
    const shared = pending;
    const wait = after(REGISTRY_WAIT_MS);
    const bounded = Promise.race([shared, wait.promise]).finally(() => wait.cancel());
    return signal === undefined ? bounded : awaitWithAbort(async () => bounded, signal);
  };
}

/** The Canton Coin registry of `options`. */
export function createAmuletRegistry(
  options: CantonCoinOptions = {},
  internal: AmuletRegistryInternalOptions = {}
): AmuletRegistry {
  const pinned = nonEmptyString(options.dsoParty);
  const registryUrl = options.registryUrl === undefined ? undefined : trimTrailingSlashes(options.registryUrl);
  const fetchFn = options.fetch ?? globalFetch('cantonCoin.fetch');
  const now = internal.now ?? Date.now;

  async function getJson(path: string, signal: AbortSignal): Promise<unknown> {
    if (registryUrl === undefined) return undefined;
    const response = await fetchFn(`${registryUrl}${path}`, { method: 'GET', signal });
    if (!response.ok) return undefined;
    return JSON.parse(await response.text()) as unknown;
  }

  const registryAdmin = cachedLookup(async (signal) => {
    const info = await getJson('/registry/metadata/v1/info', signal);
    return isRecord(info) ? nonEmptyString(info['adminId']) : undefined;
  }, now);
  const registryMetadata = cachedLookup(
    async (signal) =>
      parseInstrumentMetadata(
        await getJson(`/registry/metadata/v1/instruments/${encodeURIComponent(AMULET_INSTRUMENT_ID)}`, signal),
        AMULET_INSTRUMENT_ID
      ),
    now
  );

  async function dsoParty(signal?: AbortSignal): Promise<string | undefined> {
    if (pinned !== undefined) return pinned;
    return registryUrl === undefined ? undefined : registryAdmin(signal);
  }

  return {
    namesDso: pinned !== undefined || registryUrl !== undefined,
    dsoParty,
    async instrumentMetadata(instrumentId, signal) {
      if (instrumentId.id !== AMULET_INSTRUMENT_ID) return undefined;
      const dso = await dsoParty(signal);
      if (dso === undefined || instrumentId.admin !== dso) return undefined;
      const answered = registryUrl === undefined ? undefined : await registryMetadata(signal);
      return answered ?? (pinned !== undefined ? CANTON_COIN_METADATA : undefined);
    },
  };
}
