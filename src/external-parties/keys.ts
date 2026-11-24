/**
 * Canton external-party identity for an Ed25519 key, browser-safe (Uint8Array and `@noble/hashes`, no `Buffer`, no
 * `node:crypto`):
 *
 * - Fingerprint = `1220` + hex(sha256(int32be(12) || rawKey)): Canton's SHA-256 multihash of the key, hash purpose 12;
 * - Party ID = `hint::fingerprint`;
 * - A party's namespace is what follows its one `::`.
 *
 * The Node helpers of the same names under `utils/external-signing` (`canton-protocol.ts`) hash through this module and
 * throw the SDK's `ValidationError`; these throw {@link ExternalPartyError} (`INVALID_INPUT`).
 */
import { sha256 } from '@noble/hashes/sha2';
import { invalidInput } from './errors';

const ED25519_DER_X509_PREFIX = Uint8Array.of(0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00);
const ED25519_RAW_PUBLIC_KEY_LENGTH = 32;
const ED25519_DER_X509_PUBLIC_KEY_LENGTH = ED25519_DER_X509_PREFIX.length + ED25519_RAW_PUBLIC_KEY_LENGTH;
const CANTON_PUBLIC_KEY_FINGERPRINT_HASH_PURPOSE = 12;
const CANTON_SHA256_MULTIHASH_PREFIX_HEX = '1220';
const CANTON_FINGERPRINT_PATTERN = /^1220[0-9a-f]{64}$/;
/** The longest party ID this module builds: a Daml-LF Party is at most 255 characters (`LedgerPartyIdSchema`). */
export const MAX_EXTERNAL_PARTY_ID_LENGTH = 255;
/** The characters a Daml-LF Party may hold (`LedgerPartyIdSchema`): ASCII letters, digits, space, `:`, `-` and `_`. */
const DAML_PARTY_CHARACTERS = /^[A-Za-z0-9:_ -]+$/;

/**
 * Whether `hint` can start a party ID: non-empty, only Daml-LF Party characters, no `::` and no trailing `:` (which
 * would run into the separator). Not trimmed.
 */
export function isExternalPartyHint(hint: unknown): hint is string {
  return (
    typeof hint === 'string' &&
    hint.length > 0 &&
    DAML_PARTY_CHARACTERS.test(hint) &&
    !hint.includes('::') &&
    !hint.endsWith(':')
  );
}
const ED25519_FIELD_PRIME_LE = hexToBytes('edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f');
const ED25519_SMALL_ORDER_PUBLIC_KEYS_HEX: ReadonlySet<string> = new Set([
  // The eight small-order points (the torsion subgroup), compared with the sign bit cleared: the identity (order 1),
  // y = -1 (order 2), y = 0 (order 4) and the two order-8 y coordinates. Their sign-bit twins match the same entries.
  '0100000000000000000000000000000000000000000000000000000000000000',
  'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  '0000000000000000000000000000000000000000000000000000000000000000',
  'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a',
  '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05',
]);

/**
 * The raw 32-byte Ed25519 key of a raw (32 bytes) or DER X.509 SubjectPublicKeyInfo (44 bytes) key, base64 or
 * base64url. Refuses a non-canonical encoding and the small-order points, as Canton does.
 */
export function decodeEd25519PublicKey(publicKeyBase64: string): Uint8Array {
  const key = decodeBase64(publicKeyBase64);
  let raw: Uint8Array;
  if (key.length === ED25519_RAW_PUBLIC_KEY_LENGTH) {
    raw = key;
  } else if (
    key.length === ED25519_DER_X509_PUBLIC_KEY_LENGTH &&
    ED25519_DER_X509_PREFIX.every((byte, index) => key[index] === byte)
  ) {
    raw = key.slice(ED25519_DER_X509_PREFIX.length);
  } else {
    throw invalidInput(
      `Invalid Ed25519 public key length: ${key.length}; expected raw 32 bytes or DER-wrapped 44 bytes`
    );
  }
  assertCanonicalEd25519PublicKey(raw);
  return raw;
}

/** Canton's DER X.509 SubjectPublicKeyInfo encoding (base64) of a raw or DER Ed25519 public key. */
export function normalizeEd25519PublicKeyForCanton(publicKeyBase64: string): string {
  const raw = decodeEd25519PublicKey(publicKeyBase64);
  const der = new Uint8Array(ED25519_DER_X509_PUBLIC_KEY_LENGTH);
  der.set(ED25519_DER_X509_PREFIX);
  der.set(raw, ED25519_DER_X509_PREFIX.length);
  return bytesToBase64(der);
}

/** The Canton fingerprint of a raw 32-byte Ed25519 key: `1220` + hex(sha256(int32be(12) || rawKey)). */
export function fingerprintRawEd25519PublicKey(rawPublicKey: Uint8Array): string {
  if (rawPublicKey.length !== ED25519_RAW_PUBLIC_KEY_LENGTH) {
    throw invalidInput(`Invalid Ed25519 public key length: ${rawPublicKey.length}; expected raw 32 bytes`);
  }
  const payload = new Uint8Array(4 + ED25519_RAW_PUBLIC_KEY_LENGTH);
  new DataView(payload.buffer).setInt32(0, CANTON_PUBLIC_KEY_FINGERPRINT_HASH_PURPOSE, false);
  payload.set(rawPublicKey, 4);
  return `${CANTON_SHA256_MULTIHASH_PREFIX_HEX}${bytesToHex(sha256(payload))}`;
}

