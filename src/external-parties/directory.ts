/**
 * Every party a key controls on one participant, over the Ledger JSON API: a bounded, cached read of `GET /v2/parties`
 * filtered to the key's namespace, plus exact `GET /v2/parties/{party}` lookups of the hints the read may not show.
 * Browser-safe: it takes the ledger client by its shape (node-sdk's `LedgerJsonApiClient` fits), and loads only
 * `@fairmint/canton-protocol/party`, whose `discoverExternalParties` it runs over that client.
 */
import {
  CantonProtocolError,
  discoverExternalParties,
  type ExternalPartyListAnswer,
  fingerprintEd25519PublicKey,
  isCantonHash,
  parsePartyId,
} from '@fairmint/canton-protocol/party';

/** The request options the directory passes to the ledger client. */
export interface ExternalPartyDirectoryRequestConfig {
  readonly contentType?: 'application/json';
  readonly includeBearerToken?: boolean;
}

/**
 * The part of node-sdk's `LedgerJsonApiClient` the directory uses: its base URL and its authenticated JSON GET, which
 * throws an error carrying the participant's HTTP `status` (node-sdk's `ApiError`) on a failure.
 */
export interface ExternalPartyDirectoryLedgerClient {
  getApiUrl(): string;
  makeGetRequest<T>(
    url: string,
    config?: ExternalPartyDirectoryRequestConfig,
    /** `signal` aborts the request (an older client may ignore it). */
    options?: { readonly signal?: AbortSignal }
  ): Promise<T>;
}

