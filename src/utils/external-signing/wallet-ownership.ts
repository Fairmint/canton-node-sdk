/**
 * Server-side verification of a wallet ownership proof (`proveWalletOwnership` in the browser-safe wallets module).
 * Node only: it uses `node:crypto` through the Canton signing helpers, so it is not exported from the wallets entry.
 *
 * What a `verified` result means: the party's own key signed the canonical message for this domain and this nonce,
 * within its validity window. It rests on two facts this function checks itself, trusting nothing the browser says:
 *
 * 1. The Ed25519 signature over the UTF-8 bytes of the message verifies against the submitted public key.
 * 2. The Canton fingerprint of that key (`1220` + SHA-256 of purpose 12 and the raw key) is the party's namespace (the
 *    part of the party id after `::`), which is how an external party's id is derived from its key. Loop's parties and
 *    the CIP-0103 reference wallet's are external parties of this kind.
 *
 * A party whose namespace is not its signing key's fingerprint (a participant-hosted party, an external party whose key
 * was rotated, or a namespace delegation) fails with `key-not-bound-to-party`. Proving those would need the party's
 * current topology from the ledger (its `PartyToKeyMapping` signing keys, and the namespace delegations that authorize
 * them), which this function does not read.
 *
 * The caller must issue the nonce, store it, pass it as `expectedNonce`, and accept it once: this function cannot tell
 * a replayed proof from a fresh one. Passing the issued times as `expectedIssuedAt` and `expectedExpiresAt` makes the
 * signed text exactly the issued challenge.
 *
 * The message's `Network:` line (`expectedNetwork`, the result's `network`) is checked as text only. A party id is
 * derived from its key and is the same on every network, so a verified proof does not show the party exists or is
 * hosted on that network; a caller that needs that must look the party up on the network (Scan, or the ledger's party
 * and topology APIs).
 */
import {
  assertEd25519Signature,
  deriveCantonEd25519PublicKeyFingerprint,
  extractPublicKeyFingerprint,
} from './canton-protocol';
import { normalizeCantonEd25519Signature } from './canton-ed25519-signer';
import { parseWalletOwnershipMessage } from '../../wallets/ownership';
import type { WalletOwnershipFailure, WalletOwnershipProof } from '../../wallets/ownership';

/** Why a proof did not verify. Defined in the browser-safe wallets module, which shares it; re-exported here. */
export type { WalletOwnershipFailure };

export type WalletOwnershipVerification =
  | {
      readonly verified: true;
      readonly partyId: string;
      /** The party's namespace, which is the key's Canton fingerprint. */
      readonly publicKeyFingerprint: string;
      readonly domain: string;
      readonly nonce: string;
      /** The message's network label, as text; not proof that the party is on that network (see the module comment). */
      readonly network?: string;
      readonly issuedAt: string;
      readonly expiresAt: string;
    }
  | {
      readonly verified: false;
      readonly reason: WalletOwnershipFailure;
      /** A sentence for logs or the user. */
      readonly message: string;
    };

export interface VerifyWalletOwnershipOptions {
  /** The nonce the server issued for this proof (never the one in the proof). */
  readonly expectedNonce: string;
  /** The server's own host, as the challenge named it. */
  readonly expectedDomain: string;
  /** Required in the message when given. A label compared as text, not proof (see the module comment). */
  readonly expectedNetwork?: string;
  /** The `issuedAt` the server issued; the message must repeat it exactly when given. */
  readonly expectedIssuedAt?: string;
  /** The `expiresAt` the server issued; the message must repeat it exactly when given. */
  readonly expectedExpiresAt?: string;
  /** The party the user claims; the proof must be for it. */
  readonly expectedPartyId?: string;
  /** Defaults to the system clock. */
  readonly now?: Date;
  /** The longest validity window accepted (`expiresAt - issuedAt`). Defaults to 10 minutes. */
  readonly maxAgeMs?: number;
  /** How far in the future `issuedAt` may be. Defaults to 60 seconds. */
  readonly clockSkewMs?: number;
}

export const DEFAULT_WALLET_OWNERSHIP_MAX_AGE_MS = 10 * 60 * 1000;
export const DEFAULT_WALLET_OWNERSHIP_CLOCK_SKEW_MS = 60 * 1000;

const ED25519_DER_PREFIX_HEX = '302a300506032b6570032100';

/**
 * The key as base64 for the Canton helpers: 64 hex characters (raw, as Loop registers it), 88 hex characters (DER
 * SubjectPublicKeyInfo), a PEM public key, or base64/base64url of the raw or DER key (as the CIP-0103 reference wallet
 * sends it). The helpers then accept only a 32-byte key or the exact Ed25519 DER prefix.
 */
function publicKeyBase64(value: string): string {
  const trimmed = value.trim();
  const hex = trimmed.replace(/^0x/i, '');
  if (
    /^[0-9a-fA-F]+$/.test(hex) &&
    (hex.length === 64 || (hex.length === 88 && hex.toLowerCase().startsWith(ED25519_DER_PREFIX_HEX)))
  ) {
    return Buffer.from(hex, 'hex').toString('base64');
  }
  const pem = /^-----BEGIN PUBLIC KEY-----\s*([A-Za-z0-9+/=\s]+?)\s*-----END PUBLIC KEY-----$/.exec(trimmed);
  return pem?.[1] !== undefined ? pem[1].replace(/\s+/g, '') : trimmed;
}

