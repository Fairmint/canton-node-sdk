/**
 * The compact wallet proof message (`wallet-proof-v1`): one line of JSON a wallet signs to prove it controls a party
 * for one purpose, one account and one request. The same shape as apiv2's CNTN tokenization wallet proof, so a page
 * signs one format whichever Fairmint server checks it:
 *
 * ```json
 * {
 *   "domain": "fairmint:tokenization-wallet-proof:v1",
 *   "network": "devnet",
 *   "partyId": "hint::1220…",
 *   "investorContext": "…",
 *   "idempotencyKey": "…",
 *   "issuedAt": "2026-11-24T10:00:00.000Z",
 *   "expiresAt": "2026-11-24T10:05:00.000Z"
 * }
 * ```
 *
 * The keys are always in that order and the text is exactly `JSON.stringify` of them, so one set of fields has one
 * message: {@link parseWalletProofMessage} refuses any other spelling (whitespace, key order, escapes). The server
 * checks it with `verifyWalletProof` (Node only, exported from the package root). Browser-safe: no Node or DOM
 * globals.
 *
 * As with the text ownership message, `network` is a label, not proof: a party id is derived from its key and is the
 * same on every network.
 */
import { isDaNetwork } from './cip103';
import type { DaNetwork } from './da-utilities/client';
import { isRecord } from './json';
import { isWalletOwnershipPartyId } from './ownership-fields';
import { SIGN_MESSAGE_MAX_BYTES } from './sign-message';

/** The challenge format that carries a server-built wallet proof message (`createWalletOwnershipChallenger`). */
export const WALLET_PROOF_FORMAT = 'wallet-proof-v1';
export type WalletProofFormat = typeof WALLET_PROOF_FORMAT;

/** The longest message accepted, in characters. */
export const WALLET_PROOF_MAX_MESSAGE_LENGTH = 4096;

/**
 * The longest message accepted, in UTF-8 bytes: the provider's signing limit ({@link SIGN_MESSAGE_MAX_BYTES}). A
 * multibyte message can pass the character limit and still be too long to sign.
 */
export const WALLET_PROOF_MAX_MESSAGE_BYTES = SIGN_MESSAGE_MAX_BYTES;

/** Whether `text` is within both limits: {@link WALLET_PROOF_MAX_MESSAGE_LENGTH} characters, then UTF-8 bytes. */
function withinMessageLimits(text: string): boolean {
  return (
    text.length <= WALLET_PROOF_MAX_MESSAGE_LENGTH &&
    new TextEncoder().encode(text).length <= WALLET_PROOF_MAX_MESSAGE_BYTES
  );
}

/** Every field of a wallet proof message, in message order. */
export interface WalletProofFields {
  /** What the proof is for: a purpose tag such as `fairmint:tokenization-wallet-proof:v1` (printable, no spaces). */
  readonly domain: string;
  /** The DA network the proof names; a label, not proof the party is on it. */
  readonly network: DaNetwork;
  /** The Canton party (`hint::namespace`) the wallet proves it controls. */
  readonly partyId: string;
  /** Who the proof is for on the server's side (an investor account, a signed-in user). Non-empty. */
  readonly investorContext: string;
  /** The request the proof is for (a server-issued nonce or the request's idempotency key). Non-empty. */
  readonly idempotencyKey: string;
  /** ISO-8601 with an offset (`Z` or `±HH:MM`), as `Date.toISOString()` gives. */
  readonly issuedAt: string;
  readonly expiresAt: string;
}

/** A challenger's answer in the `wallet-proof-v1` format: the exact message to sign, its fields, and the token. */
export interface WalletProofChallengeResponse {
  readonly format: WalletProofFormat;
  /** The exact text the wallet signs (`buildWalletProofMessage(fields)`). */
  readonly message: string;
  /** The message's fields, for display; the browser checks they are the message's. */
  readonly fields: WalletProofFields;
  /** Opaque to the browser: the server's MACed record of the challenge. */
  readonly token: string;
}

