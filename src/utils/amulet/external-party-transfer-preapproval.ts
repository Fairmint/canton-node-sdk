import { type ValidatorApiClient } from '../../clients/validator-api';
import { ApiError, ValidationError } from '../../core/errors';
import { isRecord } from '../../core/utils';
import { objectOrEmpty, readContractWithStateContractId, readOptionalCantonUpdateId } from '../canton-response-utils';
import {
  assertCantonHashSignature,
  assertCantonPartyMatchesPublicKey,
  extractRawEd25519PublicKey,
} from '../external-signing/canton-protocol';

export interface ExternalPartyTransferPreapprovalContract {
  readonly contractId: string;
  readonly raw: unknown;
}

export interface PrepareExternalPartyTransferPreapprovalSetupParams {
  /** Externally hosted party that will receive CC via transfer preapproval. */
  readonly partyId: string;
  /** Base64-encoded raw Ed25519 public key for partyId. */
  readonly publicKeyBase64: string;
  /** Request validator hashing details for troubleshooting. */
  readonly verboseHashing?: boolean;
}

export interface PreparedExternalPartyTransferPreapprovalSetup {
  readonly partyId: string;
  readonly publicKeyFingerprint: string;
  readonly alreadyPreapproved: boolean;
  readonly transferPreapprovalContractId: string | null;
  readonly setupProposalContractId: string | null;
  readonly preparedTransaction: string | null;
  readonly preparedTransactionHashHex: string | null;
  readonly hashingDetails: string | null;
  readonly raw: {
    readonly transferPreapproval: unknown | null;
    readonly setupProposal: unknown | null;
    readonly prepared: unknown | null;
  };
}

export interface SubmitExternalPartyTransferPreapprovalSetupParams {
  /** Externally hosted party that signed the prepared setup acceptance. */
  readonly partyId: string;
  /** Base64-encoded raw Ed25519 public key for partyId. */
  readonly publicKeyBase64: string;
  /** Base64-encoded prepared transaction returned by prepareExternalPartyTransferPreapprovalSetup. */
  readonly preparedTransaction: string;
  /** Hex-encoded hash returned by prepareExternalPartyTransferPreapprovalSetup. */
  readonly preparedTransactionHashHex: string;
  /** Base64-encoded Ed25519 signature over preparedTransactionHashHex. */
  readonly signatureBase64: string;
}

export interface SubmittedExternalPartyTransferPreapprovalSetup {
  readonly partyId: string;
  readonly transferPreapprovalContractId: string;
  readonly updateId: string;
  readonly raw: Awaited<ReturnType<ValidatorApiClient['submitAcceptExternalPartySetupProposal']>>;
}

export interface SendWalletTransferToPreapprovedPartyParams {
  /** Receiver party with an existing TransferPreapproval contract. */
  readonly receiverPartyId: string;
  /** CC amount to send. */
  readonly amount: string | number;
  /** Idempotency key accepted by Canton for this wallet send. */
  readonly deduplicationId: string;
  /** Optional transfer description. */
  readonly description?: string | null;
}

export interface SentWalletTransferToPreapprovedParty {
  readonly receiverPartyId: string;
  readonly amount: string;
  readonly description: string | null;
  readonly deduplicationId: string;
  readonly updateId: string | null;
  readonly raw: unknown;
}

export async function lookupExternalPartyTransferPreapproval(
  validatorClient: ValidatorApiClient,
  partyId: string
): Promise<ExternalPartyTransferPreapprovalContract | null> {
  validatePartyId('partyId', partyId);
  try {
    const response = await validatorClient.lookupTransferPreapprovalByParty({ partyId });
    const transferPreapproval = objectOrEmpty(objectOrEmpty(response)['transfer_preapproval']);
    const contractId = readContractWithStateContractId(transferPreapproval);
    return contractId ? { contractId, raw: transferPreapproval } : null;
  } catch (error) {
    if (isApiStatus(error, 404)) return null;
    throw error;
  }
}

