/**
 * The SDK's CIP-0103 (Canton dApp API) client: the only way this module talks to a wallet. Any CIP-0103 provider plugs
 * in (Loop's `loop.getCip103Provider()`, a `@canton-network/dapp-sdk` provider, `window.canton`, Send Connect, …). The
 * provider type is structural, so no wallet SDK is imported.
 *
 * - Party: the `partyId` the dApp gives, else the wallet's primary account (`getPrimaryAccount`).
 * - Submit: `prepareExecuteAndWait` acting as that party only; resolves with `tx.payload.updateId`. Never retried.
 * - Read: `ledgerApi` to the Ledger JSON API v2: one `/v2/state/ledger-end`, then the pages of
 *   `/v2/state/active-contracts-page` at that one offset, filtered to that party only, with every template and
 *   interface filter of the read in one cumulative filter (see {@link ACS_PAGE_SIZE}); a read that joins an earlier
 *   snapshot passes that snapshot's `activeAtOffset` and skips the ledger-end call. It is sent as POST, as the Ledger
 *   JSON API 3.6 OpenAPI, Loop's `ledgerApi` allowlist and `@canton-network/core-acs-reader` do.
 * - Rate limits: wallets rate-limit `ledgerApi` (Loop answers -32005 for an HTTP 429 of its ledger proxy). Loop also
 *   sends two more HTTP requests to its backend before every `ledgerApi` call (a session check, `pair/account`, and a
 *   provider status check), so one `ledgerApi` call is three requests against Loop's limit; a 429 of the session check
 *   reaches the SDK as -32603 "Session verification failed with status 429." Both count as a rate limit
 *   ({@link isRateLimited}): the read is retried after an exponential, jittered back-off
 *   ({@link DEFAULT_READ_RETRY_DELAYS_MS}); when the wallet still refuses, the read fails with a `WalletReadError` whose
 *   `rateLimited` is true (code -32005). Never for submissions.
 * - Fallback: the snapshot is read once through the unpaged `/v2/state/active-contracts` (subject to the participant's
 *   `http-list-max-elements-limit`) only when the first paged call is refused as not offered or malformed
 *   ({@link ACS_FALLBACK_CODES}: 4200, -32601, -32004, -32602), or when Loop answers -32002 with exactly "Ledger access
 *   unavailable". Loop reports every non-429 HTTP failure of its ledger proxy that way (an endpoint missing from its
 *   allowlist, a Canton 3.5 participant that serves the paged endpoint only as GET, a refused `maxPageSize`, but also a
 *   5xx), so that case gets the one fallback request too. A rate limit, a timeout (Loop: -32002 "Ledger request failed
 *   or timed out") or any other failure never falls back: a second request would only add load. When the fallback fails
 *   too, the error names both failures.
 *
 * Spec: CIP-0103 and the dApp API OpenRPC (`openrpc-dapp-api.json` 0.5.0).
 */
import { parseActiveContractEntries } from './acs';
import { WalletReadError, WalletSubmitError } from './errors';
import { isRecord, nonEmptyString } from './json';
import type { DaNetwork } from './da-utilities/client';
import { contractFilterKey } from './templates';
import type {
  ActiveContract,
  ContractFilter,
  DisclosedContract,
  LedgerCommand,
  SubmitResult,
  WalletSubmission,
} from './types';

// A type alias, not an interface: providers declare `params` as `Record<string, unknown>`, which only an alias's
// implicit index signature satisfies.
/** `prepareExecuteAndWait` params (the OpenRPC's `JsPrepareSubmissionRequest`), as far as this SDK sends them. */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type Cip103PrepareExecuteParams = {
  commandId?: string;
  commands: LedgerCommand[];
  disclosedContracts?: DisclosedContract[];
  actAs?: string[];
};

// A type alias, not an interface: providers declare `params` as `Record<string, unknown>`, which only an alias's
// implicit index signature satisfies.
/** `ledgerApi` params (the OpenRPC's `LedgerApiRequest`), as far as this SDK sends them. */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type Cip103LedgerApiParams = {
  requestMethod: 'get' | 'post';
  resource: string;
  body?: Record<string, unknown>;
};

