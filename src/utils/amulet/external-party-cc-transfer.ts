import { type ValidatorApiClient } from '../../clients/validator-api';
import { ApiError, ValidationError } from '../../core/errors';
import { objectOrEmpty } from '../canton-response-utils';

const DEFAULT_TRANSFER_EXPIRY_MS = 60 * 60 * 1000;

export interface PrepareExternalPartyCcTransferParams {
  /** Externally hosted party that sends the CC. */
  readonly senderPartyId: string;
  /** Receiver party ID. */
  readonly receiverPartyId: string;
  /** CC amount to send. */
  readonly amount: number | string;
  /** Optional transfer description visible in Canton transfer command state. */
  readonly description?: string;
  /** Transaction expiry. Defaults to one hour from now. */
  readonly expiresAt?: Date | string;
  /** TransferCommand nonce. Defaults to the current sender counter, or 0 when no counter exists yet. */
  readonly nonce?: number;
  /** Request verbose hashing details from the validator for troubleshooting. */
  readonly verboseHashing?: boolean;
}

export interface PreparedExternalPartyCcTransfer {
  /** Base64-encoded prepared transaction that the external party signs. */
  readonly transaction: string;
  /** Hex-encoded hash that must be signed by the external party key. */
  readonly transactionHashHex: string;
  /** Prefix for the TransferCommand contract ID created by the prepared transaction. */
  readonly transferCommandContractIdPrefix: string;
  /** Nonce used to prepare the transfer command. */
  readonly nonce: number;
  /** Expiry timestamp used to prepare the transfer command. */
  readonly expiresAt: string;
  /** Raw validator response. */
  readonly raw: Awaited<ReturnType<ValidatorApiClient['prepareTransferPreapprovalSend']>>;
}

export interface SubmitExternalPartyCcTransferParams {
  /** Externally hosted party that signed the CC transfer. */
  readonly senderPartyId: string;
  /** Base64-encoded prepared transaction returned by prepareExternalPartyCcTransfer. */
  readonly transaction: string;
  /** Hex-encoded signature over transactionHashHex. */
  readonly transactionHashSignatureHex: string;
  /** Hex-encoded raw Ed25519 public key for the external party. */
  readonly publicKeyHex: string;
}

export interface SubmittedExternalPartyCcTransfer {
  /** Canton update ID for the submitted transfer command. */
  readonly updateId: string;
  /** Raw validator response. */
  readonly raw: Awaited<ReturnType<ValidatorApiClient['submitTransferPreapprovalSend']>>;
}

/**
 * Prepares a CC transfer from an externally hosted Canton party.
 *
 * The returned transactionHashHex is the only value the browser wallet needs to sign; the SDK does not receive private
 * keys.
 */
export async function prepareExternalPartyCcTransfer(
  validatorClient: ValidatorApiClient,
  params: PrepareExternalPartyCcTransferParams
): Promise<PreparedExternalPartyCcTransfer> {
  validatePartyId('senderPartyId', params.senderPartyId);
  validatePartyId('receiverPartyId', params.receiverPartyId);
  const amount = normalizePositiveAmount(params.amount);
  const expiresAt = normalizeExpiresAt(params.expiresAt);
  const nonce = params.nonce ?? (await lookupNextNonce(validatorClient, params.senderPartyId));

  validateNonce(nonce);

  const raw = await validatorClient.prepareTransferPreapprovalSend({
    sender_party_id: params.senderPartyId,
    receiver_party_id: params.receiverPartyId,
    amount,
    expires_at: expiresAt,
    nonce,
    verbose_hashing: params.verboseHashing ?? false,
    ...(params.description ? { description: params.description } : {}),
  });

  return {
    transaction: raw.transaction,
    transactionHashHex: raw.tx_hash,
    transferCommandContractIdPrefix: raw.transfer_command_contract_id_prefix,
    nonce,
    expiresAt,
    raw,
  };
}

/** Submits an externally signed CC transfer prepared by prepareExternalPartyCcTransfer. */
export async function submitExternalPartyCcTransfer(
  validatorClient: ValidatorApiClient,
  params: SubmitExternalPartyCcTransferParams
): Promise<SubmittedExternalPartyCcTransfer> {
  validatePartyId('senderPartyId', params.senderPartyId);
  validateHex('transactionHashSignatureHex', params.transactionHashSignatureHex);
  validateHex('publicKeyHex', params.publicKeyHex);

  const raw = await validatorClient.submitTransferPreapprovalSend({
    submission: {
      party_id: params.senderPartyId,
      transaction: params.transaction,
      signed_tx_hash: params.transactionHashSignatureHex,
      public_key: params.publicKeyHex,
    },
  });

  return {
    updateId: raw.update_id,
    raw,
  };
}

async function lookupNextNonce(validatorClient: ValidatorApiClient, party: string): Promise<number> {
  try {
    const response = await validatorClient.lookupTransferCommandCounterByParty({ party });
    const responseObject = objectOrEmpty(response);
    const counter = objectOrEmpty(responseObject['transfer_command_counter']);
    const contract = objectOrEmpty(counter['contract']);
    const payload = objectOrEmpty(contract['payload']);
    const nextNonce = normalizeNonce(payload['nextNonce']);
    validateNonce(nextNonce);
    return nextNonce;
  } catch (error) {
    if (isNotFound(error)) {
      return 0;
    }
    throw error;
  }
}

function normalizeNonce(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && /^(?:0|[1-9]\d*)$/.test(value)) {
    if (BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new ValidationError('Transfer nonce must be a non-negative safe integer', { nonce: value });
    }
    return Number(value);
  }
  throw new ValidationError('Transfer command counter payload must include nextNonce as a non-negative integer', {
    nextNonce: value,
  });
}

function normalizePositiveAmount(amount: number | string): number {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value) || value <= 0) {
    throw new ValidationError('CC transfer amount must be a positive number', { amount });
  }
  return value;
}

function normalizeExpiresAt(expiresAt?: Date | string): string {
  if (expiresAt instanceof Date) {
    if (Number.isNaN(expiresAt.getTime())) {
      throw new ValidationError('expiresAt must be a valid date');
    }
    return expiresAt.toISOString();
  }

  if (typeof expiresAt === 'string') {
    const parsed = new Date(expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new ValidationError('expiresAt must be a valid date-time string', { expiresAt });
    }
    return parsed.toISOString();
  }

  return new Date(Date.now() + DEFAULT_TRANSFER_EXPIRY_MS).toISOString();
}

function validateNonce(nonce: number): void {
  if (!Number.isSafeInteger(nonce) || nonce < 0) {
    throw new ValidationError('Transfer nonce must be a non-negative safe integer', { nonce });
  }
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

function validateHex(name: string, value: string): void {
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(value)) {
    throw new ValidationError(`${name} must be hex-encoded`, { [name]: value });
  }
}

function isNotFound(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 404;
  }
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 404;
}