export async function prepareExternalPartyTransferPreapprovalSetup(
  validatorClient: ValidatorApiClient,
  params: PrepareExternalPartyTransferPreapprovalSetupParams
): Promise<PreparedExternalPartyTransferPreapprovalSetup> {
  validatePartyId('partyId', params.partyId);
  const publicKeyFingerprint = assertCantonPartyMatchesPublicKey({
    partyId: params.partyId,
    publicKeyBase64: params.publicKeyBase64,
  });
  const existingPreapproval = await lookupExternalPartyTransferPreapproval(validatorClient, params.partyId);
  if (existingPreapproval) {
    return {
      partyId: params.partyId,
      publicKeyFingerprint,
      alreadyPreapproved: true,
      transferPreapprovalContractId: existingPreapproval.contractId,
      setupProposalContractId: null,
      preparedTransaction: null,
      preparedTransactionHashHex: null,
      hashingDetails: null,
      raw: {
        transferPreapproval: existingPreapproval.raw,
        setupProposal: null,
        prepared: null,
      },
    };
  }

  const setupResolution = await createOrReuseExternalPartySetupProposal(validatorClient, params.partyId);
  if (setupResolution.kind === 'already-preapproved') {
    return {
      partyId: params.partyId,
      publicKeyFingerprint,
      alreadyPreapproved: true,
      transferPreapprovalContractId: setupResolution.transferPreapproval.contractId,
      setupProposalContractId: null,
      preparedTransaction: null,
      preparedTransactionHashHex: null,
      hashingDetails: null,
      raw: {
        transferPreapproval: setupResolution.transferPreapproval.raw,
        setupProposal: null,
        prepared: null,
      },
    };
  }

  const { proposal } = setupResolution;
  const prepared = await validatorClient.prepareAcceptExternalPartySetupProposal({
    contract_id: proposal.contractId,
    user_party_id: params.partyId,
    verbose_hashing: params.verboseHashing ?? false,
  });

  return {
    partyId: params.partyId,
    publicKeyFingerprint,
    alreadyPreapproved: false,
    transferPreapprovalContractId: null,
    setupProposalContractId: proposal.contractId,
    preparedTransaction: prepared.transaction,
    preparedTransactionHashHex: prepared.tx_hash,
    hashingDetails: readOptionalString(prepared, 'hashing_details'),
    raw: {
      transferPreapproval: null,
      setupProposal: proposal.raw,
      prepared,
    },
  };
}

export async function submitExternalPartyTransferPreapprovalSetup(
  validatorClient: ValidatorApiClient,
  params: SubmitExternalPartyTransferPreapprovalSetupParams
): Promise<SubmittedExternalPartyTransferPreapprovalSetup> {
  validatePartyId('partyId', params.partyId);
  assertCantonHashSignature({
    publicKeyBase64: params.publicKeyBase64,
    hashHex: params.preparedTransactionHashHex,
    signatureBase64: params.signatureBase64,
  });

  const raw = await validatorClient.submitAcceptExternalPartySetupProposal({
    submission: {
      party_id: params.partyId,
      transaction: params.preparedTransaction,
      signed_tx_hash: base64ToHex(params.signatureBase64, 'signatureBase64'),
      public_key: extractRawEd25519PublicKey(params.publicKeyBase64).toString('hex'),
    },
  });

  return {
    partyId: params.partyId,
    transferPreapprovalContractId: raw.transfer_preapproval_contract_id,
    updateId: raw.update_id,
    raw,
  };
}

export async function sendWalletTransferToPreapprovedParty(
  validatorClient: ValidatorApiClient,
  params: SendWalletTransferToPreapprovedPartyParams
): Promise<SentWalletTransferToPreapprovedParty> {
  validatePartyId('receiverPartyId', params.receiverPartyId);
  const amount = normalizeAmountString(params.amount);
  const description = normalizeDescription(params.description);
  const deduplicationId = params.deduplicationId.trim();
  if (!deduplicationId) {
    throw new ValidationError('deduplicationId is required');
  }

  const raw = await validatorClient.transferPreapprovalSend({
    receiver_party_id: params.receiverPartyId,
    amount,
    deduplication_id: deduplicationId,
    ...(description ? { description } : {}),
  });

  return {
    receiverPartyId: params.receiverPartyId,
    amount,
    description,
    deduplicationId,
    updateId: readOptionalCantonUpdateId(raw),
    raw,
  };
}

