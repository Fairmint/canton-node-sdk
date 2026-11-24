import { randomUUID } from 'node:crypto';
import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { ValidationError } from '../../core/errors';
import { assertCantonHashSignature, assertCantonPartyMatchesPublicKey } from './canton-protocol';
import {
  executeExternalTransactionAndWait,
  type ExecuteExternalTransactionAndWaitResult,
  type InteractiveSubmissionHashingSchemeVersion,
} from './execute-external-transaction';
import { CANTON_ED25519_SIGNATURE_ALGORITHM, CANTON_RAW_SIGNATURE_FORMAT } from './external-party-onboarding';

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
  readonly preparedTransaction: string;
  readonly preparedTransactionHashHex: string;
  /** Ed25519 signature over the prepared transaction hash bytes, base64. */
  readonly signatureBase64: string;
  readonly hashingSchemeVersion?: InteractiveSubmissionHashingSchemeVersion;
  readonly submissionId?: string;
}

/**
 * Verifies a single external party's Ed25519 signature over a prepared transaction hash and executes the prepared
 * transaction with it (`interactiveSubmissionExecuteAndWait`), returning the update id.
 *
 * The party id must belong to the public key, and the signature must verify against the hash, before anything is sent
 * to the participant. The signature is sent in the raw Ed25519 format, signed by the key's Canton fingerprint.
 */
export async function executeExternalPartySignedTransaction(
  options: ExecuteExternalPartySignedTransactionOptions
): Promise<ExecuteExternalTransactionAndWaitResult> {
  if (!options.userId.trim()) {
    throw new ValidationError('userId is required', { userId: options.userId });
  }
  const publicKeyFingerprint = assertCantonPartyMatchesPublicKey({
    partyId: options.partyId,
    publicKeyBase64: options.publicKeyBase64,
    ...(options.publicKeyFingerprint !== undefined ? { publicKeyFingerprint: options.publicKeyFingerprint } : {}),
  });
  assertCantonHashSignature({
    publicKeyBase64: options.publicKeyBase64,
    hashHex: options.preparedTransactionHashHex,
    signatureBase64: options.signatureBase64,
  });

  return executeExternalTransactionAndWait({
    ledgerClient: options.ledgerClient,
    userId: options.userId,
    preparedTransaction: options.preparedTransaction,
    hashingSchemeVersion: options.hashingSchemeVersion ?? 'HASHING_SCHEME_VERSION_V2',
    submissionId: options.submissionId ?? randomUUID(),
    partySignatures: [
      {
        party: options.partyId,
        signatures: [
          {
            signature: options.signatureBase64,
            signedBy: publicKeyFingerprint,
            format: CANTON_RAW_SIGNATURE_FORMAT,
            signingAlgorithmSpec: CANTON_ED25519_SIGNATURE_ALGORITHM,
          },
        ],
      },
    ],
  });
}
