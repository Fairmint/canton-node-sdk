/**
 * CIP-0103 `signMessage` helpers: what text a wallet will sign, and reading its answer. The wallet signs the message's
 * UTF-8 bytes with the party's key, so a page checks the text before it asks.
 */
import { isRecord, nonEmptyString } from './json';

/** The fewest UTF-8 bytes a message may have: the bound Privy's CIP-0103 provider (canton-privy-sdk) enforces. */
export const SIGN_MESSAGE_MIN_BYTES = 64;
/** The most UTF-8 bytes a message may have: the bound Privy's CIP-0103 provider (canton-privy-sdk) enforces. */
export const SIGN_MESSAGE_MAX_BYTES = 8192;

/** C0 controls other than tab and newline (carriage return included), DEL and C1 controls. */
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/u;
/** A UTF-16 surrogate not part of a pair (a `u` regex matches a pair as one code point). */
const LONE_SURROGATE = /\p{Cs}/u;

/**
 * Why {@link validateSignMessage} refuses a message:
 *
 * - `too-short` / `too-long`: its UTF-8 length (`bytes`) is outside the bounds;
 * - `control-characters`: it has a control character other than tab and newline (a carriage return included);
 * - `malformed`: it is not well-formed text (a lone UTF-16 surrogate).
 */
export interface SignMessageProblem {
  readonly code: 'too-short' | 'too-long' | 'control-characters' | 'malformed';
  /** The message's length in UTF-8 bytes. */
  readonly bytes: number;
}

/** Bounds for {@link validateSignMessage}; each defaults to the exported constant. */
export interface ValidateSignMessageOptions {
  readonly minBytes?: number;
  readonly maxBytes?: number;
}

/**
 * Null when wallets will sign `message`, else why not: well-formed text of {@link SIGN_MESSAGE_MIN_BYTES} to
 * {@link SIGN_MESSAGE_MAX_BYTES} UTF-8 bytes (not characters) without control characters (tabs and newlines are fine).
 * The bounds are Privy's provider's, the strictest this SDK knows; a wallet may accept more.
 */
export function validateSignMessage(
  message: string,
  options: ValidateSignMessageOptions = {}
): SignMessageProblem | null {
  const bytes = new TextEncoder().encode(message).length;
  if (LONE_SURROGATE.test(message)) return { code: 'malformed', bytes };
  if (bytes < (options.minBytes ?? SIGN_MESSAGE_MIN_BYTES)) return { code: 'too-short', bytes };
  if (bytes > (options.maxBytes ?? SIGN_MESSAGE_MAX_BYTES)) return { code: 'too-long', bytes };
  if (CONTROL_CHARACTERS.test(message)) return { code: 'control-characters', bytes };
  return null;
}

/**
 * The signature in a CIP-0103 `signMessage` answer: the `signature` field of `{ signature }`, the spec's shape (the one
 * `proveWalletOwnership` accepts). Undefined for any other answer (a bare string included) or an empty signature.
 */
export function readSignature(answer: unknown): string | undefined {
  return isRecord(answer) ? nonEmptyString(answer['signature']) : undefined;
}
