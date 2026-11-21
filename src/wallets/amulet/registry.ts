/**
 * Canton Coin's CIP-56 registry, served by Scan (no auth, CORS open on the SV Scans checked): the DSO party (the Amulet
 * instrument admin) and the choice contexts to accept, reject or withdraw an Amulet transfer instruction (a pending CC
 * transfer offer). Browser-safe: it uses an injectable `fetch` and sends only `content-type: application/json`.
 *
 * Endpoints: the token standard metadata V1 (`GET /registry/metadata/v1/info`) and transfer-instruction V1 (`POST
 * /registry/transfer-instruction/v1/{cid}/choice-contexts/{action}`) specs, at the root of a Scan URL. A validator's
 * authenticated scan proxy (`/api/validator/v0/scan-proxy`) serves the same paths; an app that proxies it passes its
 * own `baseUrl` and `fetch`.
 */
import { awaitWithAbort, throwIfAborted } from '../abort';
export { AMULET_INSTRUMENT_ID } from './constants';
import type { TransferInstructionAction } from '../commands';
import {
  globalFetch,
  parseChoiceContext,
  type ChoiceContext,
  type DaNetwork,
  type FetchLike,
} from '../da-utilities/client';
import { RegistryApiError, RegistryResponseError } from '../errors';
import { isRecord, nonEmptyString } from '../json';

/** How `describeWalletError` names this registry when it answers an error. */
export const AMULET_REGISTRY_NAME = 'The Canton Coin registry (Scan)';

/**
 * A Scan per network whose registry is public with CORS open (checked 21 November 2026: `GET
 * /registry/metadata/v1/info` answered with the DSO party and reflected the page's origin).
 */
export const AMULET_REGISTRY_BASE_URLS: Readonly<Record<DaNetwork, string>> = {
  devnet: 'https://scan.sv-1.dev.global.canton.network.sync.global',
  mainnet: 'https://scan.sv-1.global.canton.network.sync.global',
};

/** How a wallet reaches Canton Coin's registry. */
export interface AmuletRegistryOptions {
  /**
   * A Scan URL (or a pass-through) serving `/registry/...` at its root. Defaults to SV-1's Scan of the wallet's network
   * ({@link AMULET_REGISTRY_BASE_URLS}).
   */
  readonly baseUrl?: string;
  /** Defaults to `globalThis.fetch`. */
  readonly fetch?: FetchLike;
  /**
   * The DSO party to trust as Canton Coin's admin. Defaults to the registry's own `adminId`: the registry is then the
   * trust anchor, as DA's Utilities API is for DA's operator. Pin it to trust no answer of the registry for it.
   */
  readonly dsoParty?: string;
}

/** Canton Coin's registry for one network. */
export interface AmuletRegistryClient {
  /**
   * The DSO party (pinned, else the registry's `adminId`), fetched once; a failed lookup is retried next call. The
   * lookup is shared, so `signal` only stops this call waiting for it.
   */
  dsoParty(signal?: AbortSignal): Promise<string>;
  /** Context to accept, reject or withdraw an Amulet transfer instruction. */
  transferInstructionContext(
    instructionCid: string,
    action: TransferInstructionAction,
    signal?: AbortSignal
  ): Promise<ChoiceContext>;
}

/** A client for Canton Coin's registry on a network (at `options.baseUrl` when given). */
export function createAmuletRegistryClient(
  network: DaNetwork,
  options: AmuletRegistryOptions = {}
): AmuletRegistryClient {
  const baseUrl = trimTrailingSlashes(options.baseUrl ?? AMULET_REGISTRY_BASE_URLS[network]);
  const fetchFn = options.fetch ?? globalFetch('amulet.fetch');
  const pinnedDso = options.dsoParty;
  if (pinnedDso !== undefined && (typeof pinnedDso !== 'string' || pinnedDso.length === 0)) {
    throw new TypeError('amulet.dsoParty must be a non-empty party id');
  }

  async function call(method: 'GET' | 'POST', path: string, body?: object, signal?: AbortSignal): Promise<unknown> {
    const url = `${baseUrl}${path}`;
    const { response, text } = await awaitWithAbort(async () => {
      const answer = await fetchFn(url, {
        method,
        ...(body !== undefined && {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        ...(signal !== undefined && { signal }),
      });
      return { response: answer, text: await answer.text() };
    }, signal);
    if (!response.ok) throw new RegistryApiError(response.status, text, url, AMULET_REGISTRY_NAME);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new RegistryResponseError(`Canton Coin registry returned non-JSON for ${url}`);
    }
  }

  async function fetchDso(): Promise<string> {
    const raw = await call('GET', '/registry/metadata/v1/info');
    const adminId = isRecord(raw) ? nonEmptyString(raw['adminId']) : undefined;
    if (adminId === undefined) {
      throw new RegistryResponseError('Canton Coin registry returned no adminId');
    }
    return adminId;
  }

  let dsoPromise: Promise<string> | undefined;
  async function dsoParty(signal?: AbortSignal): Promise<string> {
    throwIfAborted(signal);
    if (pinnedDso !== undefined) return pinnedDso;
    dsoPromise ??= fetchDso().catch((error: unknown) => {
      dsoPromise = undefined;
      throw error;
    });
    const shared = dsoPromise;
    // A cancelled caller may never observe `shared`; other callers still do, so a later failure is never unhandled.
    void shared.catch(() => undefined);
    return signal === undefined ? shared : awaitWithAbort(async () => shared, signal);
  }

  return {
    dsoParty,
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

/** Drop trailing `/` characters in linear time (a `/\/+$/` regex backtracks quadratically). */
function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end--;
  return url.slice(0, end);
}
