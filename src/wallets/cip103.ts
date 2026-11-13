/**
 * The SDK's CIP-0103 (Canton dApp API) client: the only way this module talks to a wallet. Any CIP-0103 provider plugs
 * in (Loop's `loop.getCip103Provider()`, a `@canton-network/dapp-sdk` provider, `window.canton`, Send Connect, …). The
 * provider type is structural, so no wallet SDK is imported.
 *
 * - Party: the `partyId` the dApp gives, else the wallet's primary account (`getPrimaryAccount`).
 * - Submit: `prepareExecuteAndWait` acting as that party only; resolves with `tx.payload.updateId`.
 * - Read: `ledgerApi` to the Ledger JSON API v2: `/v2/state/ledger-end`, then the pages of
 *   `/v2/state/active-contracts-page` at that one offset, filtered to that party only (see {@link ACS_PAGE_SIZE}). It is
 *   sent as POST, as the Ledger JSON API 3.6 OpenAPI, Loop's `ledgerApi` allowlist and
 *   `@canton-network/core-acs-reader` do. If the first page fails for any reason other than a refused, unauthorized or
 *   disconnected wallet (for example a wallet without the paged endpoint, or a Canton 3.5 participant that serves it
 *   only as GET), the snapshot is read once through the unpaged `/v2/state/active-contracts` instead, which is subject
 *   to the participant's `http-list-max-elements-limit`.
 *
 * Spec: CIP-0103 and the dApp API OpenRPC (`openrpc-dapp-api.json` 0.5.0).
 */
import { parseActiveContractEntries } from './acs';
import { WalletReadError, WalletSubmitError } from './errors';
import { isRecord, nonEmptyString } from './json';
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

/** The dApp API requests this SDK makes, each in CIP-0103's `{ method, params }` form. */
export type Cip103Request =
  | { method: 'getPrimaryAccount' }
  | { method: 'ledgerApi'; params: Cip103LedgerApiParams }
  | { method: 'prepareExecuteAndWait'; params: Cip103PrepareExecuteParams };

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
function describeError(error: unknown): string {
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
 * The wallet party: the primary account's `partyId` (`getPrimaryAccount`). The dApp runs its wallet's own connect flow
 * first; a provider that is not connected answers 4100.
 */
export async function primaryPartyId(provider: Cip103Provider): Promise<string> {
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
  if (partyId === undefined) {
    throw new WalletReadError('The wallet returned a primary account without partyId');
  }
  return partyId;
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
 * Codes after which the first paged ACS call does not fall back to the unpaged endpoint: the user refused, or the
 * wallet is not connected or not authorized, so a second read would fail the same way. Any other failure of the first
 * page (no paged endpoint in the wallet's allowlist, or a participant that serves it only as GET-with-body, as Canton
 * 3.5 does) falls back once to the unpaged `/v2/state/active-contracts`. Reads are side-effect free, so the retry is
 * safe.
 */
const NO_ACS_FALLBACK_CODES: ReadonlySet<number> = new Set([
  CIP103_ERROR_CODES.userRejected,
  CIP103_ERROR_CODES.unauthorized,
  CIP103_ERROR_CODES.disconnected,
  CIP103_ERROR_CODES.chainDisconnected,
]);

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

/** What the token actions need from a wallet: one party, its contracts, and a submit that waits for the commit. */
export interface Cip103Wallet {
  readonly partyId: string;
  /** Active contracts of `partyId` matching the filter, as one snapshot at the ledger end. */
  listActiveContracts(filter: ContractFilter): Promise<ActiveContract[]>;
  /** Sign and submit as `partyId`; resolves once committed, else throws `WalletSubmitError`. Never retries. */
  submit(submission: WalletSubmission): Promise<SubmitResult>;
}

/** The SDK's CIP-0103 client acting as `partyId` through `provider`. */
export function cip103Wallet(provider: Cip103Provider, partyId: string): Cip103Wallet {
  async function ledgerApi(
    requestMethod: 'get' | 'post',
    resource: string,
    body?: Record<string, unknown>
  ): Promise<unknown> {
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
      throw new WalletReadError(
        `The wallet's ledgerApi ${requestMethod.toUpperCase()} ${resource} failed: ${describeError(error)}`,
        cip103ErrorCode(error)
      );
    }
  }

  return {
    partyId,

    async listActiveContracts(filter) {
      const end = await ledgerApi('get', '/v2/state/ledger-end');
      const offset = isRecord(end) ? end['offset'] : undefined;
      if (typeof offset !== 'number' || !Number.isSafeInteger(offset)) {
        throw new WalletReadError('The wallet returned no ledger end offset');
      }
      const identifierFilter =
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
            };
      const eventFormat = {
        verbose: false,
        filtersByParty: {
          [partyId]: { cumulative: [{ identifierFilter }] },
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
          // The first page failed for a reason other than the connection: read the unpaged snapshot once instead.
          if (
            page === 0 &&
            error instanceof WalletReadError &&
            (error.code === undefined || !NO_ACS_FALLBACK_CODES.has(error.code))
          ) {
            const all = await ledgerApi('post', '/v2/state/active-contracts', {
              verbose: false,
              activeAtOffset: offset,
              eventFormat,
            });
            if (!Array.isArray(all)) {
              throw new WalletReadError('The wallet returned active contracts that are not a list');
            }
            return parseActiveContractEntries(all);
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
      return parseActiveContractEntries(entries);
    },

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