// A type alias, not an interface: providers declare `params` as `Record<string, unknown>`, which only an alias's
// implicit index signature satisfies.
/** `signMessage` params (the OpenRPC's `SignMessageRequest`). */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type Cip103SignMessageParams = {
  message: string;
};

/**
 * The dApp API requests this SDK makes, each in CIP-0103's `{ method, params }` form. `isConnected` answers `{
 * isConnected: boolean, … }`; a wallet without it answers 4200.
 */
export type Cip103Request =
  | { method: 'isConnected' }
  | { method: 'getPrimaryAccount' }
  | { method: 'ledgerApi'; params: Cip103LedgerApiParams }
  | { method: 'prepareExecuteAndWait'; params: Cip103PrepareExecuteParams }
  | { method: 'signMessage'; params: Cip103SignMessageParams };

/** An event listener of CIP-0103's Provider API. */
export type Cip103EventListener = (...args: unknown[]) => void;

/**
 * A CIP-0103 provider (the CIP's EIP-1193 Provider API), as far as this SDK uses it: `request` for the methods in
 * {@link Cip103Request}, plus `on` and `removeListener` (the SDK never emits). Structural, so any conforming provider
 * fits whatever SDK built it: Loop's `loop.getCip103Provider()`, `@canton-network/dapp-sdk`'s `Provider`,
 * `window.canton`. Results are validated, never trusted.
 */
export interface Cip103Provider {
  request(args: Cip103Request): Promise<unknown>;
  on(event: string, listener: Cip103EventListener): unknown;
  removeListener(event: string, listener: Cip103EventListener): unknown;
}

/** CIP-0103 error codes (EIP-1193 and EIP-1474), as `ProviderRpcError.code`. */
export const CIP103_ERROR_CODES = {
  userRejected: 4001,
  unauthorized: 4100,
  unsupportedMethod: 4200,
  disconnected: 4900,
  chainDisconnected: 4901,
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  invalidInput: -32000,
  resourceNotFound: -32001,
  resourceUnavailable: -32002,
  transactionRejected: -32003,
  methodNotSupported: -32004,
  limitExceeded: -32005,
} as const;

const ERROR_NAMES: Readonly<Record<number, string>> = {
  4001: 'User Rejected Request',
  4100: 'Unauthorized',
  4200: 'Unsupported Method',
  4900: 'Disconnected',
  4901: 'Chain Disconnected',
  [-32700]: 'Parse error',
  [-32600]: 'Invalid request',
  [-32601]: 'Method not found',
  [-32602]: 'Invalid params',
  [-32603]: 'Internal error',
  [-32000]: 'Invalid input',
  [-32001]: 'Resource not found',
  [-32002]: 'Resource unavailable',
  [-32003]: 'Transaction rejected',
  [-32004]: 'Method not supported',
  [-32005]: 'Limit exceeded',
};

/** The numeric `code` of a provider error (`ProviderRpcError`, `JsonRpcError` or a plain object). */
export function cip103ErrorCode(error: unknown): number | undefined {
  const code = isRecord(error) ? error['code'] : undefined;
  return typeof code === 'number' && Number.isInteger(code) ? code : undefined;
}

/** `message (CIP-0103 4200 Unsupported Method)`, so a UI can show what the wallet answered. */
export function describeError(error: unknown): string {
  const raw = isRecord(error) ? error['message'] : undefined;
  const message = typeof raw === 'string' && raw.length > 0 ? raw : String(error);
  const code = cip103ErrorCode(error);
  if (code === undefined) return message;
  const name = ERROR_NAMES[code];
  return `${message} (CIP-0103 ${code}${name !== undefined ? ` ${name}` : ''})`;
}

/**
 * Codes a wallet answers only for a request it refused to take on (malformed, or a method or capability it lacks):
 * nothing was handed over, so the submission certainly did not happen.
 */
