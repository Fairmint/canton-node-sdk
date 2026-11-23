/**
 * Errors the wallets module throws. Each carries enough to decide whether a retry is safe.
 *
 * Match them with the guards (`isWalletError`, `isWalletSubmitError`, …), not `instanceof`: a page can load two copies
 * of this module (two bundles, or two versions of the SDK), and an error thrown by one copy is not an `instanceof` the
 * other copy's class. Every error class here carries a brand under a global symbol, which the guards check.
 */
import { isAbortError } from '../core/http/abort';
import { isCancelledBeforeSubmit } from './abort';
import type { DaNetwork } from './da-utilities/client';

/** The brand every wallets error carries: a non-enumerable property under a global (`Symbol.for`) symbol. */
const WALLET_ERROR_BRAND: symbol = Symbol.for('@fairmint/canton-node-sdk/wallets.error');

type WalletErrorClassName =
  | 'WalletError'
  | 'WalletSubmitError'
  | 'WalletReadError'
  | 'WalletSignError'
  | 'RegistryApiError'
  | 'RegistryResponseError'
  | 'WalletOptionError';

function brand(error: Error, name: WalletErrorClassName): void {
  Object.defineProperty(error, WALLET_ERROR_BRAND, { value: name, enumerable: false });
}

/** Whether `error` carries the brand `name`; never throws (a hostile proxy or getter answers false). */
function branded(error: unknown, name: WalletErrorClassName): boolean {
  if (typeof error !== 'object' || error === null) return false;
  try {
    return (error as Record<symbol, unknown>)[WALLET_ERROR_BRAND] === name;
  } catch {
    return false;
  }
}

/**
 * - `rejected-by-user`: the user declined in the wallet; nothing was submitted.
 * - `failed`: nothing was committed (the ledger rejected it, or the wallet refused the request before taking it on).
 * - `unknown`: the outcome is not known. Do not resubmit blindly: check the wallet or ledger first.
 */
export type WalletSubmitOutcome = 'rejected-by-user' | 'failed' | 'unknown';

const UNKNOWN_HINT = 'The outcome is unknown: do not resubmit blindly; check the wallet for the result first.';

/** An `unknown` outcome's message: it warns against resubmitting and names the command id to look up, once each. */
function unknownMessage(message: string, commandId: string | undefined): string {
  const hinted = message.includes(UNKNOWN_HINT) ? message : `${message} ${UNKNOWN_HINT}`;
  const commandLine = commandId === undefined ? '' : `Command id: ${commandId}.`;
  return commandLine === '' || hinted.includes(commandLine) ? hinted : `${hinted} ${commandLine}`;
}

/**
 * Why a submission did not commit (or may not have), as far as the wallet's answer tells: a bounded category to log,
 * count or branch on. It never changes `outcome`, which alone says whether a retry is safe.
 *
 * - `user-rejected`: the user declined in the wallet (CIP-0103 4001).
 * - `wallet-refused`: the wallet refused the request before taking it on (4200, -32700, -32600, -32601, -32602, -32000,
 *   -32004).
 * - `session`: the wallet was not, or no longer, connected or authorized (4100, 4900, 4901).
 * - `rate-limited`: the wallet rate-limited the submission (-32005).
 * - `ledger-rejected`: the ledger rejected the transaction (-32003, or a `failed` status) and named no Canton error.
 * - From the Canton error the wallet passed on (its category, see `cantonErrorId`):
 *
 *   - `contention`: a contract it uses was locked or changed by another transaction meanwhile (category 2).
 *   - `not-found`: a contract, party or package it names does not exist or was archived (category 11).
 *   - `duplicate`: it was already submitted, or what it creates already exists (category 10).
 *   - `invalid`: malformed, whatever the ledger state (category 8, 5).
 *   - `precondition`: refused in the current ledger state: a Daml assertion, an unvetted package, … (category 9, 12).
 *   - `permission`: the participant refused the wallet's credentials or rights (category 6, 7).
 *   - `timeout`: a deadline passed before the outcome was known (category 3).
 *   - `unavailable`: the participant or synchronizer was unavailable, or the wallet answered -32002 (category 1, 13).
 *   - `internal`: an internal error of the wallet or participant (-32603, category 4, 14).
 * - `unknown`: the answer gives nothing to go by.
 */
export type WalletSubmitCategory =
  | 'user-rejected'
  | 'wallet-refused'
  | 'session'
  | 'rate-limited'
  | 'ledger-rejected'
  | 'contention'
  | 'not-found'
  | 'duplicate'
  | 'invalid'
  | 'precondition'
  | 'permission'
  | 'timeout'
  | 'unavailable'
  | 'internal'
  | 'unknown';

