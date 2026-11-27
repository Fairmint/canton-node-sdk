/**
 * Node-sdk's check of an external party's signature over a Canton hash. Internal: not exported from the package.
 *
 * The verification is `@fairmint/canton-protocol/signature`'s `verifyCantonHashSignature` (WebCrypto Ed25519), which
 * resolves `false` on a signature that does not verify and rejects on malformed input. This wrapper fails closed on
 * both: `false` is a {@link ValidationError}, malformed caller input (`INVALID_INPUT`) is a {@link ValidationError}
 * carrying canton-protocol's refusal as `cause`, and any other rejection (`UNSUPPORTED`: no Ed25519 in this platform's
 * WebCrypto) propagates as it is. Callers must await it before they allocate, execute or submit anything.
 */
import { verifyCantonHashSignature } from '@fairmint/canton-protocol/signature';
import { ValidationError } from '../../core/errors';
import { callerInputError } from './party-identity';

const HASH_HEX_PATTERN = /^(?:[0-9a-fA-F]{64}|[0-9a-fA-F]{68})$/;

export interface CantonHashSignatureCheck {
  /** The signer's Ed25519 public key: raw or DER (X.509 SubjectPublicKeyInfo), base64. */
  readonly publicKeyBase64: string;
  /** The signed hash as hex (either case): a 34-byte Canton hash (`1220…`) or a 32-byte prepared-transaction hash. */
  readonly hashHex: string;
  /** The raw 64-byte Ed25519 signature, base64 or base64url. */
  readonly signatureBase64: string;
  /** The message of the {@link ValidationError} thrown when the signature does not verify. */
  readonly failureMessage?: string;
}

/**
 * Resolves when `signatureBase64` is `publicKeyBase64`'s Ed25519 signature over `hashHex`; rejects otherwise (see the
 * module comment for the error contract).
 */
export async function assertCantonHashSigned(input: CantonHashSignatureCheck): Promise<void> {
  // Decode here so the hex and base64 contracts of the names hold: canton-protocol would also read a hex signature or
  // a base64 hash.
  const hash = decodeHashHex(input.hashHex);
  const signature = Uint8Array.from(decodeBase64(input.signatureBase64, 'signatureBase64'));
  let valid: boolean;
  try {
    valid = await verifyCantonHashSignature({ hash, signature, publicKey: input.publicKeyBase64 });
  } catch (error) {
    throw callerInputError(error);
  }
  if (!valid) {
    throw new ValidationError(input.failureMessage ?? 'Invalid Canton hash signature');
  }
}

/** Whether `hex` (trimmed, either case) is a hash an external party signs: 32 bytes, or a 34-byte Canton hash. */
export function isSignedHashHex(hex: string): boolean {
  const normalized = hex.trim();
  return HASH_HEX_PATTERN.test(normalized) && (normalized.length === 64 || normalized.startsWith('1220'));
}

/** The bytes of strict base64 or base64url `value` (trimmed; padding optional). */
export function decodeBase64(value: string, label: string): Buffer {
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

function decodeHashHex(hashHex: string): Uint8Array {
  if (!isSignedHashHex(hashHex)) {
    throw new ValidationError(
      'Expected a hex-encoded Canton hash (34 bytes, 1220…) or prepared-transaction hash (32 bytes)',
      { hashHex }
    );
  }
  return Uint8Array.from(Buffer.from(hashHex.trim(), 'hex'));
}