const NOT_SUBMITTED_CODES: ReadonlySet<number> = new Set([
  CIP103_ERROR_CODES.unsupportedMethod,
  CIP103_ERROR_CODES.parseError,
  CIP103_ERROR_CODES.invalidRequest,
  CIP103_ERROR_CODES.methodNotFound,
  CIP103_ERROR_CODES.invalidParams,
  CIP103_ERROR_CODES.invalidInput,
  CIP103_ERROR_CODES.methodNotSupported,
]);

/**
 * Session codes: the wallet was not (or no longer) connected or authorized. A wallet can answer these before
 * submitting, but also after it handed the transaction on (Loop answers 4100 "Session changed during transaction" after
 * its submit, and 4900/4901 for a connection lost while waiting), so they do not prove nothing was submitted.
 */
const SESSION_CODES: ReadonlySet<number> = new Set([
  CIP103_ERROR_CODES.unauthorized,
  CIP103_ERROR_CODES.disconnected,
  CIP103_ERROR_CODES.chainDisconnected,
]);

/**
 * A provider error from `prepareExecuteAndWait` as a `WalletSubmitError`:
 *
 * - 4001 → `rejected-by-user`;
 * - -32003 → `failed` (the ledger rejected it);
 * - 4200 and the request/params errors (-32700, -32600, -32601, -32602, -32000, -32004) → `failed`: the wallet did not
 *   take the request on, so nothing was submitted;
 * - 4100, 4900, 4901 → `unknown`: the wallet lost or changed its session, possibly after submitting;
 * - Anything else (-32002 timeouts, -32603, no code) → `unknown`: never resubmit without checking the wallet.
 */
export function cip103SubmitError(error: unknown, commandId?: string): WalletSubmitError {
  const code = cip103ErrorCode(error);
  const message = describeError(error);
  const details = {
    ...(code !== undefined && { code }),
    ...(commandId !== undefined && { commandId }),
  };
  if (code === CIP103_ERROR_CODES.userRejected) {
    return new WalletSubmitError(
      'rejected-by-user',
      `The user rejected the transaction in the wallet: ${message}`,
      details
    );
  }
  if (code === CIP103_ERROR_CODES.transactionRejected) {
    return new WalletSubmitError('failed', `The ledger rejected the transaction: ${message}`, details);
  }
  if (code !== undefined && NOT_SUBMITTED_CODES.has(code)) {
    return new WalletSubmitError(
      'failed',
      `The wallet refused the request, so nothing was submitted: ${message}`,
      details
    );
  }
  if (code !== undefined && SESSION_CODES.has(code)) {
    return new WalletSubmitError(
      'unknown',
      `The wallet lost or changed its session during the request; it may or may not have been submitted: ${message}.`,
      details
    );
  }
  return new WalletSubmitError('unknown', `The wallet did not confirm the transaction: ${message}.`, details);
}

/** The `prepareExecuteAndWait` result `{tx: {status: 'executed', commandId, payload: {updateId}}}`. */
function readSubmitResult(raw: unknown, commandId?: string): SubmitResult {
  const tx = isRecord(raw) ? raw['tx'] : undefined;
  const status = isRecord(tx) ? tx['status'] : undefined;
  const payload = isRecord(tx) ? tx['payload'] : undefined;
  const updateId = isRecord(payload) ? nonEmptyString(payload['updateId']) : undefined;
  const resultCommandId = (isRecord(tx) ? nonEmptyString(tx['commandId']) : undefined) ?? commandId;
  const details = resultCommandId !== undefined ? { commandId: resultCommandId } : {};
  if (status === 'failed') {
    throw new WalletSubmitError('failed', 'The wallet reported the transaction failed', details);
  }
  if (status !== 'executed' || updateId === undefined) {
    throw new WalletSubmitError('unknown', 'The wallet answered without an executed transaction.', details);
  }
  return { updateId, ...details };
}

