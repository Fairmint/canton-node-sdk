import { createHash, createHmac, timingSafeEqual, verify as verifyEd25519Signature } from 'node:crypto';
import { OperationError, OperationErrorCode, ValidationError } from '../../core/errors';
import { isRecord } from '../../core/utils';
import { wrapEd25519PublicKeyInDER } from './stellar-utils';

const ED25519_DER_X509_PREFIX_HEX = '302a300506032b6570032100';
const ED25519_DER_X509_PREFIX = Buffer.from(ED25519_DER_X509_PREFIX_HEX, 'hex');
const ED25519_RAW_PUBLIC_KEY_LENGTH = 32;
const ED25519_DER_X509_PUBLIC_KEY_LENGTH = ED25519_DER_X509_PREFIX.length + ED25519_RAW_PUBLIC_KEY_LENGTH;
const CANTON_PUBLIC_KEY_FINGERPRINT_HASH_PURPOSE = 12;
const CANTON_SHA256_MULTIHASH_PREFIX_HEX = '1220';
const CANTON_SHA256_MULTIHASH_BYTE_LENGTH = 34;
const CANTON_SHA256_MULTIHASH_HEX_LENGTH = CANTON_SHA256_MULTIHASH_BYTE_LENGTH * 2;
const ED25519_FIELD_PRIME_LE = Buffer.from('edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f', 'hex');
const ED25519_SMALL_ORDER_PUBLIC_KEYS_HEX = new Set([
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0100000000000000000000000000000000000000000000000000000000000000',
  'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  'edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39cccecfd7792ac037a900',
  'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39cccecfd7792ac037a980',
  '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05',
  '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85',
]);
const SOLANA_BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export interface CantonPartyPublicKeyInput {
  readonly partyId: string;
  readonly publicKeyBase64: string;
  readonly publicKeyFingerprint?: string | null;
}

export interface CantonHashSignatureInput {
  readonly publicKeyBase64: string;
  readonly hashHex: string;
  readonly signatureBase64: string;
}

export interface Ed25519SignatureInput {
  readonly publicKeyBase64: string;
  readonly payload: Buffer | Uint8Array | string;
  readonly signatureBase64: string;
  readonly failureMessage?: string;
}

/** Normalizes a raw or DER-wrapped Ed25519 public key into Canton's DER X.509 SubjectPublicKeyInfo base64 format. */
export function normalizeEd25519PublicKeyForCanton(publicKeyBase64: string): string {
  return wrapEd25519PublicKeyInDER(extractRawEd25519PublicKey(publicKeyBase64)).toString('base64');
}

/** Extracts and validates the raw 32-byte Ed25519 public key from raw or DER X.509 base64 input. */
export function extractRawEd25519PublicKey(publicKeyBase64: string): Buffer {
  const key = decodeBase64(publicKeyBase64, 'publicKeyBase64');
  if (key.length === ED25519_RAW_PUBLIC_KEY_LENGTH) {
    assertCanonicalEd25519PublicKey(key);
    return key;
  }
  if (isEd25519DerX509PublicKey(key)) {
    const rawKey = key.subarray(ED25519_DER_X509_PREFIX.length);
    assertCanonicalEd25519PublicKey(rawKey);
    return rawKey;
  }
  throw invalidEd25519PublicKeyLength(key.length);
}

/** Converts a raw or DER-wrapped Ed25519 public key into the equivalent Solana address. */
export function deriveSolanaAddressFromEd25519PublicKeyBase64(publicKeyBase64: string): string {
  return encodeSolanaBase58(extractRawEd25519PublicKey(publicKeyBase64));
}

/** Derives the Canton fingerprint suffix for an Ed25519 external-party key. */
export function deriveCantonEd25519PublicKeyFingerprint(publicKeyBase64: string): string {
  const rawPublicKey = extractRawEd25519PublicKey(publicKeyBase64);
  const purpose = Buffer.alloc(4);
  purpose.writeInt32BE(CANTON_PUBLIC_KEY_FINGERPRINT_HASH_PURPOSE);
  const digest = createHash('sha256').update(purpose).update(rawPublicKey).digest('hex');
  return `${CANTON_SHA256_MULTIHASH_PREFIX_HEX}${digest}`;
}

