/**
 * The SDK's CIP-0103 (Canton dApp API) client: the only way this module talks to a wallet. Any CIP-0103 provider plugs
 * in; the provider type is structural, so no wallet SDK is imported.
 *
 * - Submit: `prepareExecuteAndWait` acting as the wallet's party only, with a fresh command id; resolves with
 *   `tx.payload.updateId`. Never retried.
 * - Read: `ledgerApi` to the Ledger JSON API v2: `GET /v2/state/ledger-end`, then one `POST /v2/state/active-contracts`
 *   at that offset with `{ activeAtOffset, eventFormat }`, filtered to the party only, every template of the read in
 *   one cumulative filter. The unpaged endpoint is the one wallets serve: Canton 3.5 serves
 *   `/v2/state/active-contracts-page` only as GET, and wallets forward the ACS reads as POST. The participant refuses
 *   an unpaged read that matches more contracts than its `http-list-max-elements-limit` (200 by default); the read then
 *   fails with a `WalletReadError` that names that limit.
 * - Rate limits: a read the wallet rate-limits (-32005, or a provider quirk listed in `RATE_LIMIT_QUIRKS`) is retried
 *   after an exponential, jittered back-off (`DEFAULT_READ_RETRY_DELAYS_MS`); when the wallet still refuses, the read
 *   fails with a `WalletReadError` whose `rateLimited` is true (code -32005). Never for submissions.
 *
 * Spec: CIP-0103 and the dApp API OpenRPC (`openrpc-dapp-api.json` 0.5.0).
 */
import { parseActiveContractEntries } from './acs';
import type { DaNetwork } from './da-utilities/client';
import { WalletReadError, WalletSubmitError, type WalletSubmitCategory } from './errors';
import { isRecord, nonEmptyString } from './json';
import type { ActiveContract, DisclosedContract, LedgerCommand, SubmitResult, WalletSubmission } from './types';