function newCommandId(): string | undefined {
  // Typed as always present, but missing outside secure contexts and in old runtimes.
  const { crypto } = globalThis as { crypto?: Partial<Crypto> };
  return typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : undefined;
}

/**
 * The fields of the CIP-0103 `Wallet` (account) this SDK reads. `publicKey` and `namespace` are as the wallet reports
 * them (their encoding is not specified by CIP-0103); absent when the wallet did not send them.
 */
export interface Cip103Account {
  readonly partyId: string;
  readonly publicKey?: string;
  readonly namespace?: string;
  readonly networkId?: string;
  readonly signingProviderId?: string;
}

/**
 * The wallet's primary account (`getPrimaryAccount`). The dApp runs its wallet's own connect flow first; a provider
 * that is not connected answers 4100.
 */
export async function primaryAccount(provider: Cip103Provider): Promise<Cip103Account> {
  let account: unknown;
  try {
    account = await provider.request({ method: 'getPrimaryAccount' });
  } catch (error) {
    throw new WalletReadError(
      `The wallet did not return its primary account: ${describeError(error)}`,
      cip103ErrorCode(error)
    );
  }
  const partyId = isRecord(account) ? nonEmptyString(account['partyId']) : undefined;
  if (!isRecord(account) || partyId === undefined) {
    throw new WalletReadError('The wallet returned a primary account without partyId');
  }
  const publicKey = nonEmptyString(account['publicKey']);
  const namespace = nonEmptyString(account['namespace']);
  const networkId = nonEmptyString(account['networkId']);
  const signingProviderId = nonEmptyString(account['signingProviderId']);
  return {
    partyId,
    ...(publicKey !== undefined && { publicKey }),
    ...(namespace !== undefined && { namespace }),
    ...(networkId !== undefined && { networkId }),
    ...(signingProviderId !== undefined && { signingProviderId }),
  };
}

/** The wallet party: the primary account's `partyId` (`getPrimaryAccount`). */
export async function primaryPartyId(provider: Cip103Provider): Promise<string> {
  return (await primaryAccount(provider)).partyId;
}

/**
 * The CIP-0103 network id of a Canton network (`canton:devnet`), as a wallet reports it in its account's `networkId`
 * and as a wallet ownership message names it.
 */
export function cip103NetworkId(network: DaNetwork): string {
  return `canton:${network}`;
}

/**
 * Entries asked for per `/v2/state/active-contracts-page` request (`maxPageSize`). Well under the participant's default
 * page and list limits, so a participant does not refuse it.
 */
export const ACS_PAGE_SIZE = 200;

/**
 * The most `/v2/state/active-contracts-page` requests one read makes ({@link ACS_PAGE_SIZE} × this = 100,000 contracts
 * of one filter). A read that needs more fails with `WalletReadError` instead of paging on.
 */
export const ACS_MAX_PAGES = 500;

/**
 * Codes of a first paged ACS call after which the snapshot is read once through the unpaged
 * `/v2/state/active-contracts` instead: the wallet does not offer the paged endpoint (4200, -32601, -32004), or refused
 * the paged request's shape (-32602). Loop reports those cases differently (see {@link LOOP_HTTP_REFUSED_MESSAGE}). Any
 * other failure (a rate limit, a timeout, a refused or disconnected session) is reported as it is: a second read would
 * fail the same way and only add load.
 */
export const ACS_FALLBACK_CODES: ReadonlySet<number> = new Set([
  CIP103_ERROR_CODES.unsupportedMethod,
  CIP103_ERROR_CODES.methodNotFound,
  CIP103_ERROR_CODES.methodNotSupported,
  CIP103_ERROR_CODES.invalidParams,
]);

/**
 * Loop's message, with code -32002, for any non-OK HTTP reply of its ledger proxy other than 429 that carries no
 * structured error (`@fivenorth/loop-sdk` `Connection.ledgerApi`): an endpoint its allowlist does not offer, a
 * participant that serves the paged endpoint only as GET (Canton 3.5) or refuses its `maxPageSize`, or a server error.
 * Loop's timeout or network failure is another message ("Ledger request failed or timed out") and does not fall back.
 */
