/**
 * Canton Coin's CIP-56 registry, served by Scan (no auth, CORS open on the SV Scans checked): the one place a wallet
 * learns which DSO party is genuine, Canton Coin's metadata, and the choice contexts to accept, reject or withdraw a
 * Canton Coin transfer offer (an `AmuletTransferInstruction`). Browser-safe: it uses an injectable `fetch` and sends
 * only `content-type: application/json`.
 *
 * Trust: the DSO party is `CantonCoinOptions.dsoParty` when pinned (no registry answer is trusted for it), else the
 * registry's `adminId` (the registry is then the trust anchor, as DA's Utilities API is for DA's operator). While
 * neither is known (the registry failed, is slow or is backing off), no Canton Coin is confirmed: holdings and offers
 * are left out, never shown for any DSO that signed them.
 *
 * Endpoints: the token standard metadata V1 (`GET /registry/metadata/v1/info`, `GET
 * /registry/metadata/v1/instruments/Amulet`) and transfer-instruction V1 (`POST
 * /registry/transfer-instruction/v1/{cid}/choice-contexts/{action}`) specs, at the root of a Scan URL. A validator's
 * authenticated scan proxy (`/api/validator/v0/scan-proxy`) serves the same paths; an app that proxies it passes its
 * own `registryUrl` and `fetch`.
 */
import { anySignal, awaitWithAbort, throwIfAborted } from '../abort';
import type { TransferInstructionAction } from '../commands';
import {
  globalFetch,
  parseChoiceContext,
  parseInstrumentMetadata,
  trimTrailingSlashes,
  type ChoiceContext,
  type DaNetwork,
  type FetchLike,
} from '../da-utilities/client';
import { RegistryApiError, RegistryResponseError } from '../errors';
import type { InstrumentMetadata } from '../holdings';
import { isRecord, nonEmptyString } from '../json';
import type { InstrumentId } from '../types';
import { AMULET_INSTRUMENT_ID, AMULET_REGISTRY_BASE_URLS, CANTON_COIN_METADATA } from './constants';

/** How a wallet recognises Canton Coin and reaches its registry. Every field is optional: `{}` is a working setup. */
export interface CantonCoinOptions {
  /**
   * The DSO party of the wallet's network. Pinned, it is the only DSO whose Canton Coin counts and the registry is
   * never asked for it. Unset: the registry's `adminId` is trusted.
   */
  readonly dsoParty?: string;
  /**
   * The base URL of the DSO's CIP-56 registry (a Scan URL, or a proxy of one serving `/registry/...` at its root).
   * Defaults to SV-1's Scan of the wallet's network ({@link AMULET_REGISTRY_BASE_URLS}). The registry is asked only when
   * the party has Canton Coin (holdings or transfer offers), and for the choice context of a Canton Coin offer it
   * answers.
   */
  readonly registryUrl?: string;
  /**
   * Defaults to `globalThis.fetch`. Never the wallet's `registry.fetch`: that one was given for DA's Utilities API and
   * may add headers or route requests meant for that host only.
   */
  readonly fetch?: FetchLike;
}

/** How `describeWalletError` names this registry when it answers an error. */
export const AMULET_REGISTRY_NAME = 'The Canton Coin registry (Scan)';

/** A registry request still unanswered after this long is aborted and counts as a failure. */
export const AMULET_REGISTRY_REQUEST_TIMEOUT_MS = 5000;
/** How long a snapshot waits for a registry lookup; a slower answer is still cached for the next call. */
const SNAPSHOT_WAIT_MS = 1500;
/** After a failed lookup, the registry is not asked again for this long (the lookup answers undefined meanwhile). */
const FAILURE_BACKOFF_MS = 30_000;

/** Canton Coin's registry for one wallet: one DSO resolution, one fail-closed policy, shared by holdings and offers. */
export interface AmuletRegistry {
  /** The pinned DSO party, else the registry's `adminId` once it answered; undefined while neither is known. */
  knownDsoParty(): string | undefined;
  /**
   * The DSO party: pinned, else the registry's `adminId`, looked up once and cached. Undefined when it cannot be
   * confirmed: the lookup failed or timed out (it is asked again only after a back-off) or did not answer within
   * `waitMs` (default: a short wait fit for a snapshot; the answer is still cached when it comes).
   */
  dsoParty(signal?: AbortSignal, waitMs?: number): Promise<string | undefined>;
  /**
   * Canton Coin's metadata when `instrumentId` is the confirmed DSO's `Amulet`: the registry's answer, else
   * {@link CANTON_COIN_METADATA}. Undefined for any other instrument.
   */
  instrumentMetadata(instrumentId: InstrumentId, signal?: AbortSignal): Promise<InstrumentMetadata | undefined>;
  /** Context to accept, reject or withdraw a Canton Coin transfer instruction. */
  transferInstructionContext(
    instructionCid: string,
    action: TransferInstructionAction,
    signal?: AbortSignal
  ): Promise<ChoiceContext>;
}

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
 * A cached, shared lookup: a defined answer is kept; a failure (an error, an undefined answer) is asked again only
 * after {@link FAILURE_BACKOFF_MS}. A caller waits at most `waitMs`, or until its `signal` aborts.
 */
