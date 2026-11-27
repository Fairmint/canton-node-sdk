import { createHash, createHmac, timingSafeEqual, verify as verifyEd25519Signature } from 'node:crypto';
import { ValidationError } from '../../core/errors';
import { isRecord } from '../../core/utils';
import { decodeBase64 } from './hash-signature';
import { cantonPublicKeyBase64, rawEd25519PublicKey } from './party-identity';

const SOLANA_BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export interface Ed25519SignatureInput {
  readonly publicKeyBase64: string;
  readonly payload: Buffer | Uint8Array | string;
  readonly signatureBase64: string;
  readonly failureMessage?: string;
}

/** Converts a raw or DER-wrapped Ed25519 public key into the equivalent Solana address. */
export function deriveSolanaAddressFromEd25519PublicKeyBase64(publicKeyBase64: string): string {
  return encodeSolanaBase58(rawEd25519PublicKey(publicKeyBase64));
}

/** Converts a hex-encoded hash into base64 bytes for browser wallet signing. */
export function hashHexToBase64(hashHex: string): string {
  return decodeHashHex(hashHex).toString('base64');
}

/**
 * Verifies an Ed25519 signature against an arbitrary payload (such as a wallet-ownership message) using a raw or
 * DER-wrapped public key. A signature over a Canton hash is checked with canton-protocol's
 * `verifyCantonHashSignature`.
 */
export function assertEd25519Signature(input: Ed25519SignatureInput): void {
  const derPublicKey = Buffer.from(cantonPublicKeyBase64(input.publicKeyBase64), 'base64');
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

function normalizeSignaturePayload(payload: Buffer | Uint8Array | string): Buffer {
  if (typeof payload === 'string') {
    return Buffer.from(payload, 'utf8');
  }
  return Buffer.from(payload);
}

function decodeHashHex(hashHex: string): Buffer {
  const normalized = hashHex.trim();
  if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new ValidationError('Expected a hex-encoded Canton hash', { hashHex });
  }
  return Buffer.from(normalized, 'hex');
}

function encodeSolanaBase58(bytes: Uint8Array): string {
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