export const LOOP_HTTP_REFUSED_MESSAGE = 'Ledger access unavailable';

/**
 * Whether a provider error is a rate limit: -32005, or -32603 whose message says HTTP status 429 (Loop's session check,
 * which runs before every `ledgerApi` call, throws a plain `Error` that Loop's CIP-0103 adapter maps to -32603).
 */
export function isRateLimited(error: unknown): boolean {
  const code = cip103ErrorCode(error);
  if (code === CIP103_ERROR_CODES.limitExceeded) return true;
  const message = isRecord(error) && typeof error['message'] === 'string' ? error['message'] : '';
  return code === CIP103_ERROR_CODES.internalError && /\bstatus 429\b/.test(message);
}

/** Read errors whose provider error was Loop's {@link LOOP_HTTP_REFUSED_MESSAGE} with -32002. */
const loopHttpRefusals = new WeakSet<WalletReadError>();

/** Whether a first paged ACS call's failure means the paged endpoint is not usable, so the unpaged one is tried once. */
function pagedEndpointRefused(error: unknown): boolean {
  if (!(error instanceof WalletReadError) || error.code === undefined) return false;
  return ACS_FALLBACK_CODES.has(error.code) || loopHttpRefusals.has(error);
}

/**
 * Waits before each retry of a read the wallet rate-limited (-32005): 0.5 s, 1 s, 2 s, 4 s, so at most five attempts
 * over about 7.5 s. Each wait is jittered to between half and all of its value, so parallel readers spread out.
 */
export const DEFAULT_READ_RETRY_DELAYS_MS: readonly number[] = [500, 1000, 2000, 4000];

/** How reads back off when the wallet rate-limits them (-32005). Never applied to submissions. */
export interface WalletReadRetryOptions {
  /** The wait before each retry, in milliseconds; defaults to {@link DEFAULT_READ_RETRY_DELAYS_MS}. Empty: no retry. */
  readonly delaysMs?: readonly number[];
  /** Defaults to `setTimeout`. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** A number in [0, 1) for the jitter; defaults to `Math.random`. */
  readonly random?: () => number;
}

const defaultSleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Contracts of one ACS snapshot, read at one ledger offset. */
export interface AcsSnapshot {
  readonly offset: number;
  readonly contracts: ActiveContract[];
}

/** One `JsGetActiveContractsPageResponse`: `{activeContracts, activeAtOffset, nextPageToken?}`. */
function readAcsPage(raw: unknown, offset: number): { entries: unknown[]; nextPageToken: string | undefined } {
  if (!isRecord(raw) || !Array.isArray(raw['activeContracts'])) {
    throw new WalletReadError('The wallet returned an active-contracts page without an activeContracts list');
  }
  const pageOffset = raw['activeAtOffset'];
  if (pageOffset !== undefined && pageOffset !== offset) {
    throw new WalletReadError(
      `The wallet returned an active-contracts page at offset ${JSON.stringify(pageOffset)}, not the requested ${offset}`
    );
  }
  const token = raw['nextPageToken'];
  if (token !== undefined && token !== null && typeof token !== 'string') {
    throw new WalletReadError('The wallet returned an active-contracts page with a nextPageToken that is not a string');
  }
  return {
    entries: raw['activeContracts'],
    nextPageToken: typeof token === 'string' && token.length > 0 ? token : undefined,
  };
}

export interface AcsReadOptions {
  /**
   * Read at this ledger offset (one an earlier read reported) instead of the current ledger end, so a later read joins
   * an earlier snapshot.
   */
  readonly activeAtOffset?: number;
}