/** Details of a {@link WalletSubmitError} beside its outcome and message. */
export interface WalletSubmitErrorDetails {
  readonly code?: number;
  readonly commandId?: string;
  readonly burnReference?: string;
  readonly category?: WalletSubmitCategory;
  readonly cantonErrorId?: string;
}

/** A submission did not commit, or its outcome is unknown. The SDK never retries. */
export class WalletSubmitError extends Error {
  readonly outcome: WalletSubmitOutcome;
  /** The wallet's CIP-0103 error code, when it gave one. */
  readonly code?: number;
  /** Why, as a bounded category (see {@link WalletSubmitCategory}); `unknown` when the answer gives nothing to go by. */
  readonly category: WalletSubmitCategory;
  /**
   * The Canton error id the wallet passed on, when its answer carried one (`LOCAL_VERDICT_LOCKED_CONTRACTS`,
   * `DAML_INTERPRETATION_ERROR`, `CONTRACT_NOT_FOUND`, …): the id to look up in Canton's error code reference.
   */
  readonly cantonErrorId?: string;
  /** The command id the submission was sent with; an `unknown` outcome's message names it. */
  readonly commandId?: string;
  /**
   * The reference of the burn request this submission filed (`requestBurn`), also when the SDK generated it: after an
   * `unknown` outcome, look the burn request up by it before filing another.
   */
  readonly burnReference?: string;

  constructor(outcome: WalletSubmitOutcome, message: string, details: WalletSubmitErrorDetails = {}) {
    super(outcome === 'unknown' ? unknownMessage(message, details.commandId) : message);
    this.name = 'WalletSubmitError';
    brand(this, 'WalletSubmitError');
    this.outcome = outcome;
    this.category = details.category ?? (outcome === 'rejected-by-user' ? 'user-rejected' : 'unknown');
    if (details.cantonErrorId !== undefined) this.cantonErrorId = details.cantonErrorId;
    if (details.code !== undefined) this.code = details.code;
    if (details.commandId !== undefined) this.commandId = details.commandId;
    if (details.burnReference !== undefined) this.burnReference = details.burnReference;
  }
}

/** CIP-0103 -32005 (Limit exceeded): the wallet rate-limited the request. */
const LIMIT_EXCEEDED = -32005;

/** The wallet could not read the ledger or its account, or answered in a shape this module does not understand. */
export class WalletReadError extends Error {
  /** The wallet's CIP-0103 error code, when it gave one (4100: not connected; 4200: method not supported). */
  readonly code?: number;
  /**
   * The wallet rate-limited the read (CIP-0103 -32005) and kept refusing after the SDK backed off. Nothing is wrong
   * with the request: offer the user a retry after a moment.
   */
  readonly rateLimited: boolean;

  constructor(message: string, code?: number) {
    super(message);
    this.name = 'WalletReadError';
    brand(this, 'WalletReadError');
    if (code !== undefined) this.code = code;
    this.rateLimited = code === LIMIT_EXCEEDED;
  }
}

/**
 * - `invalid-challenge`: the challenge is malformed or expired; nothing was sent to the wallet.
 * - `rejected-by-user`: the user declined to sign (CIP-0103 4001).
 * - `failed`: the wallet could not sign, or answered without a signature.
 */
export type WalletSignErrorReason = 'invalid-challenge' | 'rejected-by-user' | 'failed';

/** The wallet did not sign the ownership message. */
export class WalletSignError extends Error {
  readonly reason: WalletSignErrorReason;
  /** The wallet's CIP-0103 error code, when it gave one. */
  readonly code?: number;

  constructor(reason: WalletSignErrorReason, message: string, code?: number) {
    super(message);
    this.name = 'WalletSignError';
    brand(this, 'WalletSignError');
    this.reason = reason;
    if (code !== undefined) this.code = code;
  }
}

/** A registry API answered with a non-2xx status. `body` is the raw response text. */
export class RegistryApiError extends Error {
  readonly status: number;
  readonly body: string;
  readonly url: string;
  /** Which registry answered, as `describeWalletError` names it (`DA's registry`, `The Canton Coin registry`). */
  readonly registry: string;

