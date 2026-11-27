import { randomUUID } from 'node:crypto';
import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { ValidationError } from '../../core/errors';
import { normalizeCantonEd25519Signature } from './canton-ed25519-signer';
import { assertCantonHashSigned } from './hash-signature';
import { assertPartyKey } from './party-identity';
import {
  executeExternalTransactionAndWait,
  type ExecuteExternalTransactionAndWaitResult,
  type InteractiveSubmissionHashingSchemeVersion,
} from './execute-external-transaction';
import { CANTON_ED25519_SIGNATURE_ALGORITHM, CANTON_RAW_SIGNATURE_FORMAT } from './external-party-onboarding';
import { assertSubmittedPreparedTransaction } from './prepared-transaction';

export interface ExecuteExternalPartySignedTransactionOptions {
  readonly ledgerClient: LedgerJsonApiClient;
  /** Ledger user that prepared the transaction (it needs `actAs` on `partyId`). */
  readonly userId: string;
  /** The external party whose key signed the prepared transaction hash. */
  readonly partyId: string;
  /** The party's raw (32-byte) or DER-wrapped Ed25519 public key, base64. */
  readonly publicKeyBase64: string;
  /** When given, must match the fingerprint derived from `publicKeyBase64`. */
  readonly publicKeyFingerprint?: string | null;
  /** The participant's prepared transaction, base64, as prepare returned it. */
  readonly preparedTransaction: string;
  /** The signed hash (32 bytes, hex): it must be the hash of `preparedTransaction` under `hashingSchemeVersion`. */
  readonly preparedTransactionHashHex: string;
  /**
   * Ed25519 signature over the prepared transaction hash bytes, base64. Unpadded, base64url and whitespace-padded input
   * is accepted; it is sent to the participant as canonical, padded standard base64.
   */
  readonly signatureBase64: string;
  /** The scheme the transaction was prepared under, and is executed under. Default: V2. */
  readonly hashingSchemeVersion?: InteractiveSubmissionHashingSchemeVersion;
  readonly submissionId?: string;
}

/**
 * Verifies a single external party's Ed25519 signature over a prepared transaction hash and executes the prepared
 * transaction with it (`interactiveSubmissionExecuteAndWait`), returning the update id.
 *
 * Before anything is sent to the participant: the party id must belong to the public key; the hash must be the hash of
 * `preparedTransaction` under `hashingSchemeVersion`, recomputed here, and the transaction must act only as `partyId`
 * (its command id and synchronizer are the ones it states); and the signature must verify against that hash. The
 * signature is sent in the raw Ed25519 format, as canonical padded base64, signed by the key's Canton fingerprint.
 */
export async function executeExternalPartySignedTransaction(
  options: ExecuteExternalPartySignedTransactionOptions
): Promise<ExecuteExternalTransactionAndWaitResult> {
  if (!options.userId.trim()) {
    throw new ValidationError('userId is required', { userId: options.userId });
  }
  const publicKeyFingerprint = assertPartyKey({
    partyId: options.partyId,
    publicKeyBase64: options.publicKeyBase64,
    ...(options.publicKeyFingerprint !== undefined ? { publicKeyFingerprint: options.publicKeyFingerprint } : {}),
  });
  const hashingSchemeVersion = options.hashingSchemeVersion ?? 'HASHING_SCHEME_VERSION_V2';
  await assertSubmittedPreparedTransaction({
    preparedTransaction: options.preparedTransaction,
    preparedTransactionHashHex: options.preparedTransactionHashHex,
    hashingScheme: hashingSchemeVersion,
    expected: { actAs: [options.partyId] },
  });
  await assertCantonHashSigned({
    publicKeyBase64: options.publicKeyBase64,
    hashHex: options.preparedTransactionHashHex,
    signatureBase64: options.signatureBase64,
  });
  // The execute request accepts only canonical padded base64, while verification also accepts other spellings.
  const signature = normalizeCantonEd25519Signature({ signatureBase64: options.signatureBase64 });

  return executeExternalTransactionAndWait({
    ledgerClient: options.ledgerClient,
    userId: options.userId,
    preparedTransaction: options.preparedTransaction,
    hashingSchemeVersion,
    submissionId: options.submissionId ?? randomUUID(),
    partySignatures: [
      {
        party: options.partyId,
        signatures: [
          {
            signature,
            signedBy: publicKeyFingerprint,
            format: CANTON_RAW_SIGNATURE_FORMAT,
            signingAlgorithmSpec: CANTON_ED25519_SIGNATURE_ALGORITHM,
          },
        ],
      },
    ],
  });
}