/** What the token actions need from a wallet: one party, its contracts, and a submit that waits for the commit. */
export interface Cip103Wallet {
  readonly partyId: string;
  /** Active contracts of `partyId` matching the filter, as one snapshot at the ledger end (or at `activeAtOffset`). */
  listActiveContracts(filter: ContractFilter, options?: AcsReadOptions): Promise<ActiveContract[]>;
  /**
   * Active contracts of `partyId` matching any of the filters, as one snapshot at the ledger end: one ledger-end call
   * and one paged ACS stream whose cumulative filter carries every filter. A contract matching several is returned
   * once. With `activeAtOffset`, the snapshot is read at that offset and the ledger end is not read.
   */
  readActiveContracts(filters: readonly ContractFilter[], options?: AcsReadOptions): Promise<AcsSnapshot>;
  /** Sign and submit as `partyId`; resolves once committed, else throws `WalletSubmitError`. Never retries. */
  submit(submission: WalletSubmission): Promise<SubmitResult>;
}

export interface Cip103WalletOptions {
  /** How reads back off when the wallet rate-limits them. */
  readonly readRetry?: WalletReadRetryOptions;
}

/** A Ledger JSON API v2 `CumulativeFilter` for one template or interface. */
function cumulativeFilter(filter: ContractFilter): Record<string, unknown> {
  return {
    identifierFilter:
      'templateId' in filter
        ? {
            TemplateFilter: {
              value: {
                templateId: filter.templateId,
                includeCreatedEventBlob: false,
              },
            },
          }
        : {
            InterfaceFilter: {
              value: {
                interfaceId: filter.interfaceId,
                includeInterfaceView: true,
                includeCreatedEventBlob: false,
              },
            },
          },
  };
}