  constructor(status: number, body: string, url: string, registry = "DA's registry") {
    super(`Registry API ${status} for ${url}: ${body.slice(0, 500)}`);
    this.name = 'RegistryApiError';
    brand(this, 'RegistryApiError');
    this.status = status;
    this.body = body;
    this.url = url;
    this.registry = registry;
  }
}

/** A registry API answered 2xx with a body this module refuses (wrong shape, unexpected factory). */
export class RegistryResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistryResponseError';
    brand(this, 'RegistryResponseError');
  }
}

export type WalletErrorCode =
  | 'invalid-input'
  | 'not-found'
  | 'insufficient-balance'
  /** The inputs that would cover the amount add up beyond the Daml `Numeric 10` range (10^28 - 10^-10). */
  | 'amount-out-of-range'
  | 'preapproval-required'
  /** The registry would now run the transfer as another kind than it was planned as. */
  | 'kind-changed'
  /** Another write action of the same token wallet is still in progress. */
  | 'busy'
  /** What the action would create already exists. */
  | 'already-exists';

/** A token action refused before anything was submitted. */
export class WalletError extends Error {
  readonly code: WalletErrorCode;

  constructor(code: WalletErrorCode, message: string) {
    super(message);
    this.name = 'WalletError';
    brand(this, 'WalletError');
    this.code = code;
  }
}

/** Whether `error` is a {@link WalletError} of any copy of this module (a brand check, not `instanceof`). */
export function isWalletError(error: unknown): error is WalletError {
  return error instanceof WalletError || branded(error, 'WalletError');
}

/** Whether `error` is a {@link WalletSubmitError} of any copy of this module (a brand check, not `instanceof`). */
export function isWalletSubmitError(error: unknown): error is WalletSubmitError {
  return error instanceof WalletSubmitError || branded(error, 'WalletSubmitError');
}

/** Whether `error` is a {@link WalletReadError} of any copy of this module (a brand check, not `instanceof`). */
export function isWalletReadError(error: unknown): error is WalletReadError {
  return error instanceof WalletReadError || branded(error, 'WalletReadError');
}

/** Whether `error` is a {@link WalletSignError} of any copy of this module (a brand check, not `instanceof`). */
export function isWalletSignError(error: unknown): error is WalletSignError {
  return error instanceof WalletSignError || branded(error, 'WalletSignError');
}

/** Whether `error` is a {@link RegistryApiError} of any copy of this module (a brand check, not `instanceof`). */
export function isRegistryApiError(error: unknown): error is RegistryApiError {
  return error instanceof RegistryApiError || branded(error, 'RegistryApiError');
}

/** Whether `error` is a {@link RegistryResponseError} of any copy of this module (a brand check, not `instanceof`). */
export function isRegistryResponseError(error: unknown): error is RegistryResponseError {
  return error instanceof RegistryResponseError || branded(error, 'RegistryResponseError');
}

/**
 * Why a wallet option could not give its provider:
 *
 * - `unsupported-network`: the option does not run on the network asked for;
 * - `reload-required`: the option was set up for another network in this page load (Loop) and needs a reload;
 * - `setup-failed`: the option's own setup failed (`cause` says why); a later `load` tries again.
 */
export type WalletOptionErrorCode = 'unsupported-network' | 'reload-required' | 'setup-failed';

/** Thrown by a wallet option's `load` (see `loopWalletOption`). */
export class WalletOptionError extends Error {
  readonly code: WalletOptionErrorCode;
  /** For `reload-required`: the network the option is set up for in this page load. */
  readonly setUpFor?: DaNetwork;
  /** The network the caller asked for. */
  readonly requested?: DaNetwork;
  /** For `setup-failed`: what the setup threw. */
  readonly cause?: unknown;

  constructor(
    code: WalletOptionErrorCode,
    details: { readonly setUpFor?: DaNetwork; readonly requested?: DaNetwork; readonly cause?: unknown } = {}
  ) {
    super(walletOptionMessage(code, details));
    this.name = 'WalletOptionError';
    brand(this, 'WalletOptionError');
    this.code = code;
    if (details.setUpFor !== undefined) this.setUpFor = details.setUpFor;
    if (details.requested !== undefined) this.requested = details.requested;
    if (details.cause !== undefined) this.cause = details.cause;
  }
}