type ExternalPartySetupProposalResolution =
  | {
      readonly kind: 'proposal';
      readonly proposal: ExternalPartyTransferPreapprovalContract;
    }
  | {
      readonly kind: 'already-preapproved';
      readonly transferPreapproval: ExternalPartyTransferPreapprovalContract;
    };

async function createOrReuseExternalPartySetupProposal(
  validatorClient: ValidatorApiClient,
  partyId: string
): Promise<ExternalPartySetupProposalResolution> {
  const existingProposal = await findExternalPartySetupProposal(validatorClient, partyId);
  if (existingProposal) return { kind: 'proposal', proposal: existingProposal };

  try {
    const response = await validatorClient.createExternalPartySetupProposal({ user_party_id: partyId });
    return { kind: 'proposal', proposal: { contractId: response.contract_id, raw: response } };
  } catch (error) {
    if (!isApiStatus(error, 409)) throw error;

    const existingPreapproval = await lookupExternalPartyTransferPreapproval(validatorClient, partyId);
    if (existingPreapproval) {
      return { kind: 'already-preapproved', transferPreapproval: existingPreapproval };
    }
    const proposal = await findExternalPartySetupProposal(validatorClient, partyId);
    if (proposal) return { kind: 'proposal', proposal };
    throw error;
  }
}

async function findExternalPartySetupProposal(
  validatorClient: ValidatorApiClient,
  partyId: string
): Promise<ExternalPartyTransferPreapprovalContract | null> {
  const response = await validatorClient.listExternalPartySetupProposals();
  const sourceContracts = objectOrEmpty(response)['contracts'];
  const contracts = Array.isArray(sourceContracts) ? sourceContracts : [];
  for (const contract of contracts) {
    if (!isRecord(contract)) continue;
    const contractRecord = objectOrEmpty(contract['contract']);
    const payload = objectOrEmpty(contractRecord['payload']);
    if (payload['user'] !== partyId) continue;
    const contractId = readContractWithStateContractId(contract);
    if (contractId) return { contractId, raw: contract };
  }
  return null;
}

function base64ToHex(value: string, label: string): string {
  const normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 === 1) {
    throw new ValidationError(`${label} must be base64-encoded`);
  }
  return Buffer.from(normalized, 'base64').toString('hex');
}

function validatePartyId(name: string, value: string): void {
  if (!value.trim()) {
    throw new ValidationError(`${name} is required`);
  }
  if (value !== value.trim()) {
    throw new ValidationError(`${name} must not include leading or trailing whitespace`, {
      [name]: value,
    });
  }
}

const CANTON_DECIMAL_AMOUNT_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function normalizeAmountString(amount: string | number): string {
  const normalized = typeof amount === 'number' ? amount.toString() : amount.trim();
  if (typeof amount === 'number' && !Number.isFinite(amount)) {
    throw new ValidationError('amount must be a finite decimal amount', { amount });
  }
  if (!normalized) {
    throw new ValidationError('amount is required', { amount });
  }
  if (!CANTON_DECIMAL_AMOUNT_PATTERN.test(normalized) || /^0(?:\.0+)?$/.test(normalized)) {
    throw new ValidationError('amount must be a positive decimal amount', { amount });
  }
  return normalized;
}

function normalizeDescription(description: string | null | undefined): string | null {
  const normalized = description?.trim();
  if (!normalized) return null;
  return normalized;
}

function readOptionalString(source: unknown, key: string): string | null {
  const value = objectOrEmpty(source)[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function isApiStatus(error: unknown, status: number): boolean {
  if (error instanceof ApiError) return error.status === status;
  return isRecord(error) && error['status'] === status;
}
