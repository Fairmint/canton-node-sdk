import type { LedgerJsonApiClient } from '../../clients/ledger-json-api';

/**
 * Deduplication period configuration
 */
export type DeduplicationPeriod =
  | {
      /** Duration-based deduplication (e.g., "30s", "1m") */
      DeduplicationDuration: {
        duration: string;
      };
    }
  | {
      /** Offset-based deduplication */
      DeduplicationOffset: {
        offset: string;
      };
    };

/**
 * Parameters for executing an external transaction
 */
export interface ExecuteExternalTransactionParams {
  /** Ledger JSON API client instance */
  ledgerClient: LedgerJsonApiClient;
  /** Prepared transaction from prepareExternalTransaction */
  preparedTransaction: string;
  /** Party ID that is signing */
  partyId: string;
  /** Base64-encoded signature of the transaction hash */
  signature: string;
  /** Public key fingerprint that signed */
  publicKeyFingerprint: string;
  /** Unique submission identifier (typically a UUID) */
  submissionId: string;
  /** Deduplication period */
  deduplicationPeriod: DeduplicationPeriod;
  /** Hashing scheme version from prepare response */
  hashingSchemeVersion: 'HASHING_SCHEME_VERSION_UNSPECIFIED' | 'HASHING_SCHEME_VERSION_V2';
  /** User ID (optional, will use authenticated user if not provided) */
  userId?: string;
  /** Application ID (optional) */
  applicationId?: string;
  /** Signature format (default: SIGNATURE_FORMAT_RAW) */
  signatureFormat?: string;
  /** Signing algorithm spec (default: SIGNING_ALGORITHM_SPEC_ED25519) */
  signingAlgorithmSpec?: string;
}

/**
 * Result of executing an external transaction
 *
 * Note: The execute endpoint returns an empty object on success.
 * Track the transaction result through the ledger API by querying
 * with the submission ID or command ID.
 */
export interface ExecuteExternalTransactionResult {
  /** Empty object on success */
  [key: string]: unknown;
}

/**
 * Executes a prepared transaction with an external signature
 *
 * This function submits a prepared transaction along with the signature
 * from an external key. The signature must be over the preparedTransactionHash
 * returned from prepareExternalTransaction.
 *
 * If successful, the transaction is submitted to the ledger and will be
 * processed by validators. The result is an empty object - you must query
 * the ledger to see the transaction outcome.
 *
 * @example
 * ```typescript
 * import { Keypair } from '@stellar/stellar-base';
 * import { signWithStellarKeypair } from '@fairmint/canton-node-sdk';
 *
 * // Prepare transaction first
 * const prepared = await prepareExternalTransaction({ ... });
 *
 * // Sign the hash
 * const signature = signWithStellarKeypair(keypair, prepared.preparedTransactionHash);
 *
 * // Execute with signature
 * await executeExternalTransaction({
 *   ledgerClient,
 *   preparedTransaction: prepared.preparedTransaction,
 *   partyId: 'alice::12abc...',
 *   signature,
 *   publicKeyFingerprint: party.publicKeyFingerprint,
 *   submissionId: `sub-${Date.now()}`,
 *   hashingSchemeVersion: prepared.hashingSchemeVersion,
 *   deduplicationPeriod: {
 *     DeduplicationDuration: { duration: '30s' }
 *   },
 * });
 * ```
 *
 * @param params - Configuration for transaction execution
 * @returns Empty result object on success
 */
export async function executeExternalTransaction(
  params: ExecuteExternalTransactionParams
): Promise<ExecuteExternalTransactionResult> {
  const {
    ledgerClient,
    preparedTransaction,
    partyId,
    signature,
    publicKeyFingerprint,
    submissionId,
    deduplicationPeriod,
    hashingSchemeVersion,
  } = params;

  const result = await ledgerClient.executeSubmission({
    preparedTransaction,
    partySignatures: {
      signatures: [
        {
          party: partyId,
          signatures: [
            {
              format: params.signatureFormat ?? 'SIGNATURE_FORMAT_RAW',
              signature,
              signedBy: publicKeyFingerprint,
              signingAlgorithmSpec: params.signingAlgorithmSpec ?? 'SIGNING_ALGORITHM_SPEC_ED25519',
            },
          ],
        },
      ],
    },
    submissionId,
    deduplicationPeriod,
    hashingSchemeVersion,
    userId: params.userId,
    applicationId: params.applicationId,
  });

  return result;
}