/** The Canton fingerprint (`1220…`, 68 lowercase hex characters) of a raw or DER Ed25519 public key in base64. */
export function deriveCantonEd25519PublicKeyFingerprint(publicKeyBase64: string): string {
  return fingerprintRawEd25519PublicKey(decodeEd25519PublicKey(publicKeyBase64));
}

/** Whether `value` is a Canton SHA-256 multihash fingerprint: `1220` and 64 lowercase hex characters. */
export function isCantonPublicKeyFingerprint(value: unknown): value is string {
  return typeof value === 'string' && CANTON_FINGERPRINT_PATTERN.test(value);
}

/**
 * The party ID `hint::fingerprint`. The hint is trimmed; it must be non-empty, hold only Daml-LF Party characters, no
 * `::` and no trailing `:`, and leave the ID within {@link MAX_EXTERNAL_PARTY_ID_LENGTH} characters. The fingerprint
 * must be a lowercase SHA-256 multihash.
 */
export function buildExternalPartyId(partyHint: string, publicKeyFingerprint: string): string {
  const hint = typeof partyHint === 'string' ? partyHint.trim() : '';
  if (hint === '') throw invalidInput('partyHint is required');
  // A trailing ':' would run into the separator (`wallet:` gives `wallet:::…`, which no reader parses).
  if (hint.includes('::') || hint.endsWith(':')) {
    throw invalidInput('partyHint cannot include the reserved "::" separator or end with ":"');
  }
  if (!isExternalPartyHint(hint)) {
    throw invalidInput('partyHint may hold only ASCII letters, digits, spaces, ":", "-" and "_"');
  }
  if (!isCantonPublicKeyFingerprint(publicKeyFingerprint)) {
    throw invalidInput(
      'publicKeyFingerprint must be a Canton SHA-256 multihash (1220 and 64 lowercase hex characters)'
    );
  }
  const partyId = `${hint}::${publicKeyFingerprint}`;
  if (partyId.length > MAX_EXTERNAL_PARTY_ID_LENGTH) {
    throw invalidInput(`partyHint is too long: the party id would exceed ${MAX_EXTERNAL_PARTY_ID_LENGTH} characters`);
  }
  return partyId;
}

/** The parts of a `hint::namespace` party ID (exactly one `::`, both sides non-empty), or null. Not trimmed. */
export function parseExternalPartyId(
  partyId: unknown
): { readonly partyHint: string; readonly namespace: string } | null {
  if (typeof partyId !== 'string') return null;
  const separator = partyId.indexOf('::');
  if (separator <= 0 || separator !== partyId.lastIndexOf('::') || separator + 2 >= partyId.length) return null;
  return { partyHint: partyId.slice(0, separator), namespace: partyId.slice(separator + 2) };
}

/** The namespace of a `hint::namespace` party ID (for an external party, its key's fingerprint), or null. */
export function readPartyNamespace(partyId: unknown): string | null {
  return parseExternalPartyId(partyId)?.namespace ?? null;
}

function assertCanonicalEd25519PublicKey(raw: Uint8Array): void {
  // Compared with the sign bit cleared, so both x signs of a small-order y (00..80 is the order-4 point) are refused.
  const encodedY = Uint8Array.from(raw);
  encodedY[ED25519_RAW_PUBLIC_KEY_LENGTH - 1] = (encodedY[ED25519_RAW_PUBLIC_KEY_LENGTH - 1] ?? 0) & 0x7f;
  if (ED25519_SMALL_ORDER_PUBLIC_KEYS_HEX.has(bytesToHex(encodedY))) {
    throw invalidInput('Invalid Ed25519 public key: a small-order point is not safe for Canton signing');
  }
  // The encoded y coordinate (sign bit cleared) must be below the field prime.
  for (let index = ED25519_RAW_PUBLIC_KEY_LENGTH - 1; index >= 0; index -= 1) {
    const byte = (raw[index] ?? 0) & (index === ED25519_RAW_PUBLIC_KEY_LENGTH - 1 ? 0x7f : 0xff);
    const prime = ED25519_FIELD_PRIME_LE[index] ?? 0;
    if (byte < prime) return;
    if (byte > prime) break;
  }
  throw invalidInput('Invalid Ed25519 public key: not canonically encoded');
}

function decodeBase64(value: string): Uint8Array {
  const normalized = typeof value === 'string' ? value.trim().replace(/-/g, '+').replace(/_/g, '/') : '';
  const unpadded = trimTrailingPadding(normalized);
  // Padding is optional, but when present it must complete the last quantum (as the Node decoder requires).
  if (
    !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) ||
    unpadded.length % 4 === 1 ||
    (unpadded.length !== normalized.length && normalized.length % 4 !== 0)
  ) {
    throw invalidInput('publicKeyBase64 must be base64-encoded');
  }
  const padded = unpadded.padEnd(unpadded.length + ((4 - (unpadded.length % 4)) % 4), '=');
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw invalidInput('publicKeyBase64 must be base64-encoded');
  }
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  // Refuse trailing bits that do not round-trip (a non-canonical encoding).
  if (trimTrailingPadding(bytesToBase64(bytes)) !== unpadded) {
    throw invalidInput('publicKeyBase64 must be base64-encoded');
  }
  return bytes;
}

/** `value` without trailing `=`, in linear time (no backtracking pattern on caller input). */
function trimTrailingPadding(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '=') end -= 1;
  return value.slice(0, end);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
