/**
 * Server-side verification of a wallet proof message (`wallet-proof-v1`, `buildWalletProofMessage` in the browser-safe
 * wallets module): the compact JSON form apiv2's CNTN tokenization flow uses. Node only, like `verifyWalletOwnership`,
 * whose key and signature checks it shares.
 *
 * A `verified` result means the party's own key signed exactly the canonical message naming the expected domain,
 * network, party (and, when given, account and request) within its validity window: the message parses strictly
 * (`parseWalletProofMessage`), each field equals the server's value, `issuedAt <= now + maxSkewMs`, `expiresAt > now`,
 * `expiresAt - issuedAt <= maxLifetimeMs`, the key's Canton fingerprint is the party's namespace, and the Ed25519
 * signature over the message's UTF-8 bytes verifies. The same limits as `verifyWalletOwnership` apply: the network is a
 * label, a party not namespaced by its key fails `key-not-bound-to-party`, and the caller must accept each
 * `idempotencyKey` once (this function cannot tell a replay from a fresh proof).
 */
import type { DaNetwork } from '../../wallets/da-utilities/client';
import type { WalletOwnershipFailure } from '../../wallets/ownership';
import { parseWalletProofMessage, type WalletProofFields } from '../../wallets/wallet-proof';
import { DEFAULT_WALLET_OWNERSHIP_CLOCK_SKEW_MS, DEFAULT_WALLET_OWNERSHIP_MAX_AGE_MS } from './wallet-ownership';
import {
  assertWindowOptions,
  checkFailure as fail,
  checkKeyAndSignature,
  checkWindow,
  partyNamespace,
  readWalletOwnershipProof,
} from './wallet-ownership-checks';

/** What the server expects the message to name. Optional fields are not checked when omitted. */
export interface WalletProofExpectation {
  /** The purpose tag (`fairmint:tokenization-wallet-proof:v1`). */
  readonly domain: string;
  readonly network: DaNetwork;
  /** The party the user claims; the proof and its message must both name it. */
  readonly partyId: string;
  readonly investorContext?: string;
  readonly idempotencyKey?: string;
  /** The `issuedAt` the server issued, when it built the message; the message must repeat it exactly. */
  readonly issuedAt?: string;
  /** The `expiresAt` the server issued, when it built the message; the message must repeat it exactly. */
  readonly expiresAt?: string;
}

export interface VerifyWalletProofArgs {
  /** `{ partyId, publicKey, message, signature }` (and optional `namespace`), as the browser sent it. */
  readonly proof: unknown;
  readonly expected: WalletProofExpectation;
  /** Defaults to the system clock. */
  readonly now?: Date;
  /** The longest validity window accepted (`expiresAt - issuedAt`). Defaults to 10 minutes. */
  readonly maxLifetimeMs?: number;
  /** How far in the future `issuedAt` may be. Defaults to 60 seconds. */
  readonly maxSkewMs?: number;
}

export type WalletProofVerification =
  | ({
      readonly verified: true;
      /** The party's namespace, which is the key's Canton fingerprint. */
      readonly publicKeyFingerprint: string;
    } & WalletProofFields)
  | {
      readonly verified: false;
      readonly reason: WalletOwnershipFailure;
      /** A sentence for logs or the user; it never echoes the submitted values. */
      readonly message: string;
    };

/**
 * Verify a wallet proof (see the module comment). Never throws for a bad proof: the result says why it failed. Throws
 * `TypeError` for invalid arguments (an expectation without domain, network or party, or a bad clock or bound).
 */
export function verifyWalletProof(args: VerifyWalletProofArgs): WalletProofVerification {
  const { expected } = args;
  const maxLifetimeMs = args.maxLifetimeMs ?? DEFAULT_WALLET_OWNERSHIP_MAX_AGE_MS;
  const maxSkewMs = args.maxSkewMs ?? DEFAULT_WALLET_OWNERSHIP_CLOCK_SKEW_MS;
  const now = (args.now ?? new Date()).getTime();
  for (const key of ['domain', 'network', 'partyId'] as const) {
    if (typeof expected[key] !== 'string' || expected[key].length === 0) {
      throw new TypeError(`expected.${key} is required`);
    }
  }
  assertWindowOptions(now, maxLifetimeMs, maxSkewMs, 'now, maxLifetimeMs and maxSkewMs');

  const read = readWalletOwnershipProof(args.proof);
  if (read === null) return fail('malformed-proof', 'The proof is not { partyId, publicKey, message, signature }');
  const fields = parseWalletProofMessage(read.message);
  if (fields === null) return fail('malformed-message', 'The signed text is not a canonical wallet proof message');

  if (fields.partyId !== read.partyId) {
    return fail('party-mismatch', 'The signed message names another party than the proof');
  }
  if (read.partyId !== expected.partyId) return fail('party-mismatch', 'The proof is for another party than expected');
  if (read.namespace !== undefined && read.namespace !== partyNamespace(read.partyId)) {
    return fail('party-mismatch', "The wallet's namespace is not the party id's namespace");
  }
  if (fields.domain !== expected.domain) return fail('domain-mismatch', 'The message was signed for another purpose');
  if (fields.network !== expected.network) return fail('network-mismatch', 'The message names another network');
  if (expected.investorContext !== undefined && fields.investorContext !== expected.investorContext) {
    return fail('investor-context-mismatch', 'The message names another account');
  }
  if (expected.idempotencyKey !== undefined && fields.idempotencyKey !== expected.idempotencyKey) {
    return fail('idempotency-key-mismatch', 'The message was signed for another request');
  }
  if (
    (expected.issuedAt !== undefined && fields.issuedAt !== expected.issuedAt) ||
    (expected.expiresAt !== undefined && fields.expiresAt !== expected.expiresAt)
  ) {
    return fail('window-mismatch', 'The message names another validity window than the server issued');
  }

  const windowFailure = checkWindow(fields.issuedAt, fields.expiresAt, now, maxLifetimeMs, maxSkewMs);
  if (windowFailure !== null) return windowFailure;
  const bound = checkKeyAndSignature(read);
  if ('verified' in bound) return bound;

  return { verified: true, ...fields, publicKeyFingerprint: bound.fingerprint };
}
