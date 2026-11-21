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
  /** Defaults to the wallet's `registry.fetch`, else `globalThis.fetch`. */
  readonly fetch?: FetchLike;
}

/** The DSO's registry, as far as reading Canton Coin needs it. */
export interface AmuletRegistry {
  /** The DSO party: `dsoParty`, else the registry's `adminId`; undefined when neither is known. A failure is retried. */
  dsoParty(signal?: AbortSignal): Promise<string | undefined>;
  /**
   * Canton Coin's metadata when `instrumentId` is the confirmed DSO's `Amulet`: the registry's answer, else
   * {@link CANTON_COIN_METADATA} for a pinned DSO. Undefined for an unconfirmed DSO, so a look-alike is never labelled
   * Canton Coin.
   */
  instrumentMetadata(instrumentId: InstrumentId, signal?: AbortSignal): Promise<InstrumentMetadata | undefined>;
}

/** A registry lookup still unanswered after this long gives undefined (and is asked again next time). */
const REGISTRY_TIMEOUT_MS = 5000;

/** A cached lookup: a defined answer is kept, an undefined one (failure, timeout) is asked again next call. */
function cachedLookup<T>(lookup: () => Promise<T | undefined>): (signal?: AbortSignal) => Promise<T | undefined> {
  let pending: Promise<T | undefined> | undefined;
  return async (signal) => {
    throwIfAborted(signal);
    if (pending === undefined) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), REGISTRY_TIMEOUT_MS);
      });
      pending = Promise.race([lookup().catch(() => undefined), timedOut]).finally(() => clearTimeout(timer));
    }
    const shared = pending;
    const answer = signal === undefined ? await shared : await awaitWithAbort(async () => shared, signal);
    if (answer === undefined && pending === shared) pending = undefined;
    return answer;
  };
}

/** The Canton Coin registry of `options`; `fallbackFetch` is the wallet's registry fetch. */
export function createAmuletRegistry(options: CantonCoinOptions = {}, fallbackFetch?: FetchLike): AmuletRegistry {
  const pinned = nonEmptyString(options.dsoParty);
  const registryUrl = options.registryUrl === undefined ? undefined : trimTrailingSlashes(options.registryUrl);
  const fetchFn = options.fetch ?? fallbackFetch ?? globalFetch('cantonCoin.fetch');

  async function getJson(path: string): Promise<unknown> {
    if (registryUrl === undefined) return undefined;
    const response = await fetchFn(`${registryUrl}${path}`, { method: 'GET' });
    if (!response.ok) return undefined;
    return JSON.parse(await response.text()) as unknown;
  }

  const registryAdmin = cachedLookup(async () => {
    const info = await getJson('/registry/metadata/v1/info');
    return isRecord(info) ? nonEmptyString(info['adminId']) : undefined;
  });
  const registryMetadata = cachedLookup(async () =>
    parseInstrumentMetadata(
      await getJson(`/registry/metadata/v1/instruments/${encodeURIComponent(AMULET_INSTRUMENT_ID)}`),
      AMULET_INSTRUMENT_ID
    )
  );

  async function dsoParty(signal?: AbortSignal): Promise<string | undefined> {
    if (pinned !== undefined) return pinned;
    return registryUrl === undefined ? undefined : registryAdmin(signal);
  }

  return {
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
