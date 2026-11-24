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
import { parseWalletOwnershipMessage } from '../../wallets/ownership';
import type { WalletOwnershipFailure } from '../../wallets/ownership';
import {
  assertWindowOptions,
  checkFailure as fail,
  checkKeyAndSignature,
  checkWindow,
  partyNamespace,
  readWalletOwnershipProof,
} from './wallet-ownership-checks';

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
  assertWindowOptions(now, maxAgeMs, skewMs, 'now, maxAgeMs and clockSkewMs');

  const read = readWalletOwnershipProof(proof);
  if (read === null) return fail('malformed-proof', 'The proof is not { partyId, publicKey, message, signature }');
  const fields = parseWalletOwnershipMessage(read.message);
  if (fields === null) return fail('malformed-message', 'The signed text is not a canonical wallet ownership message');

  if (fields.partyId !== read.partyId) {
    return fail('party-mismatch', 'The signed message names another party than the proof');
  }
  if (options.expectedPartyId !== undefined && read.partyId !== options.expectedPartyId) {
    return fail('party-mismatch', 'The proof is for another party than expected');
  }
  if (read.namespace !== undefined && read.namespace !== partyNamespace(read.partyId)) {
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

  const windowFailure = checkWindow(fields.issuedAt, fields.expiresAt, now, maxAgeMs, skewMs);
  if (windowFailure !== null) return windowFailure;
  const bound = checkKeyAndSignature(read);
  if ('verified' in bound) return bound;

  return {
    verified: true,
    partyId: read.partyId,
    publicKeyFingerprint: bound.fingerprint,
    domain: fields.domain,
    nonce: fields.nonce,
    ...(fields.network !== undefined && { network: fields.network }),
    issuedAt: fields.issuedAt,
    expiresAt: fields.expiresAt,
  };
}