// A type alias, not an interface: providers declare `params` as `Record<string, unknown>`, which only an alias's
// implicit index signature satisfies.
/** `prepareExecuteAndWait` params (the OpenRPC's `JsPrepareSubmissionRequest`), as far as this SDK sends them. */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type Cip103PrepareExecuteParams = {
  commandId: string;
  commands: LedgerCommand[];
  disclosedContracts?: DisclosedContract[];
  actAs: string[];
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
 * The dApp API requests this SDK makes, each in CIP-0103's `{ method, params }` form. `connect` runs the wallet's own
 * sign-in and `disconnect` ends its session (`createCip103Session` sends both). `isConnected` answers `{ isConnected:
 * boolean, … }`; a wallet without it answers 4200.
 */
export type Cip103Request =
  | { method: 'connect' }
  | { method: 'disconnect' }
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
 * fits whatever SDK built it. Results are validated, never trusted.
 */
export interface Cip103Provider {
  request(args: Cip103Request): Promise<unknown>;
  on(event: string, listener: Cip103EventListener): unknown;
  removeListener(event: string, listener: Cip103EventListener): unknown;
}

/** A provider connected as one party on one DA network. A session's connected wallet is one. */
export interface Cip103Connection {
  readonly provider: Cip103Provider;
  readonly partyId: string;
  readonly network: DaNetwork;
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

/** The `message` of a provider error, or empty. */
function errorMessage(error: unknown): string {
  const message = isRecord(error) ? error['message'] : undefined;
  return typeof message === 'string' ? message : '';
}

/** `message (CIP-0103 4200 Unsupported Method)`, so a UI can show what the wallet answered. */
export function describeError(error: unknown): string {
  const raw = errorMessage(error);
  const message = raw.length > 0 ? raw : String(error);
  const code = cip103ErrorCode(error);
  if (code === undefined) return message;
  const name = ERROR_NAMES[code];
  return `${message} (CIP-0103 ${code}${name !== undefined ? ` ${name}` : ''})`;
}

/** The CIP-0103 network id of a DA network (`canton:devnet`), as a wallet reports it and an ownership message names it. */
export function cip103NetworkId(network: DaNetwork): string {
  return `canton:${network}`;
}

const DA_NETWORKS: readonly DaNetwork[] = ['devnet', 'mainnet'];

/** Whether `value` is `'devnet'` or `'mainnet'`. */
export function isDaNetwork(value: unknown): value is DaNetwork {
  return DA_NETWORKS.some((network) => network === value);
}

/**
 * Whether a wallet reporting `networkId` is on the other DA network than `network`. CIP-0103 does not fix how a wallet
 * spells its network id, so any other id (or none) is accepted rather than locking users out.
 */
export function reportsOtherNetwork(networkId: string | undefined, network: DaNetwork): boolean {
  return DA_NETWORKS.some((other) => other !== network && networkId === cip103NetworkId(other));
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
 * Session codes: the wallet was not (or no longer) connected or authorized. A wallet can answer these after it handed
 * the transaction on (a session that changed or a connection lost while waiting), so they do not prove nothing was
 * submitted.
 */
const SESSION_CODES: ReadonlySet<number> = new Set([
  CIP103_ERROR_CODES.unauthorized,
  CIP103_ERROR_CODES.disconnected,
  CIP103_ERROR_CODES.chainDisconnected,
]);

/** Canton's error text, `ERROR_ID(category,correlation id): cause`, as a wallet may pass it on in a message. */
const CANTON_ERROR_TEXT = /\b([A-Z][A-Z0-9_]{2,63})\((\d{1,2}),[0-9A-Za-z-]{0,64}\)/;
/** A Canton error id, as a Ledger JSON API error (`JsCantonError`) names it in `code`. */
const CANTON_ERROR_ID = /^[A-Z][A-Z0-9_]{2,63}$/;
/** How much of a string, and how deep and wide into `data`, the Canton error search looks. */
const CANTON_ERROR_SEARCH = { chars: 8192, depth: 4, keys: 32 } as const;

/** A Canton error a wallet passed on: its id and, when given, its error category (`ErrorCategory.asInt`). */
export interface CantonErrorRef {
  readonly id: string;
  readonly category?: number;
}

function cantonErrorIn(value: unknown, depth: number): CantonErrorRef | undefined {
  if (typeof value === 'string') {
    const match = CANTON_ERROR_TEXT.exec(value.slice(0, CANTON_ERROR_SEARCH.chars));
    return match?.[1] !== undefined ? { id: match[1], category: Number(match[2]) } : undefined;
  }
  if (depth > CANTON_ERROR_SEARCH.depth || typeof value !== 'object' || value === null) return undefined;
  if (isRecord(value)) {
    const { code, errorCategory } = value;
    if (typeof code === 'string' && CANTON_ERROR_ID.test(code) && typeof errorCategory === 'number') {
      return Number.isInteger(errorCategory) ? { id: code, category: errorCategory } : { id: code };
    }
  }
  const keys = Object.keys(value);
  const limit = Math.min(keys.length, CANTON_ERROR_SEARCH.keys);
  for (let index = 0; index < limit; index += 1) {
    let nested: unknown;
    try {
      nested = (value as Record<string, unknown>)[keys[index] as string];
    } catch {
      continue;
    }
    const found = cantonErrorIn(nested, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * The Canton error a provider error carries, in its message (`ERROR_ID(category,…)`) or its `data` (a `JsCantonError`
 * `{ code, errorCategory }`, or that text); undefined when it carries none. Bounded, and never throws.
 */
export function cantonErrorOf(error: unknown): CantonErrorRef | undefined {
  try {
    return cantonErrorIn(errorMessage(error), 0) ?? (isRecord(error) ? cantonErrorIn(error['data'], 0) : undefined);
  } catch {
    return undefined;
  }
}

/** Canton's `ErrorCategory.asInt` → the submit category it stands for. */
const CANTON_CATEGORIES: Readonly<Record<number, WalletSubmitCategory>> = {
  1: 'unavailable',
  2: 'contention',
  3: 'timeout',
  4: 'internal',
  5: 'invalid',
  6: 'permission',
  7: 'permission',
  8: 'invalid',
  9: 'precondition',
  10: 'duplicate',
  11: 'not-found',
  12: 'precondition',
  13: 'unavailable',
  14: 'internal',
};

/** The submit category of a provider error: 4001 first, then the Canton error's category, then the CIP-0103 code. */
function submitCategory(code: number | undefined, canton: CantonErrorRef | undefined): WalletSubmitCategory {
  if (code === CIP103_ERROR_CODES.userRejected) return 'user-rejected';
  const fromCanton = canton?.category !== undefined ? CANTON_CATEGORIES[canton.category] : undefined;
  if (fromCanton !== undefined) return fromCanton;
  if (code === undefined) return 'unknown';
  if (NOT_SUBMITTED_CODES.has(code)) return 'wallet-refused';
  if (SESSION_CODES.has(code)) return 'session';
  switch (code) {
    case CIP103_ERROR_CODES.limitExceeded:
      return 'rate-limited';
    case CIP103_ERROR_CODES.transactionRejected:
      return 'ledger-rejected';
    case CIP103_ERROR_CODES.resourceUnavailable:
      return 'unavailable';
    case CIP103_ERROR_CODES.internalError:
      return 'internal';
    default:
      return 'unknown';
  }
}

/**
 * A provider error from `prepareExecuteAndWait` as a `WalletSubmitError`:
 *
 * - 4001 → `rejected-by-user`;
 * - -32003 → `failed` (the ledger rejected it);
 * - 4200 and the request/params errors (-32700, -32600, -32601, -32602, -32000, -32004) → `failed`: the wallet did not
 *   take the request on, so nothing was submitted;
 * - 4100, 4900, 4901 → `unknown`: the wallet lost or changed its session, possibly after submitting;
 * - Anything else (-32002 timeouts, -32603, no code) → `unknown`: never resubmit without checking the wallet.
 *
 * The outcome follows the CIP-0103 code alone. The error's `category` and `cantonErrorId` add why, from the Canton
 * error the wallet passed on when it passed one on (see `WalletSubmitCategory`).
 */
export function cip103SubmitError(error: unknown, commandId: string): WalletSubmitError {
  const code = cip103ErrorCode(error);
  const message = describeError(error);
  const canton = cantonErrorOf(error);
  const details = {
    ...(code !== undefined && { code }),
    commandId,
    category: submitCategory(code, canton),
    ...(canton !== undefined && { cantonErrorId: canton.id }),
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
function readSubmitResult(raw: unknown, commandId: string): SubmitResult {
  const tx = isRecord(raw) ? raw['tx'] : undefined;
  const status = isRecord(tx) ? tx['status'] : undefined;
  const payload = isRecord(tx) ? tx['payload'] : undefined;
  const updateId = isRecord(payload) ? nonEmptyString(payload['updateId']) : undefined;
  const details = { commandId: (isRecord(tx) ? nonEmptyString(tx['commandId']) : undefined) ?? commandId };
  if (status === 'failed') {
    throw new WalletSubmitError('failed', 'The wallet reported the transaction failed', {
      ...details,
      category: 'ledger-rejected',
    });
  }
  if (status !== 'executed' || updateId === undefined) {
    throw new WalletSubmitError('unknown', 'The wallet answered without an executed transaction.', details);
  }
  return { updateId, ...details };
}

/**
 * A random (version 4) UUID: `crypto.randomUUID`, else built from `crypto.getRandomValues` (`randomUUID` is missing
 * outside secure contexts). Throws when the runtime has neither.
 */
export function newCommandId(crypto: Partial<Crypto> | undefined = (globalThis as { crypto?: Crypto }).crypto): string {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto?.getRandomValues !== 'function') {
    throw new TypeError('No Web Crypto API (crypto.getRandomValues) to generate a command id');
  }
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  );
  // Version 4 in the 13th digit, variant 10xx in the 17th.
  const variant = ((parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20)}`;
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
  return {
    partyId,
    ...(publicKey !== undefined && { publicKey }),
    ...(namespace !== undefined && { namespace }),
    ...(networkId !== undefined && { networkId }),
  };
}

/**
 * Provider errors that are a rate limit although their code is not -32005, one entry per provider (and version) that
 * needs it.
 */
const RATE_LIMIT_QUIRKS: ReadonlyArray<{ readonly code: number; readonly message: RegExp }> = [
  // @fivenorth/loop-sdk 0.16.0: the session check it runs before every `ledgerApi` call throws "Session verification
  // failed with status 429.", which its CIP-0103 adapter answers as -32603.
  { code: CIP103_ERROR_CODES.internalError, message: /\bstatus 429\b/ },
];

/** Whether a provider error is a rate limit: -32005, or a quirk in {@link RATE_LIMIT_QUIRKS}. */
function isRateLimited(error: unknown): boolean {
  const code = cip103ErrorCode(error);
  if (code === CIP103_ERROR_CODES.limitExceeded) return true;
  return RATE_LIMIT_QUIRKS.some((quirk) => quirk.code === code && quirk.message.test(errorMessage(error)));
}

/**
 * Canton's refusal of an unpaged list longer than the participant's `http-list-max-elements-limit` (HTTP 413,
 * `JsonApiErrors.MaximumNumberOfElements`): its error id, or its cause "The number of matching elements (201) is
 * greater than the node limit (200)."
 */
const LIST_LIMIT_ERROR = /JSON_API_MAXIMUM_LIST_ELEMENTS_NUMBER_REACHED|is greater than the node limit \(\d+\)/;

/** Whether a provider error carries Canton's list-limit refusal, in its message or its `data`. */
function hitListLimit(error: unknown): boolean {
  if (LIST_LIMIT_ERROR.test(errorMessage(error))) return true;
  const data = isRecord(error) ? error['data'] : undefined;
  if (data === undefined) return false;
  try {
    return LIST_LIMIT_ERROR.test(typeof data === 'string' ? data : JSON.stringify(data));
  } catch {
    return false;
  }
}

/**
 * Waits before each retry of a read the wallet rate-limited: 0.5 s, 1 s, 2 s, 4 s, so at most five attempts over about
 * 7.5 s. Each wait is jittered to between half and all of its value, so parallel readers spread out.
 */
const DEFAULT_READ_RETRY_DELAYS_MS: readonly number[] = [500, 1000, 2000, 4000];

/** How reads back off when the wallet rate-limits them. A test hook; never applied to submissions. */
export interface WalletReadRetryOptions {
  /** The wait before each retry, in milliseconds; defaults to 0.5 s, 1 s, 2 s, 4 s. Empty: no retry. */
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

/** What the token actions need from a wallet: one party's contracts, and a submit that waits for the commit. */
export interface Cip103Wallet {
  /**
   * Active contracts of `partyId` of the templates (package-name `#pkg:Module:Entity` ids), as one snapshot at the
   * ledger end: one ledger-end call and one ACS call whose cumulative filter carries every template.
   */
  readActiveContracts(templateIds: readonly string[]): Promise<AcsSnapshot>;
  /** Sign and submit as `partyId`; resolves once committed, else throws `WalletSubmitError`. Never retries. */
  submit(submission: WalletSubmission): Promise<SubmitResult>;
}

export interface Cip103WalletOptions {
  readonly readRetry?: WalletReadRetryOptions;
}

/** A Ledger JSON API v2 `CumulativeFilter` for one template. */
function cumulativeFilter(templateId: string): Record<string, unknown> {
  return { identifierFilter: { TemplateFilter: { value: { templateId, includeCreatedEventBlob: false } } } };
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

  /** A read through `ledgerApi`, retried with back-off while the wallet rate-limits it. */
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
          params: { requestMethod, resource, ...(body !== undefined && { body }) },
        });
      } catch (error) {
        if (hitListLimit(error)) {
          throw new WalletReadError(
            `The wallet party has more matching contracts than the participant returns in one list (its http-list-max-elements-limit, 200 by default), so the wallet cannot be read: ${describeError(error)}`,
            cip103ErrorCode(error)
          );
        }
        if (!isRateLimited(error)) {
          throw new WalletReadError(`The wallet's ${call} failed: ${describeError(error)}`, cip103ErrorCode(error));
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

  async function readActiveContracts(templateIds: readonly string[]): Promise<AcsSnapshot> {
    if (templateIds.length === 0) throw new TypeError('readActiveContracts needs at least one filter');
    const end = await ledgerApi('get', '/v2/state/ledger-end');
    const offset = isRecord(end) ? end['offset'] : undefined;
    if (typeof offset !== 'number' || !Number.isSafeInteger(offset)) {
      throw new WalletReadError('The wallet returned no ledger end offset');
    }
    const entries = await ledgerApi('post', '/v2/state/active-contracts', {
      activeAtOffset: offset,
      eventFormat: {
        verbose: false,
        filtersByParty: { [partyId]: { cumulative: templateIds.map(cumulativeFilter) } },
      },
    });
    if (!Array.isArray(entries)) {
      throw new WalletReadError('The wallet returned active contracts that are not a list');
    }
    return { offset, contracts: parseActiveContractEntries(entries) };
  }

  return {
    readActiveContracts,

    async submit(submission) {
      const commandId = newCommandId();
      const disclosed = submission.disclosedContracts ?? [];
      let raw: unknown;
      try {
        raw = await provider.request({
          method: 'prepareExecuteAndWait',
          params: {
            commandId,
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