/** The SDK's CIP-0103 client acting as `partyId` through `provider`. */
export function cip103Wallet(
  provider: Cip103Provider,
  partyId: string,
  options: Cip103WalletOptions = {}
): Cip103Wallet {
  const delays = options.readRetry?.delaysMs ?? DEFAULT_READ_RETRY_DELAYS_MS;
  const sleep = options.readRetry?.sleep ?? defaultSleep;
  const random = options.readRetry?.random ?? Math.random;

  /** A read through `ledgerApi`, retried with back-off while the wallet answers -32005. */
  async function ledgerApi(
    requestMethod: 'get' | 'post',
    resource: string,
    body?: Record<string, unknown>
  ): Promise<unknown> {
    const call = `ledgerApi ${requestMethod.toUpperCase()} ${resource}`;
    let waitedMs = 0;
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await provider.request({
          method: 'ledgerApi',
          params: {
            requestMethod,
            resource,
            ...(body !== undefined && { body }),
          },
        });
      } catch (error) {
        const code = cip103ErrorCode(error);
        if (!isRateLimited(error)) {
          const failed = new WalletReadError(`The wallet's ${call} failed: ${describeError(error)}`, code);
          if (
            code === CIP103_ERROR_CODES.resourceUnavailable &&
            isRecord(error) &&
            error['message'] === LOOP_HTTP_REFUSED_MESSAGE
          ) {
            loopHttpRefusals.add(failed);
          }
          throw failed;
        }
        const delay = delays[attempt];
        if (delay === undefined) {
          const tries =
            attempt === 0
              ? ''
              : ` on all ${attempt + 1} attempts, backing off ${(waitedMs / 1000).toFixed(1)} s in total`;
          throw new WalletReadError(
            `The wallet rate-limited its ledger reads: ${call} answered ${describeError(error)}${tries}. Wait a moment, then retry.`,
            CIP103_ERROR_CODES.limitExceeded
          );
        }
        const wait = Math.round(delay / 2 + (delay / 2) * Math.min(Math.max(random(), 0), 1));
        waitedMs += wait;
        await sleep(wait);
      }
    }
  }

  async function ledgerEnd(): Promise<number> {
    const end = await ledgerApi('get', '/v2/state/ledger-end');
    const offset = isRecord(end) ? end['offset'] : undefined;
    if (typeof offset !== 'number' || !Number.isSafeInteger(offset)) {
      throw new WalletReadError('The wallet returned no ledger end offset');
    }
    return offset;
  }

  async function readActiveContracts(
    filters: readonly ContractFilter[],
    readOptions: AcsReadOptions = {}
  ): Promise<AcsSnapshot> {
    // A template or an interface should not appear twice in a cumulative filter.
    const unique = [...new Map(filters.map((filter) => [contractFilterKey(filter), filter])).values()];
    if (unique.length === 0) throw new TypeError('readActiveContracts needs at least one filter');
    const at = readOptions.activeAtOffset;
    if (at !== undefined && (!Number.isSafeInteger(at) || at < 0)) {
      throw new TypeError(`activeAtOffset must be a non-negative integer, not ${String(at)}`);
    }
    const offset = at ?? (await ledgerEnd());
    const eventFormat = {
      verbose: false,
      filtersByParty: {
        [partyId]: { cumulative: unique.map(cumulativeFilter) },
      },
    };

    // Pages at the one offset read above, so every page belongs to the same snapshot. The unpaged endpoint fails once
    // the matches exceed the participant's `http-list-max-elements-limit`; this one does not.
    const entries: unknown[] = [];
    let pageToken: string | undefined;
    for (let page = 0; ; page += 1) {
      if (page === ACS_MAX_PAGES) {
        throw new WalletReadError(
          `The wallet's active contracts did not end within ${ACS_MAX_PAGES} pages of ${ACS_PAGE_SIZE}; nothing was read`
        );
      }
      let raw: unknown;
      try {
        raw = await ledgerApi('post', '/v2/state/active-contracts-page', {
          activeAtOffset: offset,
          eventFormat,
          maxPageSize: ACS_PAGE_SIZE,
          ...(pageToken !== undefined && { pageToken }),
        });
      } catch (error) {
        if (page === 0 && error instanceof WalletReadError && pagedEndpointRefused(error)) {
          return { offset, contracts: await readUnpaged(offset, eventFormat, error) };
        }
        throw error;
      }
      const next = readAcsPage(raw, offset);
      entries.push(...next.entries);
      if (next.nextPageToken === undefined) break;
      if (next.nextPageToken === pageToken) {
        throw new WalletReadError('The wallet returned the same active-contracts page token twice');
      }
      pageToken = next.nextPageToken;
    }
    return { offset, contracts: parseActiveContractEntries(entries) };
  }

  /** The unpaged snapshot after the paged endpoint was refused; a failure names both. */
  async function readUnpaged(
    offset: number,
    eventFormat: Record<string, unknown>,
    pagedError: WalletReadError
  ): Promise<ActiveContract[]> {
    try {
      const all: unknown = await ledgerApi('post', '/v2/state/active-contracts', {
        verbose: false,
        activeAtOffset: offset,
        eventFormat,
      });
      if (!Array.isArray(all)) {
        throw new WalletReadError('The wallet returned active contracts that are not a list');
      }
      // Parsed inside the try, so malformed fallback entries also report the original paged failure.
      return parseActiveContractEntries(all);
    } catch (error) {
      if (!(error instanceof WalletReadError)) throw error;
      throw new WalletReadError(
        `${pagedError.message}; the unpaged fallback failed too: ${error.message}`,
        error.code ?? pagedError.code
      );
    }
  }

  return {
    partyId,

    async listActiveContracts(filter, readOptions) {
      return (await readActiveContracts([filter], readOptions)).contracts;
    },

    readActiveContracts,

    async submit(submission) {
      const commandId = submission.commandId ?? newCommandId();
      const disclosed = submission.disclosedContracts ?? [];
      let raw: unknown;
      try {
        raw = await provider.request({
          method: 'prepareExecuteAndWait',
          params: {
            ...(commandId !== undefined && { commandId }),
            commands: [...submission.commands],
            ...(disclosed.length > 0 && { disclosedContracts: [...disclosed] }),
            actAs: [partyId],
          },
        });
      } catch (error) {
        throw cip103SubmitError(error, commandId);
      }
      return readSubmitResult(raw, commandId);
    },
  };
}