function walletOptionMessage(
  code: WalletOptionErrorCode,
  details: { readonly setUpFor?: DaNetwork; readonly requested?: DaNetwork; readonly cause?: unknown }
): string {
  switch (code) {
    case 'unsupported-network':
      return `This wallet does not run on ${details.requested ?? 'this network'}.`;
    case 'reload-required':
      return `This wallet is set up for ${details.setUpFor ?? 'another network'} in this page load: reload the page to use ${details.requested ?? 'another network'}.`;
    case 'setup-failed': {
      const { cause } = details;
      const reason = cause instanceof Error ? cause.message : cause === undefined ? 'no detail' : thrownText(cause);
      return `The wallet could not be set up (${reason}). Try again, or reload the page.`;
    }
  }
}

/** Whether `error` is a {@link WalletOptionError} of any copy of this module (a brand check, not `instanceof`). */
export function isWalletOptionError(error: unknown): error is WalletOptionError {
  return error instanceof WalletOptionError || branded(error, 'WalletOptionError');
}

/**
 * Whether `error` is a cancellation: the `AbortError` an aborted `signal` makes a wallets call throw (also a
 * `TimeoutError` from `AbortSignal.timeout`, which `fetch` passes through).
 */
export function isWalletCancellation(error: unknown): boolean {
  if (isAbortError(error)) return true;
  // A `DOMException` from `AbortController` or `fetch`, possibly of another realm, so not matched by `instanceof`.
  if (typeof error !== 'object' || error === null) return false;
  try {
    const { name } = error as { name?: unknown };
    return name === 'AbortError' || name === 'TimeoutError';
  } catch {
    return false;
  }
}

/**
 * Any error the wallets module throws, as a sentence a dApp can show (it says whether anything was submitted) and a
 * `kind` to branch on.
 */
export interface WalletErrorDescription {
  /** A user-facing sentence that says whether anything was submitted. */
  readonly message: string;
  /**
   * - `declined`: the user declined in the wallet (a submission or a signature); nothing was submitted or signed.
   * - `not-committed`: a submission certainly did not commit (`WalletSubmitError` `failed`).
   * - `outcome-unknown`: a submission's outcome is unknown; do not resubmit blindly.
   * - `refused`: the SDK refused the action before submitting anything (`WalletError`; its code is in `code`).
   * - `rate-limited`: the wallet kept rate-limiting a read after the SDK backed off; offer a retry after a moment.
   * - `read-failed`: any other failed read.
   * - `sign-failed`: the wallet did not sign (an invalid challenge, or a wallet failure).
   * - `registry`: the registry API answered with an error status or a body the SDK refuses.
   * - `cancelled`: the call's `signal` aborted it. The message says "Nothing was submitted" only for the cancellation
   *   this module throws before it submits; any other `AbortError` or `TimeoutError` gets a neutral sentence.
   * - `not-verified`: the server did not verify a wallet ownership proof (its verdict; never from `describeWalletError`).
   * - `unauthorized`: a wallet's own error with CIP-0103 code 4100: the wallet did not authorize the request for this
   *   account (for example its key is not one the signed-in user holds).
   * - `other`: anything else.
   *
   * A wallet's own error (a CIP-0103 provider's, thrown by code that called the provider itself) is described by its
   * numeric `code`: 4001 is `declined`, 4100 `unauthorized`, and -32002 (the wallet did not answer in time)
   * `outcome-unknown`, since the wallet may still have acted.
   */
  readonly kind:
    | 'declined'
    | 'unauthorized'
    | 'not-committed'
    | 'outcome-unknown'
    | 'refused'
    | 'rate-limited'
    | 'read-failed'
    | 'sign-failed'
    | 'registry'
    | 'cancelled'
    | 'not-verified'
    | 'other';
  /**
   * The `WalletError` or `WalletOptionError` code of a `refused` error (`setup-failed` is `other`), the wallet's
   * CIP-0103 code of a wallet error when it gave one, or the HTTP status of a registry API error.
   */
  readonly code?: WalletErrorCode | WalletOptionErrorCode | number;
  /** An `outcome-unknown` submission's command id, to look the transaction up before anything is resubmitted. */
  readonly commandId?: string;
  /** An `outcome-unknown` burn request's reference, to look the request up before another is filed. */
  readonly burnReference?: string;
  /** A submission's {@link WalletSubmitCategory} (for `declined`, `not-committed` and `outcome-unknown`). */
  readonly category?: WalletSubmitCategory;
  /** The Canton error id a submission's failure carried, when it carried one. */
  readonly cantonErrorId?: string;
}

/** How many characters of a registry error body {@link describeWalletError} shows. */
const REGISTRY_BODY_CHARS = 300;

function described(
  kind: WalletErrorDescription['kind'],
  message: string,
  code?: WalletErrorCode | WalletOptionErrorCode | number
): WalletErrorDescription {
  return code === undefined ? { message, kind } : { message, kind, code };
}

