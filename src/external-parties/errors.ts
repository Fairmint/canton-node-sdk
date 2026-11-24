/**
 * The external-party module's one error type. Browser-safe: no Node or SDK dependency, and matched by a brand rather
 * than `instanceof`, so it is recognised across copies of this module.
 */

/**
 * Why an external-party call failed:
 *
 * - `INVALID_INPUT`: a key, fingerprint, hint, option or argument the caller passed is not valid.
 * - `INVALID_RESPONSE`: the participant (or a `listParties` / `findParty` callback) answered something unreadable.
 * - `ABORTED`: the caller's `signal` aborted the call.
 * - `LIST_FAILED`: reading the participant's party list failed; `cause` is the ledger client's error.
 * - `LOOKUP_FAILED`: an exact party lookup failed; `cause` is the ledger client's error.
 */
export type ExternalPartyErrorCode = 'INVALID_INPUT' | 'INVALID_RESPONSE' | 'ABORTED' | 'LIST_FAILED' | 'LOOKUP_FAILED';

const BRAND = Symbol.for('@fairmint/canton-node-sdk/ExternalPartyError');

export class ExternalPartyError extends Error {
  public override readonly name = 'ExternalPartyError';
  public readonly code: ExternalPartyErrorCode;
  /** For `LOOKUP_FAILED`, and `ABORTED` or `INVALID_RESPONSE` of a lookup: the party ID that was looked up. */
  public readonly partyId: string | undefined;

  constructor(
    code: ExternalPartyErrorCode,
    message: string,
    options: { readonly cause?: unknown; readonly partyId?: string } = {}
  ) {
    super(message);
    this.code = code;
    this.partyId = options.partyId;
    if ('cause' in options) {
      Object.defineProperty(this, 'cause', { value: options.cause, enumerable: false, writable: true });
    }
    Object.defineProperty(this, BRAND, { value: true });
  }
}

/** Whether `error` is an {@link ExternalPartyError} (of any copy of this module), optionally with one of `codes`. */
export function isExternalPartyError(
  error: unknown,
  ...codes: readonly ExternalPartyErrorCode[]
): error is ExternalPartyError {
  if (typeof error !== 'object' || error === null || (error as Record<symbol, unknown>)[BRAND] !== true) return false;
  return codes.length === 0 || codes.includes((error as ExternalPartyError).code);
}

export function invalidInput(message: string): ExternalPartyError {
  return new ExternalPartyError('INVALID_INPUT', message);
}
