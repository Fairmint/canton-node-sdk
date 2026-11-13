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

  constructor(outcome: WalletSubmitOutcome, message: string, details: { code?: number; commandId?: string } = {}) {
    super(outcome === 'unknown' && !message.includes(UNKNOWN_HINT) ? `${message} ${UNKNOWN_HINT}` : message);
    this.name = 'WalletSubmitError';
    this.outcome = outcome;
    if (details.code !== undefined) this.code = details.code;
    if (details.commandId !== undefined) this.commandId = details.commandId;
  }
}

/** The wallet could not read the ledger or its account, or answered in a shape this module does not understand. */
export class WalletReadError extends Error {
  /** The wallet's CIP-0103 error code, when it gave one (4100: not connected; 4200: method not supported). */
  readonly code?: number;

  constructor(message: string, code?: number) {
    super(message);
    this.name = 'WalletReadError';
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
  | 'busy';

/** A token action refused before anything was submitted. */
export class TokenWalletError extends Error {
  readonly code: TokenWalletErrorCode;

  constructor(code: TokenWalletErrorCode, message: string) {
    super(message);
    this.name = 'TokenWalletError';
    this.code = code;
  }
}