export interface ExternalPartyDirectoryOptions {
  readonly ledgerClient: ExternalPartyDirectoryLedgerClient;
  /** The identity provider parties are read under. Defaults to "" (the participant's default). */
  readonly identityProviderId?: string;
  /** Parties per `GET /v2/parties` page. Defaults to 1000; 1 to 10000. */
  readonly pageSize?: number;
  /** Pages one scan reads at most. Defaults to 10; 1 to 1000. */
  readonly maxPages?: number;
  /** How long one scan may take, in milliseconds, a stalled page included. Defaults to 10 seconds; 100 to 120000. */
  readonly timeoutMs?: number;
  /** How long one scan answers for every key, in milliseconds. Defaults to 30 seconds; 0 (no cache) to 600000. */
  readonly cacheMs?: number;
  /** The clock, for tests. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/**
 * The key whose parties are asked for: its public key (raw or DER, base64), or its Canton fingerprint. With both, they
 * must match.
 */
export type ExternalPartyKey =
  | { readonly publicKeyBase64: string; readonly publicKeyFingerprint?: string }
  | { readonly publicKeyFingerprint: string; readonly publicKeyBase64?: undefined };

/**
 * One of a key's parties. Declared here (the same shape as canton-protocol's `ExternalPartyEntry`) so the SDK's public
 * declarations do not import the ESM-only `@fairmint/canton-protocol`, which a CommonJS TypeScript consumer on `module:
 * node16` cannot type-import without `skipLibCheck`.
 */
export interface ExternalPartyDirectoryEntry {
  readonly partyId: string;
  /** What precedes `::` in the party ID. */
  readonly partyHint: string;
  /** Whether this participant hosts the party (it can prepare and submit for it here). */
  readonly hostedHere: boolean;
}

/** What {@link ExternalPartyDirectory.listPartiesForKey} answers: the key's parties, sorted by hint. */
export interface ExternalPartyDirectoryListing {
  readonly parties: readonly ExternalPartyDirectoryEntry[];
  /** False when the scan was cut short (a page or time bound): a party it and the lookups did not show may still exist. */
  readonly complete: boolean;
}

/** What {@link ExternalPartyDirectory.findParty} answers. */
export type ExternalPartyFound = { readonly exists: false } | { readonly exists: true; readonly hostedHere: boolean };

export interface ExternalPartyDirectory {
  /**
   * Every party of the key: the scan's parties in the key's namespace and the parties {@link noteAllocated} recorded,
   * plus an exact {@link findParty} of each of `hints` (at most 16) they do not show, sorted by hint. `complete` is the
   * scan's: false when a page or time bound stopped it first. With a complete scan a failed lookup is skipped; with an
   * incomplete one it fails the call. `signal` stops this caller's wait, not the shared scan.
   *
   * Throws canton-protocol's `CantonProtocolError` (match it with `isCantonProtocolError` from
   * `@fairmint/canton-protocol/party`): `INVALID_INPUT`, `ABORTED`, `INVALID_RESPONSE`, `LIST_FAILED` (the scan's
   * request failed: the ledger client's error is `cause`) or `LOOKUP_FAILED`.
   */
  listPartiesForKey(
    request: ExternalPartyKey & { readonly hints?: readonly string[]; readonly signal?: AbortSignal }
  ): Promise<ExternalPartyDirectoryListing>;
  /**
   * One party by ID (`GET /v2/parties/{party}`): 404 or an answer that does not list it is not found; else it exists,
   * and `hostedHere` is its `isLocal`. The ledger client's errors pass through; an unreadable answer is
   * `INVALID_RESPONSE`.
   */
  findParty(request: { readonly partyId: string; readonly signal?: AbortSignal }): Promise<ExternalPartyFound>;
  /**
   * Records a party allocated (or confirmed to exist) on this participant, so {@link listPartiesForKey} lists it as
   * hosted here at once, even from a scan read before it. Kept for one cache window plus one scan timeout.
   */
  noteAllocated(partyId: string): void;
}

const CONFIG: ExternalPartyDirectoryRequestConfig = Object.freeze({
  contentType: 'application/json',
  includeBearerToken: true,
});

/** One read of the participant's party store: every `hint::namespace` party, by namespace. */
interface PartyScan {
  readonly startedAt: number;
  readonly byNamespace: ReadonlyMap<string, ReadonlyMap<string, boolean>>;
  readonly complete: boolean;
}

/**
 * A directory of the external parties on one participant. The participant API has no namespace filter, so a scan reads
 * the participant's whole party store: one scan serves every key and caller for `cacheMs` (concurrent calls share one
 * scan), and parties recorded with `noteAllocated` are added to it at once. Each scan is bounded: at most `maxPages`
 * pages of `pageSize` and `timeoutMs` overall, a stalled page included (its request is aborted at the deadline); when a
 * bound stops it first, the listing is `complete: false` with what was read. At the defaults one scan is at most 10
 * requests of 1000 parties.
 */
export function createExternalPartyDirectory(options: ExternalPartyDirectoryOptions): ExternalPartyDirectory {
  const { ledgerClient } = options;
  // Checked as untyped input: a JavaScript caller may pass anything.
  const shape: unknown = ledgerClient;
  if (!isRecord(shape) || typeof shape['getApiUrl'] !== 'function' || typeof shape['makeGetRequest'] !== 'function') {
    throw invalidInput("ledgerClient must be @fairmint/canton-node-sdk's LedgerJsonApiClient.");
  }
  const identityProviderId = options.identityProviderId ?? '';
  if (typeof identityProviderId !== 'string') throw invalidInput('identityProviderId must be a string.');
  const pageSize = bounded(options.pageSize, 1_000, 1, 10_000, 'pageSize');
  const maxPages = bounded(options.maxPages, 10, 1, 1_000, 'maxPages');
  const timeoutMs = bounded(options.timeoutMs, 10_000, 100, 120_000, 'timeoutMs');
  const cacheMs = bounded(options.cacheMs, 30_000, 0, 600_000, 'cacheMs');
  const now = options.now ?? Date.now;
  const url = (path: string): string => `${ledgerClient.getApiUrl()}${path}`;
  const invalidResponse = (message: string, partyId?: string): CantonProtocolError =>
    new CantonProtocolError('INVALID_RESPONSE', message, partyId === undefined ? {} : { partyId });

  let cachedScan: PartyScan | undefined;
  let scanInFlight: Promise<PartyScan> | undefined;
  /** Parties recorded here, by ID, with when: a scan that started earlier may not hold them. */
  const allocatedHere = new Map<string, number>();
  /** Entries older than any scan that could still answer: a scan read after them holds those parties. */
  const allocationHorizon = (): number => now() - cacheMs - timeoutMs;

  async function scanParties(): Promise<PartyScan> {
    const startedAt = now();
    const deadline = startedAt + timeoutMs;
    const byNamespace = new Map<string, Map<string, boolean>>();
    const controller = new AbortController();
    let expire: () => void = () => undefined;
    const expired = new Promise<'expired'>((resolve) => {
      expire = () => resolve('expired');
    });
    const timer = setTimeout(() => {
      expire();
      controller.abort();
    }, timeoutMs);
    const finish = (complete: boolean): PartyScan => ({ startedAt, byNamespace, complete });
    try {
      let pageToken = '';
      for (let page = 0; page < maxPages; page += 1) {
        if (page > 0 && now() >= deadline) break;
        const query = new URLSearchParams({ pageSize: String(pageSize) });
        if (pageToken !== '') query.set('pageToken', pageToken);
        if (identityProviderId.length > 0) query.set('identity-provider-id', identityProviderId);
        const request = ledgerClient.makeGetRequest<unknown>(url(`/v2/parties?${query.toString()}`), CONFIG, {
          signal: controller.signal,
        });
        // Read below when it wins; once the deadline wins, its (abort) failure is not ours to report.
        request.catch(() => undefined);
        const response = await Promise.race([request, expired]);
        if (response === 'expired') break;
        const record = isRecord(response) ? response : undefined;
        const details = Array.isArray(record?.['partyDetails']) ? (record['partyDetails'] as unknown[]) : null;
        const next = record?.['nextPageToken'];
        if (details === null || (next !== undefined && typeof next !== 'string')) {
          throw invalidResponse('The participant returned an invalid party list.');
        }
        for (const detail of details) {
          if (!isRecord(detail)) continue;
          const { party } = detail;
          // A listable party ID only ({@link listablePartyId}), so one odd party in the store never fails every key's
          // listing.
          if (typeof party !== 'string') continue;
          const parsed = listablePartyId(party);
          if (parsed === null) continue;
          let parties = byNamespace.get(parsed.namespace);
          if (parties === undefined) {
            parties = new Map();
            byNamespace.set(parsed.namespace, parties);
          }
          parties.set(party, (parties.get(party) ?? false) || detail['isLocal'] === true);
        }
        if (next === undefined || next === '') return finish(true);
        if (next === pageToken) break;
        pageToken = next;
      }
      return finish(false);
    } finally {
      clearTimeout(timer);
    }
  }

  /** The cached scan while it is fresh, else the scan in flight, else a new one. */
  async function currentScan(): Promise<PartyScan> {
    if (cachedScan !== undefined && now() - cachedScan.startedAt < cacheMs) return Promise.resolve(cachedScan);
    if (scanInFlight === undefined) {
      const scan = scanParties().then((result) => {
        if (cacheMs > 0) cachedScan = result;
        return result;
      });
      scanInFlight = scan;
      const clear = (): void => {
        if (scanInFlight === scan) scanInFlight = undefined;
      };
      scan.then(clear, clear);
    }
    return scanInFlight;
  }

  /**
   * The key's parties from the current scan and the recorded allocations, without lookups. `discoverExternalParties`
   * races this against the caller's signal and sorts what it answers.
   */
  async function scannedParties(publicKeyFingerprint: string): Promise<ExternalPartyListAnswer> {
    const scan = await currentScan();
    const parties = new Map(scan.byNamespace.get(publicKeyFingerprint) ?? []);
    const suffix = `::${publicKeyFingerprint}`;
    const horizon = allocationHorizon();
    for (const [partyId, at] of allocatedHere) {
      if (at < horizon) {
        allocatedHere.delete(partyId);
      } else if (partyId.endsWith(suffix)) {
        // Allocated here, so hosted here, whether or not this scan (or its pages) reached it yet.
        parties.set(partyId, true);
      }
    }
    return { parties: [...parties].map(([partyId, hostedHere]) => ({ partyId, hostedHere })), complete: scan.complete };
  }

  const directory: ExternalPartyDirectory = {
    async listPartiesForKey(request) {
      const publicKeyFingerprint = keyFingerprint(request);
      const { signal } = request;
      return discoverExternalParties({
        publicKeyFingerprint,
        ...(request.hints === undefined ? {} : { hints: request.hints }),
        ...(signal === undefined ? {} : { signal }),
        listParties: async () => scannedParties(publicKeyFingerprint),
        findParty: async ({ partyId }) => directory.findParty(signal === undefined ? { partyId } : { partyId, signal }),
      }).then(({ parties, complete }) => Object.freeze({ parties, complete }));
    },

    async findParty(request) {
      const { partyId, signal } = request;
      if (typeof partyId !== 'string' || partyId.trim() === '') throw invalidInput('partyId is required.');
      let response: unknown;
      try {
        // Same identity provider as the scan, as node-sdk's GetPartyDetails sends it.
        const query =
          identityProviderId.length > 0
            ? `?${new URLSearchParams({ 'identity-provider-id': identityProviderId }).toString()}`
            : '';
        response = await ledgerClient.makeGetRequest<unknown>(
          url(`/v2/parties/${encodeURIComponent(partyId)}${query}`),
          CONFIG,
          ...(signal === undefined ? [] : [{ signal }])
        );
      } catch (error) {
        if (readStatus(error) === 404) return { exists: false };
        throw error;
      }
      const record = isRecord(response) ? response : undefined;
      const details = Array.isArray(record?.['partyDetails']) ? (record['partyDetails'] as unknown[]) : null;
      if (details === null) throw invalidResponse('The participant returned invalid party details.', partyId);
      const entry = details.find((detail) => isRecord(detail) && detail['party'] === partyId);
      if (!isRecord(entry)) return { exists: false };
      return { exists: true, hostedHere: entry['isLocal'] === true };
    },

    noteAllocated(partyId) {
      // Only an ID a listing may answer: one it refuses would fail every listing of its key until it expired.
      if (listablePartyId(partyId) === null) {
        throw invalidInput(
          'partyId must be a Daml-LF party ID (hint::namespace, at most 255 ASCII letters, digits, spaces, ":", "-" or "_"), trimmed, on one line.'
        );
      }
      // Drops expired entries as it records one, so the map holds one cache window, not the process lifetime.
      const horizon = allocationHorizon();
      for (const [id, at] of allocatedHere) {
        if (at < horizon) allocatedHere.delete(id);
      }
      allocatedHere.set(partyId, now());
    },
  };
  return Object.freeze(directory);
}

function keyFingerprint(key: ExternalPartyKey): string {
  if (typeof key.publicKeyBase64 === 'string') {
    const fingerprint = fingerprintEd25519PublicKey(key.publicKeyBase64);
    if (key.publicKeyFingerprint !== undefined && key.publicKeyFingerprint !== fingerprint) {
      throw invalidInput('publicKeyFingerprint does not match publicKeyBase64.');
    }
    return fingerprint;
  }
  if (isCantonHash(key.publicKeyFingerprint)) return key.publicKeyFingerprint;
  throw invalidInput('Pass publicKeyBase64 or a Canton publicKeyFingerprint.');
}

function invalidInput(message: string): CantonProtocolError {
  return new CantonProtocolError('INVALID_INPUT', message);
}

/**
 * `value` parsed as a party ID a listing may answer: a Daml-LF Party `hint::namespace` (canton-protocol's
 * `parsePartyId`: at most 255 ASCII letters, digits, spaces, ":", "-" or "_", one separator) without surrounding
 * whitespace, which `discoverExternalParties` refuses in a list answer. Null for anything else.
 */
function listablePartyId(value: unknown): ReturnType<typeof parsePartyId> {
  if (typeof value !== 'string' || value.trim() !== value) return null;
  return parsePartyId(value);
}

function bounded(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < min || resolved > max) {
    throw invalidInput(`${label} must be an integer from ${min} to ${max}.`);
  }
  return resolved;
}

/** The HTTP status on an error or (for wrappers) its `cause`, at most three levels down. */
function readStatus(error: unknown): number | undefined {
  let next: unknown = error;
  for (let depth = 0; depth <= 3 && isRecord(next); depth += 1) {
    const status = next['status'] ?? next['statusCode'];
    if (typeof status === 'number') return status;
    next = next['cause'];
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