/** The message's keys, in order. */
const KEYS = ['domain', 'network', 'partyId', 'investorContext', 'idempotencyKey', 'issuedAt', 'expiresAt'] as const;

/** Printable ASCII without spaces. */
const TOKEN_PATTERN = /^[!-~]+$/;
/** ISO-8601 date and time with an offset; seconds and fractions optional (zod's `iso.datetime({ offset: true })`). */
const ISO_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

/** Whether `value` is an ISO-8601 timestamp with an offset naming a real calendar day. */
function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = ISO_PATTERN.exec(value);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1) return false;
  // Day 0 of the next month is this month's last day.
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return false;
  return Number.isFinite(Date.parse(value));
}

/** The reason the fields are not a valid message, or null. */
function fieldProblem(fields: WalletProofFields): string | null {
  if (typeof fields.domain !== 'string' || fields.domain.length > 256 || !TOKEN_PATTERN.test(fields.domain)) {
    return 'domain must be 1-256 printable characters without spaces';
  }
  if (!isDaNetwork(fields.network)) return 'network must be devnet or mainnet';
  if (!isWalletOwnershipPartyId(fields.partyId)) return 'partyId must be a Canton party id (hint::namespace)';
  for (const key of ['investorContext', 'idempotencyKey'] as const) {
    if (typeof fields[key] !== 'string' || fields[key].length === 0) return `${key} must be a non-empty string`;
  }
  for (const key of ['issuedAt', 'expiresAt'] as const) {
    if (!isIsoTimestamp(fields[key])) return `${key} must be an ISO-8601 time with an offset`;
  }
  if (Date.parse(fields.expiresAt) <= Date.parse(fields.issuedAt)) return 'expiresAt must be after issuedAt';
  return null;
}

/** `JSON.stringify` of the fields in message order; the fields are already valid. */
function serialize(fields: WalletProofFields): string {
  const ordered: Record<string, string> = {};
  for (const key of KEYS) ordered[key] = fields[key];
  return JSON.stringify(ordered);
}

/**
 * The exact message for these fields: one line of JSON, keys in the order of {@link WalletProofFields}. Throws
 * `TypeError` for a field that is not valid or a message longer than {@link WALLET_PROOF_MAX_MESSAGE_LENGTH} characters
 * or {@link WALLET_PROOF_MAX_MESSAGE_BYTES} UTF-8 bytes.
 */
export function buildWalletProofMessage(fields: WalletProofFields): string {
  const problem = fieldProblem(fields);
  if (problem !== null) throw new TypeError(`Invalid wallet proof message: ${problem}`);
  const message = serialize(fields);
  if (!withinMessageLimits(message)) {
    throw new TypeError(
      `Invalid wallet proof message: longer than ${WALLET_PROOF_MAX_MESSAGE_LENGTH} characters or ${WALLET_PROOF_MAX_MESSAGE_BYTES} UTF-8 bytes`
    );
  }
  return message;
}

/**
 * The fields of a wallet proof message, or null for any text that is not exactly what {@link buildWalletProofMessage}
 * gives for its fields: not JSON, another key set or order, a value of another type, a timestamp that is not ISO-8601
 * with an offset, `expiresAt` not after `issuedAt`, or any other spelling of the same JSON.
 */
export function parseWalletProofMessage(text: string): WalletProofFields | null {
  if (typeof text !== 'string' || !withinMessageLimits(text)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length !== KEYS.length || !KEYS.every((key, index) => keys[index] === key)) return null;
  if (!KEYS.every((key) => typeof raw[key] === 'string')) return null;
  const fields = raw as unknown as WalletProofFields;
  if (fieldProblem(fields) !== null) return null;
  // Exactly one spelling: no whitespace, escapes or duplicate keys beyond what JSON.stringify writes.
  return serialize(fields) === text ? { ...fields } : null;
}
