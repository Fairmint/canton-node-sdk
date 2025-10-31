import type { LedgerJsonApiClient } from '../../clients/ledger-json-api';
import type { Command, DisclosedContract } from '../../clients/ledger-json-api/schemas';
import { ValidatorApiClient } from '../../clients/validator-api';

/**
 * Parameters for preparing an external transaction
 */
export interface PrepareExternalTransactionParams {
  /** Ledger JSON API client instance */
  ledgerClient: LedgerJsonApiClient;
  /** Commands to execute atomically */
  commands: Command[];
  /** Party IDs acting in this transaction */
  actAs: string[];
  /** Unique command identifier */
  commandId: string;
  /** Synchronizer ID */
  synchronizerId: string;
  /** User ID (optional, will use authenticated user if not provided) */
  userId?: string;
  /** Party IDs with read-only access (optional) */
  readAs?: string[];
  /** Contracts to disclose to non-stakeholders (optional) */
  disclosedContracts?: DisclosedContract[];
  /** Minimum ledger time (optional) */
  minLedgerTimeAbs?: string;
  /** Application ID (optional) */
  applicationId?: string;
  /** Package ID selection preference (optional) */
  packageIdSelectionPreference?: string[];
  /** Include verbose hashing details for debugging (optional) */
  verboseHashing?: boolean;
}

/**
 * Result of preparing an external transaction
 */
export interface PrepareExternalTransactionResult {
  /** The prepared transaction to be signed and executed */
  preparedTransaction: string;
  /** Hash of the transaction that needs to be signed */
  preparedTransactionHash: string;
  /** Version of hashing algorithm used */
  hashingSchemeVersion: 'HASHING_SCHEME_VERSION_UNSPECIFIED' | 'HASHING_SCHEME_VERSION_V2';
  /** Verbose hashing details (only if requested) */
  hashingDetails?: string;
}

/**
 * Prepares a transaction for external signing
 *
 * This function submits commands to Canton for interpretation.
 * Canton returns:
 * - The prepared transaction (interpreted result)
 * - A hash of the transaction to sign
 * - The hashing scheme version
 *
 * The user must sign the preparedTransactionHash with their external key,
 * then submit both the preparedTransaction and signature to executeExternalTransaction.
 *
 * @example
 * ```typescript
 * const prepared = await prepareExternalTransaction({
 *   ledgerClient,
 *   commands: [{
 *     CreateCommand: {
 *       templateId: 'MyPackage:MyModule:MyTemplate',
 *       createArgument: { field: 'value' }
 *     }
 *   }],
 *   actAs: ['alice::12abc...'],
 *   commandId: `create-${Date.now()}`,
 *   synchronizerId: 'global-synchronizer',
 * });
 *
 * // Sign prepared.preparedTransactionHash
 * const signature = signWithStellarKeypair(keypair, prepared.preparedTransactionHash);
 * ```
 *
 * @param params - Configuration for transaction preparation
 * @returns Prepared transaction and hash to sign
 */
export async function prepareExternalTransaction(
  params: PrepareExternalTransactionParams
): Promise<PrepareExternalTransactionResult> {
  const { ledgerClient, commands, actAs, commandId, synchronizerId } = params;

  // Fetch userId if not provided
  let userId = params.userId;
  if (!userId) {
    const validatorClient = new ValidatorApiClient();
    const validatorInfo = await validatorClient.getValidatorUserInfo();
    userId = validatorInfo.user_name;
  }

  const result = await ledgerClient.prepareSubmission({
    commands,
    actAs,
    commandId,
    synchronizerId,
    userId,
    readAs: params.readAs,
    disclosedContracts: params.disclosedContracts,
    minLedgerTimeAbs: params.minLedgerTimeAbs,
    applicationId: params.applicationId,
    packageIdSelectionPreference: params.packageIdSelectionPreference,
    verboseHashing: params.verboseHashing ?? false,
  });

  if (!result.preparedTransaction) {
    throw new Error('No prepared transaction returned from prepare endpoint');
  }

  if (!result.preparedTransactionHash) {
    throw new Error('No prepared transaction hash returned from prepare endpoint');
  }

  if (!result.hashingSchemeVersion) {
    throw new Error('No hashing scheme version returned from prepare endpoint');
  }

  return {
    preparedTransaction: result.preparedTransaction,
    preparedTransactionHash: result.preparedTransactionHash,
    hashingSchemeVersion: result.hashingSchemeVersion,
    ...(result.hashingDetails && { hashingDetails: result.hashingDetails }),
  };
}