/** The signature as base64: 128 hex characters (Loop) or base64/base64url (the reference wallet), 64 bytes either way. */
function signatureBase64(value: string): string {
  const hex = value.trim().replace(/^0x/i, '');
  if (/^[0-9a-fA-F]{128}$/.test(hex)) return normalizeCantonEd25519Signature({ signatureHex: hex });
  return normalizeCantonEd25519Signature({ signatureBase64: value });
}

function readProof(proof: unknown): WalletOwnershipProof | null {
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

const fail = (reason: WalletOwnershipFailure, message: string): WalletOwnershipVerification => ({
  verified: false,
  reason,
  message,
});

/**
 * Verify a wallet ownership proof (see the module comment for what this does and does not establish). Never throws for
 * a bad proof: the result says why it failed. Throws `TypeError` for invalid options.
 */
export function verifyWalletOwnership(
  proof: unknown,
  options: VerifyWalletOwnershipOptions
): WalletOwnershipVerification {
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_WALLET_OWNERSHIP_MAX_AGE_MS;
  const skewMs = options.clockSkewMs ?? DEFAULT_WALLET_OWNERSHIP_CLOCK_SKEW_MS;
  const now = (options.now ?? new Date()).getTime();
  if (typeof options.expectedNonce !== 'string' || options.expectedNonce.length === 0) {
    throw new TypeError('expectedNonce is required');
  }
  if (typeof options.expectedDomain !== 'string' || options.expectedDomain.length === 0) {
    throw new TypeError('expectedDomain is required');
  }
  if (!Number.isFinite(now) || !(maxAgeMs > 0) || !(skewMs >= 0)) {
    throw new TypeError('now, maxAgeMs and clockSkewMs must be valid');
  }

  const read = readProof(proof);
  if (read === null) return fail('malformed-proof', 'The proof is not { partyId, publicKey, message, signature }');
  const fields = parseWalletOwnershipMessage(read.message);
  if (fields === null) return fail('malformed-message', 'The signed text is not a canonical wallet ownership message');

  if (fields.partyId !== read.partyId) {
    return fail('party-mismatch', 'The signed message names another party than the proof');
  }
  if (options.expectedPartyId !== undefined && read.partyId !== options.expectedPartyId) {
    return fail('party-mismatch', 'The proof is for another party than expected');
  }
  const partyNamespace = read.partyId.slice(read.partyId.indexOf('::') + 2);
  if (read.namespace !== undefined && read.namespace !== partyNamespace) {
    return fail('party-mismatch', "The wallet's namespace is not the party id's namespace");
  }
  if (fields.domain !== options.expectedDomain) {
    return fail('domain-mismatch', `The message was signed for ${fields.domain}, not ${options.expectedDomain}`);
  }
  if (fields.nonce !== options.expectedNonce) {
    return fail('nonce-mismatch', 'The message was signed for another challenge');
  }
  if (options.expectedNetwork !== undefined && fields.network !== options.expectedNetwork) {
    return fail(
      'network-mismatch',
      `The message names network ${fields.network ?? '(none)'}, not ${options.expectedNetwork}`
    );
  }

  if (
    (options.expectedIssuedAt !== undefined && fields.issuedAt !== options.expectedIssuedAt) ||
    (options.expectedExpiresAt !== undefined && fields.expiresAt !== options.expectedExpiresAt)
  ) {
    return fail('window-mismatch', 'The message names another validity window than the server issued');
  }

  const issuedAt = Date.parse(fields.issuedAt);
  const expiresAt = Date.parse(fields.expiresAt);
  if (issuedAt > now + skewMs) return fail('not-yet-valid', 'The message was issued in the future');
  if (expiresAt - issuedAt > maxAgeMs) {
    return fail('lifetime-too-long', `The message is valid for longer than ${maxAgeMs} ms`);
  }
  // With the lifetime bounded above, this also bounds the message's age by maxAgeMs.
  if (now >= expiresAt) return fail('expired', 'The message has expired');

  let fingerprint: string;
  let keyBase64: string;
  try {
    keyBase64 = publicKeyBase64(read.publicKey);
    fingerprint = deriveCantonEd25519PublicKeyFingerprint(keyBase64);
  } catch {
    return fail(
      'unsupported-public-key',
      'The public key is not an Ed25519 key in hex, base64 (raw 32 bytes or DER SubjectPublicKeyInfo) or PEM'
    );
  }
  let partyFingerprint: string;
  try {
    partyFingerprint = extractPublicKeyFingerprint(read.partyId);
  } catch {
    return fail('party-mismatch', 'The party id is not of the form hint::namespace');
  }
  if (partyFingerprint !== fingerprint) {
    return fail(
      'key-not-bound-to-party',
      "The public key's Canton fingerprint is not the party's namespace, so the key does not prove control of the party (a participant-hosted party, or a rotated or delegated key, needs a topology lookup)"
    );
  }

  let signature: string;
  try {
    signature = signatureBase64(read.signature);
  } catch {
    return fail('malformed-signature', 'The signature is not 64 bytes of hex or base64');
  }
  try {
    assertEd25519Signature({ publicKeyBase64: keyBase64, payload: read.message, signatureBase64: signature });
  } catch {
    return fail('bad-signature', 'The signature does not verify against the public key');
  }

  return {
    verified: true,
    partyId: read.partyId,
    publicKeyFingerprint: fingerprint,
    domain: fields.domain,
    nonce: fields.nonce,
    ...(fields.network !== undefined && { network: fields.network }),
    issuedAt: fields.issuedAt,
    expiresAt: fields.expiresAt,
  };
}