function cachedLookup<T>(
  lookup: () => Promise<T | undefined>,
  now: () => number
): {
  readonly known: () => T | undefined;
  readonly get: (signal: AbortSignal | undefined, waitMs: number) => Promise<T | undefined>;
} {
  let pending: Promise<T | undefined> | undefined;
  let answer: T | undefined;
  let retryAt = 0;
  return {
    known: () => answer,
    async get(signal, waitMs) {
      throwIfAborted(signal);
      if (pending === undefined) {
        if (now() < retryAt) return undefined;
        const request = lookup().catch(() => undefined);
        pending = request;
        void request.then((value) => {
          if (value !== undefined) {
            answer = value;
          } else if (pending === request) {
            pending = undefined;
            retryAt = now() + FAILURE_BACKOFF_MS;
          }
        });
      }
      const shared = pending;
      const wait = after(waitMs);
      const bounded = Promise.race([shared, wait.promise]).finally(() => wait.cancel());
      return signal === undefined ? bounded : awaitWithAbort(async () => bounded, signal);
    },
  };
}

/** Canton Coin's registry on `network`, as `options` configure it. */
export function createAmuletRegistry(
  network: DaNetwork,
  options: CantonCoinOptions = {},
  internal: AmuletRegistryInternalOptions = {}
): AmuletRegistry {
  const { dsoParty: pinnedOption, registryUrl: urlOption } = options;
  if (pinnedOption !== undefined && nonEmptyString(pinnedOption) === undefined) {
    throw new TypeError('cantonCoin.dsoParty must be a non-empty party id');
  }
  if (urlOption !== undefined && nonEmptyString(urlOption) === undefined) {
    throw new TypeError('cantonCoin.registryUrl must be a non-empty URL');
  }
  const pinned = pinnedOption;
  const baseUrl = trimTrailingSlashes(urlOption ?? AMULET_REGISTRY_BASE_URLS[network]);
  const fetchFn = options.fetch ?? globalFetch('cantonCoin.fetch');
  const now = internal.now ?? Date.now;

  /**
   * One registry request, aborted after {@link AMULET_REGISTRY_REQUEST_TIMEOUT_MS} (a custom `fetch` that ignores the
   * signal stops being waited for). `RegistryApiError` for an error status, `RegistryResponseError` for a timeout or a
   * non-JSON answer; a `signal` abort rejects with a branded `AbortError`.
   */
  async function call(
    method: 'GET' | 'POST',
    path: string,
    body: object | undefined,
    signal: AbortSignal | undefined
  ): Promise<unknown> {
    const url = `${baseUrl}${path}`;
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), AMULET_REGISTRY_REQUEST_TIMEOUT_MS);
    const combined = anySignal(signal, timeout.signal);
    try {
      const { response, text } = await awaitWithAbort(async () => {
        const answer = await fetchFn(url, {
          method,
          ...(body !== undefined && {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }),
          ...(combined.signal !== undefined && { signal: combined.signal }),
        });
        return { response: answer, text: await answer.text() };
      }, combined.signal);
      if (!response.ok) throw new RegistryApiError(response.status, text, url, AMULET_REGISTRY_NAME);
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new RegistryResponseError(`${AMULET_REGISTRY_NAME} returned non-JSON for ${url}`);
      }
    } catch (error) {
      if (timeout.signal.aborted && signal?.aborted !== true) {
        throw new RegistryResponseError(
          `${AMULET_REGISTRY_NAME} did not answer ${url} within ${AMULET_REGISTRY_REQUEST_TIMEOUT_MS / 1000} s`
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
      combined.release();
    }
  }

  const registryAdmin = cachedLookup(async () => {
    const info = await call('GET', '/registry/metadata/v1/info', undefined, undefined);
    return isRecord(info) ? nonEmptyString(info['adminId']) : undefined;
  }, now);
  const registryMetadata = cachedLookup(
    async () =>
      parseInstrumentMetadata(
        await call(
          'GET',
          `/registry/metadata/v1/instruments/${encodeURIComponent(AMULET_INSTRUMENT_ID)}`,
          undefined,
          undefined
        ),
        AMULET_INSTRUMENT_ID
      ),
    now
  );

  async function dsoParty(signal?: AbortSignal, waitMs: number = SNAPSHOT_WAIT_MS): Promise<string | undefined> {
    throwIfAborted(signal);
    return pinned ?? registryAdmin.get(signal, waitMs);
  }

  return {
    knownDsoParty: () => pinned ?? registryAdmin.known(),
    dsoParty,
    async instrumentMetadata(instrumentId, signal) {
      if (instrumentId.id !== AMULET_INSTRUMENT_ID) return undefined;
      const dso = await dsoParty(signal);
      if (dso === undefined || instrumentId.admin !== dso) return undefined;
      return (await registryMetadata.get(signal, SNAPSHOT_WAIT_MS)) ?? CANTON_COIN_METADATA;
    },
    async transferInstructionContext(instructionCid, action, signal) {
      return parseChoiceContext(
        await call(
          'POST',
          `/registry/transfer-instruction/v1/${encodeURIComponent(instructionCid)}/choice-contexts/${action}`,
          { excludeDebugFields: true },
          signal
        )
      );
    },
  };
}