/** Builds a deterministic external party id from a party hint/prefix and a Canton public-key fingerprint. */
export function buildExternalPartyId(partyHint: string, publicKeyFingerprint: string): string {
  const normalizedHint = partyHint.trim();
  if (!normalizedHint) {
    throw new ValidationError('partyHint is required');
  }
  if (normalizedHint.includes('::')) {
    throw new ValidationError('partyHint cannot include the reserved "::" separator', { partyHint });
  }
  const fingerprint = assertCantonSha256MultihashHex(publicKeyFingerprint);
  return `${normalizedHint}::${fingerprint}`;
}

/** Extracts the public-key fingerprint suffix from a Canton party id. */
export function extractPublicKeyFingerprint(partyId: string): string {
  return extractCantonPartyFingerprint(
    partyId,
    () => new ValidationError('Expected a Canton party ID with one public key fingerprint suffix', { partyId })
  );
}

/**
 * Verifies that a party id fingerprint and optional caller-supplied fingerprint match a submitted Ed25519 public key.
 *
 * Returns the derived fingerprint when the party/key binding is valid.
 */
export function assertCantonPartyMatchesPublicKey(input: CantonPartyPublicKeyInput): string {
  const partyFingerprint = extractPublicKeyFingerprint(input.partyId);
  const keyFingerprint = deriveCantonEd25519PublicKeyFingerprint(input.publicKeyBase64);
  const suppliedFingerprint = input.publicKeyFingerprint?.trim();

  if (suppliedFingerprint && suppliedFingerprint !== keyFingerprint) {
    throw new ValidationError('Submitted public key fingerprint does not match the public key', {
      suppliedFingerprint,
      keyFingerprint,
    });
  }
  if (partyFingerprint !== keyFingerprint) {
    throw new ValidationError('Canton party ID does not match the submitted public key', {
      partyFingerprint,
      keyFingerprint,
    });
  }
  return keyFingerprint;
}

/** Converts a Canton hash from hex, base64, or base64url into lowercase hex. */
export function normalizeCantonHashToHex(hash: string, operation = 'operation'): string {
  const normalized = hash.trim();
  if (isCantonSha256MultihashHex(normalized)) {
    return normalized.toLowerCase();
  }

  const base64 = normalized.replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 === 1) {
    throw invalidCantonHash(operation);
  }

  const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const decoded = Buffer.from(paddedBase64, 'base64');
  if (!decoded.length || decoded.toString('base64').replace(/=+$/, '') !== base64.replace(/=+$/, '')) {
    throw invalidCantonHash(operation);
  }
  assertCantonSha256Multihash(decoded, operation);
  return decoded.toString('hex');
}

/** Validates and lowercases a submitted Canton SHA-256 multihash hex value. */
export function assertCantonSha256MultihashHex(value: string): string {
  const normalized = value.trim();
  if (!isCantonSha256MultihashHex(normalized)) {
    throw new ValidationError('Expected a Canton SHA-256 multihash hex string', { value });
  }
  return normalized.toLowerCase();
}

/** Converts a hex-encoded hash into base64 bytes for browser wallet signing. */
export function hashHexToBase64(hashHex: string): string {
  return decodeHashHex(hashHex).toString('base64');
}

/** Verifies an Ed25519 signature over a hex-encoded Canton hash. */
export function assertCantonHashSignature(input: CantonHashSignatureInput): void {
  assertEd25519Signature({
    publicKeyBase64: input.publicKeyBase64,
    payload: decodeHashHex(input.hashHex),
    signatureBase64: input.signatureBase64,
    failureMessage: 'Invalid Canton hash signature',
  });
}

/** Verifies an Ed25519 signature against a raw payload using a raw or DER-wrapped public key. */
export function assertEd25519Signature(input: Ed25519SignatureInput): void {
  const derPublicKey = decodeBase64(normalizeEd25519PublicKeyForCanton(input.publicKeyBase64), 'publicKeyBase64');
  const signature = decodeBase64(input.signatureBase64, 'signatureBase64');
  const payload = normalizeSignaturePayload(input.payload);
  const verified = verifyEd25519Signature(null, payload, { key: derPublicKey, format: 'der', type: 'spki' }, signature);
  if (!verified) {
    throw new ValidationError(input.failureMessage ?? 'Invalid Ed25519 signature');
  }
}

