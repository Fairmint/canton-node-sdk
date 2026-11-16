/** Errors the wallets module throws. Each carries enough to decide whether a retry is safe. */

/**
 * - `rejected-by-user`: the user declined in the wallet; nothing was submitted.
 * - `failed`: nothing was committed (the ledger rejected it, or the wallet refused the request before taking it on).
 * - `unknown`: the outcome is not known. Do not resubmit blindly: check the wallet or ledger first.
 */
export type WalletSubmitOutcome = 'rejected-by-user' | 'failed' | 'unknown';

const UNKNOWN_HINT = 'The outcome is unknown: do not resubmit blindly; check the wallet for the result first.';

/** A submission did not commit, or its outcome is unknown. The SDK never retries. */
export class WalletSubmitError extends Error {
  readonly outcome: WalletSubmitOutcome;
  /** The wallet's CIP-0103 error code, when it gave one. */
  readonly code?: number;
  readonly commandId?: string;
  /**
   * The reference of the burn request this submission filed (`requestBurn`), also when the SDK generated it: after an
   * `unknown` outcome, look the burn request up by it before filing another.
   */
  readonly burnReference?: string;

  constructor(
    outcome: WalletSubmitOutcome,
    message: string,
    details: { code?: number; commandId?: string; burnReference?: string } = {}
  ) {
    super(outcome === 'unknown' && !message.includes(UNKNOWN_HINT) ? `${message} ${UNKNOWN_HINT}` : message);
    this.name = 'WalletSubmitError';
    this.outcome = outcome;
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
    this.reason = reason;
    if (code !== undefined) this.code = code;
  }
}

/** A registry API answered with a non-2xx status. `body` is the raw response text. */
export class RegistryApiError extends Error {
  readonly status: number;
  readonly body: string;
  readonly url: string;

  constructor(status: number, body: string, url: string) {
    super(`Registry API ${status} for ${url}: ${body.slice(0, 500)}`);
    this.name = 'RegistryApiError';
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

/** A registry API answered 2xx with a body this module refuses (wrong shape, unexpected factory). */
export class RegistryResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistryResponseError';
  }
}

export type TokenWalletErrorCode =
  | 'invalid-input'
  | 'not-found'
  | 'not-addressed-to-wallet'
  | 'unexpected-registrar'
  | 'insufficient-balance'
  /** The inputs that would cover the amount add up beyond the Daml `Numeric 10` range (10^28 - 10^-10). */
  | 'amount-out-of-range'
  | 'preapproval-required'
  /** The registry would now run the transfer as another kind than the caller previewed (`expectedKind`). */
  | 'kind-changed'
  /** Another write action of the same token wallet is still in progress. */
  | 'busy'
  /**
   * The wallet's registry does not offer this action (DA's mint, burn and preapproval actions need DA's Utility
   * Registry client).
   */
  | 'unsupported-by-registry';

/** A token action refused before anything was submitted. */
export class TokenWalletError extends Error {
  readonly code: TokenWalletErrorCode;

  constructor(code: TokenWalletErrorCode, message: string) {
    super(message);
    this.name = 'TokenWalletError';
    this.code = code;
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
   * - `refused`: the SDK refused the action before submitting anything (`TokenWalletError`; its code is in `code`).
   * - `rate-limited`: the wallet kept rate-limiting a read after the SDK backed off; offer a retry after a moment.
   * - `read-failed`: any other failed read.
   * - `sign-failed`: the wallet did not sign (an invalid challenge, or a wallet failure).
   * - `registry`: the registry API answered with an error status or a body the SDK refuses.
   * - `other`: anything else.
   */
  readonly kind:
    | 'declined'
    | 'not-committed'
    | 'outcome-unknown'
    | 'refused'
    | 'rate-limited'
    | 'read-failed'
    | 'sign-failed'
    | 'registry'
    | 'other';
  /**
   * The `TokenWalletError` code of a `refused` error, the wallet's CIP-0103 code of a wallet error when it gave one, or
   * the HTTP status of a registry API error.
   */
  readonly code?: TokenWalletErrorCode | number;
}

/** How many characters of a registry error body {@link describeWalletError} shows. */
const REGISTRY_BODY_CHARS = 300;

function described(
  kind: WalletErrorDescription['kind'],
  message: string,
  code?: TokenWalletErrorCode | number
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

/** A user-facing sentence and a kind for any error the wallets module throws (or anything else thrown). */
export function describeWalletError(error: unknown): WalletErrorDescription {
  if (error instanceof WalletSubmitError) {
    switch (error.outcome) {
      case 'rejected-by-user':
        return described('declined', 'You declined in the wallet. Nothing was submitted.', error.code);
      case 'failed':
        return described('not-committed', `Not committed: ${error.message}`, error.code);
      case 'unknown':
        // The message already says not to resubmit blindly.
        return described('outcome-unknown', error.message, error.code);
    }
  }
  if (error instanceof WalletReadError) {
    return error.rateLimited
      ? described(
          'rate-limited',
          `The wallet is limiting how often this page reads the ledger (CIP-0103 -32005), and it still refused after a few retries. Wait a moment, then retry. Details: ${error.message}`,
          error.code
        )
      : described('read-failed', `The wallet did not answer a read: ${error.message}`, error.code);
  }
  if (error instanceof WalletSignError) {
    return error.reason === 'rejected-by-user'
      ? described('declined', 'You declined to sign in the wallet. Nothing was verified.', error.code)
      : described('sign-failed', `The wallet did not sign: ${error.message}`, error.code);
  }
  if (error instanceof RegistryApiError) {
    return described(
      'registry',
      `DA's registry answered ${error.status}: ${error.body.slice(0, REGISTRY_BODY_CHARS)}`,
      error.status
    );
  }
  if (error instanceof RegistryResponseError) return described('registry', error.message);
  if (error instanceof TokenWalletError) return described('refused', error.message, error.code);
  if (error instanceof Error) return described('other', error.message);
  return described('other', thrownText(error));
}