/** Text for a thrown value that is not an `Error`; never throws (cycles, BigInt, `undefined`). */
function thrownText(error: unknown): string {
  try {
    // Typed as a string, but `undefined` for `undefined`, a function or a symbol.
    const json = JSON.stringify(error) as string | undefined;
    return json ?? String(error);
  } catch {
    return String(error);
  }
}

/** The numeric `code` of a thrown object (a CIP-0103 provider error), if any; never throws (a hostile getter). */
function providerCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  try {
    const { code } = error as { code?: unknown };
    return typeof code === 'number' ? code : undefined;
  } catch {
    return undefined;
  }
}

/** The text of a provider's error: its `message` when it is a string (an `Error`, or a JSON-RPC error object). */
function providerMessage(error: object): string {
  try {
    const { message } = error as { message?: unknown };
    if (typeof message === 'string') return message;
  } catch {
    // A hostile getter: fall through.
  }
  return thrownText(error);
}

/**
 * A user-facing sentence and a kind for any error the wallets module throws, a CIP-0103 provider's own error (4001,
 * 4100 and -32002 by code, see {@link WalletErrorDescription.kind}), or anything else thrown.
 */
export function describeWalletError(error: unknown): WalletErrorDescription {
  if (isWalletSubmitError(error)) {
    const submit = {
      category: error.category,
      ...(error.cantonErrorId !== undefined && { cantonErrorId: error.cantonErrorId }),
    };
    switch (error.outcome) {
      case 'rejected-by-user':
        return {
          ...described('declined', 'You declined in the wallet. Nothing was submitted.', error.code),
          ...submit,
        };
      case 'failed':
        return { ...described('not-committed', `Not committed: ${error.message}`, error.code), ...submit };
      case 'unknown':
        // The message already says not to resubmit blindly, and names the command id.
        return {
          ...described('outcome-unknown', error.message, error.code),
          ...(error.commandId !== undefined && { commandId: error.commandId }),
          ...(error.burnReference !== undefined && { burnReference: error.burnReference }),
          ...submit,
        };
    }
  }
  if (isWalletReadError(error)) {
    return error.rateLimited
      ? described(
          'rate-limited',
          `The wallet is limiting how often this page reads the ledger (CIP-0103 -32005), and it still refused after a few retries. Wait a moment, then retry. Details: ${error.message}`,
          error.code
        )
      : described('read-failed', `The wallet did not answer a read: ${error.message}`, error.code);
  }
  if (isWalletSignError(error)) {
    return error.reason === 'rejected-by-user'
      ? described('declined', 'You declined to sign in the wallet. Nothing was verified.', error.code)
      : described('sign-failed', `The wallet did not sign: ${error.message}`, error.code);
  }
  if (isRegistryApiError(error)) {
    return described(
      'registry',
      `${typeof error.registry === 'string' ? error.registry : "DA's registry"} answered ${error.status}: ${error.body.slice(0, REGISTRY_BODY_CHARS)}`,
      error.status
    );
  }
  if (isRegistryResponseError(error)) return described('registry', error.message);
  if (isWalletError(error)) return described('refused', error.message, error.code);
  if (isWalletOptionError(error)) {
    return described(error.code === 'setup-failed' ? 'other' : 'refused', error.message, error.code);
  }
  if (isCancelledBeforeSubmit(error)) return described('cancelled', 'Cancelled. Nothing was submitted.');
  // A foreign `AbortError` or `TimeoutError` (a wallet's, or `fetch`'s) may have been raised after a submission was sent.
  if (isWalletCancellation(error)) {
    return described('cancelled', 'Cancelled; this does not say whether anything was submitted.');
  }
  const code = providerCode(error);
  if (typeof error === 'object' && error !== null && code !== undefined) {
    switch (code) {
      case 4001:
        return described('declined', 'You declined in the wallet. Nothing was signed or submitted.', 4001);
      case 4100:
        return described(
          'unauthorized',
          `The wallet did not authorize this account (CIP-0103 4100): ${providerMessage(error)}`,
          4100
        );
      case -32002:
        return described(
          'outcome-unknown',
          'The wallet did not answer in time (CIP-0103 -32002), so the outcome is unknown. Do not resubmit: refresh the wallet to see whether it committed.',
          -32002
        );
      default:
        break;
    }
  }
  if (error instanceof Error) return described('other', error.message);
  return described('other', thrownText(error));
}