/** Produces stable JSON for token/signature payloads by sorting object keys and omitting undefined values. */
export function canonicalizeCantonProtocolPayload(payload: unknown): string {
  return JSON.stringify(normalizeCantonProtocolPayload(payload));
}

/** Hashes a canonicalized protocol payload with SHA-256. */
export function hashCantonProtocolPayload(payload: unknown): string {
  return createHash('sha256').update(canonicalizeCantonProtocolPayload(payload), 'utf8').digest('hex');
}

/** Builds an HMAC-bound token for a prepared Canton transaction or topology payload. */
export function buildCantonPrepareToken(secret: string, payload: Record<string, unknown>): string {
  assertNonEmptyPrepareTokenSecret(secret);
  const encodedPayload = Buffer.from(canonicalizeCantonProtocolPayload(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

/** Verifies that a submitted prepare token exactly binds to the expected prepared Canton payload. */
export function assertCantonPrepareToken(
  secret: string,
  token: string,
  expectedPayload: Record<string, unknown>
): void {
  assertNonEmptyPrepareTokenSecret(secret);
  const expectedToken = buildCantonPrepareToken(secret, expectedPayload);
  const actual = Buffer.from(token);
  const expected = Buffer.from(expectedToken);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new ValidationError(
      'Prepared Canton transaction token does not match the submitted details. Prepare a fresh transaction and sign it again'
    );
  }
}

function assertNonEmptyPrepareTokenSecret(secret: string): void {
  if (!secret.trim()) {
    throw new ValidationError('Prepare token secret is required');
  }
}

/** Computes the SHA-256 hex digest of a base64 prepared transaction blob for token binding. */
export function hashPreparedTransaction(preparedTransaction: string): string {
  return createHash('sha256').update(preparedTransaction).digest('hex');
}

/** Converts a base64/base64url prepared transaction hash returned by interactive submission into lowercase hex. */
export function preparedTransactionHashToHex(hashBase64: string, operation = 'interactive submission prepare'): string {
  const normalized = hashBase64.trim().replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 === 1) {
    throw new OperationError(
      `Canton ${operation} response did not include a valid prepared hash`,
      OperationErrorCode.TRANSACTION_FAILED
    );
  }
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const decoded = Buffer.from(padded, 'base64');
  if (!decoded.length || decoded.toString('base64').replace(/=+$/, '') !== normalized.replace(/=+$/, '')) {
    throw new OperationError(
      `Canton ${operation} response did not include a valid prepared hash`,
      OperationErrorCode.TRANSACTION_FAILED
    );
  }
  return decoded.toString('hex');
}

function normalizeSignaturePayload(payload: Buffer | Uint8Array | string): Buffer {
  if (typeof payload === 'string') {
    return Buffer.from(payload, 'utf8');
  }
  return Buffer.from(payload);
}

function isCantonSha256MultihashHex(value: string): boolean {
  return (
    value.length === CANTON_SHA256_MULTIHASH_HEX_LENGTH &&
    value.toLowerCase().startsWith(CANTON_SHA256_MULTIHASH_PREFIX_HEX) &&
    /^[0-9a-fA-F]+$/.test(value)
  );
}

function assertCantonSha256Multihash(hash: Buffer, operation: string): void {
  if (
    hash.length !== CANTON_SHA256_MULTIHASH_BYTE_LENGTH ||
    hash.subarray(0, 2).toString('hex') !== CANTON_SHA256_MULTIHASH_PREFIX_HEX
  ) {
    throw invalidCantonHash(operation);
  }
}

function invalidCantonHash(operation: string): OperationError {
  return new OperationError(
    `Canton ${operation} response did not include a valid SHA-256 multihash`,
    OperationErrorCode.TRANSACTION_FAILED
  );
}

function decodeBase64(value: string, label: string): Buffer {
  const normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 === 1) {
    throw new ValidationError(`${label} must be base64-encoded`, { [label]: value });
  }
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const decoded = Buffer.from(padded, 'base64');
  if (decoded.toString('base64').replace(/=+$/, '') !== normalized.replace(/=+$/, '')) {
    throw new ValidationError(`${label} must be base64-encoded`, { [label]: value });
  }
  return decoded;
}

