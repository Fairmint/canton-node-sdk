/**
 * Checks shared by `verifyWalletOwnership` (the text message) and `verifyWalletProof` (the wallet proof message): the
 * proof's shape, the validity window, and the key and signature. Internal: not exported from the package.
 */
import { fingerprintEd25519PublicKey, readPartyNamespace } from '@fairmint/canton-protocol/party';
import { assertEd25519Signature } from './canton-protocol';
import { normalizeCantonEd25519Signature } from './canton-ed25519-signer';
import { hasSurroundingWhitespace } from './party-identity';
import type { WalletOwnershipFailure, WalletOwnershipProof } from '../../wallets/ownership';

/** A failed check: why, and a sentence for logs or the user. */
export interface WalletOwnershipCheckFailure {
  readonly verified: false;
  readonly reason: WalletOwnershipFailure;
  readonly message: string;
}

export const checkFailure = (reason: WalletOwnershipFailure, message: string): WalletOwnershipCheckFailure => ({
  verified: false,
  reason,
  message,
});

/**
 * The key as base64 for the Canton helpers: 64 hex characters (the raw key, as Loop reports it), else base64 of the raw
 * or DER SubjectPublicKeyInfo key (as Privy's provider reports it), which the helpers accept as is.
 */
function publicKeyBase64(value: string): string {
  return /^[0-9a-fA-F]{64}$/.test(value) ? Buffer.from(value, 'hex').toString('base64') : value;
}

/** The signature as base64: 128 hex characters (Loop), else base64 (Privy); 64 bytes either way. */
function signatureBase64(value: string): string {
  return /^[0-9a-fA-F]{128}$/.test(value)
    ? normalizeCantonEd25519Signature({ signatureHex: value })
    : normalizeCantonEd25519Signature({ signatureBase64: value });
}

/** The proof's fields, or null when it is not `{ partyId, publicKey, message, signature, namespace? }` of strings. */
export function readWalletOwnershipProof(proof: unknown): WalletOwnershipProof | null {
  if (typeof proof !== 'object' || proof === null) return null;
  const record = proof as Record<string, unknown>;
  const { partyId, publicKey, namespace, message, signature } = record;
  if (
    typeof partyId !== 'string' ||
    typeof publicKey !== 'string' ||
    typeof message !== 'string' ||
    typeof signature !== 'string' ||
    (namespace !== undefined && typeof namespace !== 'string') ||
    publicKey.length > 1024 ||
    signature.length > 1024
  ) {
    return null;
  }
  return { partyId, publicKey, message, signature, ...(namespace !== undefined && { namespace }) };
}

/** Throws `TypeError` unless the clock and bounds are usable. */
export function assertWindowOptions(now: number, maxAgeMs: number, skewMs: number, names: string): void {
  if (!Number.isFinite(now) || !(maxAgeMs > 0) || !(skewMs >= 0)) {
    throw new TypeError(`${names} must be valid`);
  }
}

/**
 * Null when `[issuedAt, expiresAt)` is current at `now`: issued at most `skewMs` in the future, valid for at most
 * `maxAgeMs`, and not yet expired. Else the failure.
 */
export function checkWindow(
  issuedAtText: string,
  expiresAtText: string,
  now: number,
  maxAgeMs: number,
  skewMs: number
): WalletOwnershipCheckFailure | null {
  const issuedAt = Date.parse(issuedAtText);
  const expiresAt = Date.parse(expiresAtText);
  if (issuedAt > now + skewMs) return checkFailure('not-yet-valid', 'The message was issued in the future');
  if (expiresAt - issuedAt > maxAgeMs) {
    return checkFailure('lifetime-too-long', `The message is valid for longer than ${maxAgeMs} ms`);
  }
  // With the lifetime bounded above, this also bounds the message's age by maxAgeMs.
  if (now >= expiresAt) return checkFailure('expired', 'The message has expired');
  return null;
}

/**
 * The key's Canton fingerprint when it is the party's namespace and the Ed25519 signature over the UTF-8 bytes of
 * `proof.message` verifies against it; else the failure.
 */
export function checkKeyAndSignature(
  proof: WalletOwnershipProof
): { readonly fingerprint: string } | WalletOwnershipCheckFailure {
  let fingerprint: string;
  let keyBase64: string;
  try {
    keyBase64 = publicKeyBase64(proof.publicKey);
    fingerprint = fingerprintEd25519PublicKey(keyBase64);
  } catch {
    return checkFailure(
      'unsupported-public-key',
      'The public key is not an Ed25519 key in hex (raw 32 bytes) or base64 (raw 32 bytes or DER SubjectPublicKeyInfo)'
    );
  }
  // A party id is never trimmed: a leading space would otherwise pass as part of the hint.
  if (hasSurroundingWhitespace(proof.partyId)) {
    return checkFailure('party-mismatch', 'The party id has whitespace around it');
  }
  const partyFingerprint = readPartyNamespace(proof.partyId);
  if (partyFingerprint === null) {
    return checkFailure('party-mismatch', 'The party id is not of the form hint::namespace');
  }
  if (partyFingerprint !== fingerprint) {
    return checkFailure(
      'key-not-bound-to-party',
      "The public key's Canton fingerprint is not the party's namespace, so the key does not prove control of the party (a participant-hosted party, or a rotated or delegated key, needs a topology lookup)"
    );
  }

  let signature: string;
  try {
    signature = signatureBase64(proof.signature);
  } catch {
    return checkFailure('malformed-signature', 'The signature is not 64 bytes of hex or base64');
  }
  try {
    assertEd25519Signature({ publicKeyBase64: keyBase64, payload: proof.message, signatureBase64: signature });
  } catch {
    return checkFailure('bad-signature', 'The signature does not verify against the public key');
  }
  return { fingerprint };
}

/** The party id's namespace (after `::`). */
export function partyNamespace(partyId: string): string {
  return partyId.slice(partyId.indexOf('::') + 2);
}