function decodeHashHex(hashHex: string): Buffer {
  const normalized = hashHex.trim();
  if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new ValidationError('Expected a hex-encoded Canton hash', { hashHex });
  }
  return Buffer.from(normalized, 'hex');
}

function encodeSolanaBase58(bytes: Buffer): string {
  const digits: number[] = [];

  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      const currentDigit = digits[index] ?? 0;
      const value = currentDigit * 256 + carry;
      digits[index] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let leadingZeroes = 0;
  while (leadingZeroes < bytes.length && bytes[leadingZeroes] === 0) {
    leadingZeroes += 1;
  }

  return (
    SOLANA_BASE58_ALPHABET.charAt(0).repeat(leadingZeroes) +
    digits
      .reverse()
      .map((digit) => SOLANA_BASE58_ALPHABET.charAt(digit))
      .join('')
  );
}

function isEd25519DerX509PublicKey(key: Buffer): boolean {
  return (
    key.length === ED25519_DER_X509_PUBLIC_KEY_LENGTH &&
    key.subarray(0, ED25519_DER_X509_PREFIX.length).equals(ED25519_DER_X509_PREFIX)
  );
}

function assertCanonicalEd25519PublicKey(rawPublicKey: Buffer): void {
  if (ED25519_SMALL_ORDER_PUBLIC_KEYS_HEX.has(rawPublicKey.toString('hex').toLowerCase())) {
    throw new ValidationError('Invalid Ed25519 public key');
  }

  const encodedY = Buffer.from(rawPublicKey);
  encodedY[31] = (encodedY[31] ?? 0) & 0x7f;
  if (compareLittleEndian(encodedY, ED25519_FIELD_PRIME_LE) >= 0) {
    throw new ValidationError('Invalid Ed25519 public key');
  }
}

function compareLittleEndian(left: Buffer, right: Buffer): number {
  for (let index = Math.max(left.length, right.length) - 1; index >= 0; index -= 1) {
    const leftByte = left[index] ?? 0;
    const rightByte = right[index] ?? 0;
    if (leftByte !== rightByte) return leftByte - rightByte;
  }
  return 0;
}

function invalidEd25519PublicKeyLength(length: number): ValidationError {
  return new ValidationError(
    `Invalid Ed25519 public key length: ${length}; expected raw 32 bytes or DER-wrapped 44 bytes`,
    {
      actualLength: length,
      expectedRawLength: ED25519_RAW_PUBLIC_KEY_LENGTH,
      expectedDerLength: ED25519_DER_X509_PUBLIC_KEY_LENGTH,
    }
  );
}

function extractCantonPartyFingerprint(partyId: string, createError: () => Error): string {
  const trimmed = partyId.trim();
  const separatorIndex = trimmed.indexOf('::');
  if (separatorIndex <= 0 || separatorIndex !== trimmed.lastIndexOf('::')) {
    throw createError();
  }
  const fingerprint = trimmed.slice(separatorIndex + 2).trim();
  if (!fingerprint) {
    throw createError();
  }
  return fingerprint;
}

function normalizeCantonProtocolPayload(payload: unknown): unknown {
  if (payload === undefined) return null;
  if (payload === null || typeof payload === 'string' || typeof payload === 'boolean') {
    return payload;
  }
  if (typeof payload === 'number') {
    if (!Number.isFinite(payload)) {
      throw new ValidationError('Canton protocol payload contains a non-finite number');
    }
    return payload;
  }
  if (Array.isArray(payload)) {
    return payload.map((item) => normalizeCantonProtocolPayload(item));
  }
  if (isRecord(payload)) {
    return Object.fromEntries(
      Object.entries(payload)
        .filter(([, value]) => value !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => [key, normalizeCantonProtocolPayload(value)])
    );
  }
  throw new ValidationError('Canton protocol payload contains an unsupported value');
}
