/**
 * Node-sdk's check of a prepared transaction before an external party's key signs its hash, and again before a signed
 * one is submitted. Internal: not exported from the package.
 *
 * A participant (or a validator, on the participant's behalf) answers a prepare request with the prepared transaction
 * and its hash. Node-sdk never hands a signer the participant's word for that hash: `@fairmint/canton-protocol/
 * transaction` recomputes the hash from the transaction bytes under the hashing scheme node-sdk asked for, compares it
 * with the participant's, and checks that the transaction's own metadata acts as the requested parties, under the
 * requested command id, on the requested synchronizer. Only the recomputed hash is returned to be signed.
 *
 * Where node-sdk did not choose the command id or the synchronizer (a validator prepares the transfer-preapproval
 * setup, and a caller submits a transaction it prepared elsewhere), they are read from the transaction itself, so the
 * check still recomputes the hash and checks the acting parties exactly.
 */
import { PreparedTransaction } from '@canton-network/core-ledger-proto';
import {
  type CantonProtocolError,
  type HashingScheme,
  isCantonProtocolError,
  verifyPreparedTransaction,
} from '@fairmint/canton-protocol/transaction';
import { OperationError, OperationErrorCode, ValidationError } from '../../core/errors';
import { callerInputError } from './party-identity';

/** What the prepared transaction must state. */
export interface PreparedTransactionExpectation {
  /** The parties it must act as: the exact set. */
  readonly actAs: readonly string[];
  /** The command id requested. Omitted: the one the transaction states (when another party chose it). */
  readonly commandId?: string | undefined;
  /** The synchronizer requested. Omitted: the one the transaction states (when another party chose it). */
  readonly synchronizerId?: string | undefined;
}

/** A participant's answer to a prepare request, with what node-sdk asked for. */
export interface ParticipantPreparedTransaction {
  /** Names the request in error messages, e.g. `interactive submission prepare`. */
  readonly operation: string;
  readonly preparedTransaction: unknown;
  /** The participant's hash of it: hex or base64, 32 bytes. */
  readonly preparedTransactionHash: unknown;
  /** The scheme node-sdk asked the transaction to be prepared under. */
  readonly hashingScheme: HashingScheme;
  /**
   * The scheme the answer names. Omit only for an answer that names none (a validator's): an answer naming another
   * scheme than the one requested is refused, so a participant cannot downgrade V3 to V2.
   */
  readonly answeredHashingScheme?: unknown;
  readonly expected: PreparedTransactionExpectation;
}

/** A prepared transaction whose hash node-sdk recomputed. */
export interface VerifiedPreparedTransaction {
  readonly preparedTransaction: string;
  /** The recomputed hash, 64 lowercase hex characters: what the party signs. */
  readonly preparedTransactionHashHex: string;
  readonly hashingSchemeVersion: HashingScheme;
}

/** A signed prepared transaction a caller submits. */
export interface SubmittedPreparedTransaction {
  readonly preparedTransaction: string;
  /** The hash the party signed: 32 bytes, hex. */
  readonly preparedTransactionHashHex: string;
  /** The scheme it is executed under. */
  readonly hashingScheme: HashingScheme;
  readonly expected: PreparedTransactionExpectation;
}

const PREPARED_HASH_HEX_PATTERN = /^[0-9a-fA-F]{64}$/;
/**
 * Stands in for a command id or synchronizer the transaction does not state (or that cannot be read): it never equals a
 * transaction's own value, so canton-protocol still recomputes the hash first and then refuses the metadata.
 */
const UNSTATED = '(not stated by the prepared transaction)';

/**
 * Verifies a participant's prepared transaction and resolves its recomputed hash. A refusal of the participant's answer
 * (another scheme, no transaction, a hash that is not the transaction's, a transaction that cannot be hashed or that
 * does not state what was asked) is an {@link OperationError} (`TRANSACTION_FAILED`) with canton-protocol's refusal as
 * `cause` and its `code` and `field` in the context; an invalid expectation (caller input) is a {@link ValidationError}.
 * Nothing may be signed when it rejects.
 */
export async function verifyParticipantPreparedTransaction(
  input: ParticipantPreparedTransaction
): Promise<VerifiedPreparedTransaction> {
  if ('answeredHashingScheme' in input && input.answeredHashingScheme !== input.hashingScheme) {
    throw new OperationError(
      `Canton ${input.operation} response is prepared under another hashing scheme than requested`,
      OperationErrorCode.TRANSACTION_FAILED,
      { requestedHashingScheme: input.hashingScheme, answeredHashingScheme: String(input.answeredHashingScheme) }
    );
  }
  if (typeof input.preparedTransaction !== 'string' || input.preparedTransaction.trim() === '') {
    throw new OperationError(
      `Canton ${input.operation} response did not include a prepared transaction`,
      OperationErrorCode.TRANSACTION_FAILED
    );
  }
  if (typeof input.preparedTransactionHash !== 'string') {
    throw new OperationError(
      `Canton ${input.operation} response did not include a valid prepared hash`,
      OperationErrorCode.TRANSACTION_FAILED
    );
  }
  const { preparedTransaction } = input;
  try {
    const verified = await verifyPreparedTransaction({
      preparedTransaction,
      hashingScheme: input.hashingScheme,
      hash: input.preparedTransactionHash,
      expected: expectedSubject(preparedTransaction, input.expected),
    });
    return {
      preparedTransaction,
      preparedTransactionHashHex: verified.hash,
      hashingSchemeVersion: input.hashingScheme,
    };
  } catch (error) {
    if (!isCantonProtocolError(error) || error.code === 'UNSUPPORTED') throw error;
    if (error.code === 'INVALID_INPUT' && error.field?.startsWith('expected') === true) {
      throw callerInputError(error);
    }
    throw withCause(
      new OperationError(participantRefusalMessage(input.operation, error), OperationErrorCode.TRANSACTION_FAILED, {
        ...refusalContext(error),
      }),
      error
    );
  }
}

/**
 * Checks, before a signed prepared transaction is submitted, that the signed hash is the hash of the transaction bytes
 * under the scheme it is executed with, and that the transaction states what is expected. Every refusal is a
 * {@link ValidationError} (caller input) with canton-protocol's refusal as `cause` where it made it; nothing may be
 * submitted when it rejects.
 */
export async function assertSubmittedPreparedTransaction(input: SubmittedPreparedTransaction): Promise<void> {
  if (
    typeof input.preparedTransactionHashHex !== 'string' ||
    !PREPARED_HASH_HEX_PATTERN.test(input.preparedTransactionHashHex.trim())
  ) {
    throw new ValidationError('preparedTransactionHashHex must be a 32-byte prepared-transaction hash, hex', {
      preparedTransactionHashHex: input.preparedTransactionHashHex,
    });
  }
  if (typeof input.preparedTransaction !== 'string' || input.preparedTransaction.trim() === '') {
    throw new ValidationError('preparedTransaction is required');
  }
  try {
    await verifyPreparedTransaction({
      preparedTransaction: input.preparedTransaction,
      hashingScheme: input.hashingScheme,
      hash: input.preparedTransactionHashHex,
      expected: expectedSubject(input.preparedTransaction, input.expected),
    });
  } catch (error) {
    if (!isCantonProtocolError(error) || error.code === 'UNSUPPORTED') throw error;
    if (error.code === 'INVALID_INPUT') throw callerInputError(error);
    throw withCause(new ValidationError(submittedRefusalMessage(error), refusalContext(error)), error);
  }
}

/** The expectation with any omitted command id or synchronizer read from the transaction itself. */
function expectedSubject(
  preparedTransaction: string,
  expected: PreparedTransactionExpectation
): { actAs: readonly string[]; commandId: string; synchronizerId: string } {
  if (expected.commandId !== undefined && expected.synchronizerId !== undefined) {
    return { actAs: expected.actAs, commandId: expected.commandId, synchronizerId: expected.synchronizerId };
  }
  const stated = readStatedMetadata(preparedTransaction);
  return {
    actAs: expected.actAs,
    commandId: expected.commandId ?? (stated.commandId || UNSTATED),
    synchronizerId: expected.synchronizerId ?? (stated.synchronizerId || UNSTATED),
  };
}

/**
 * The command id and synchronizer the transaction states, or empty strings when its bytes cannot be read (canton-
 * protocol then refuses the transaction itself: it hashes the same bytes, strictly, before comparing any metadata).
 */
function readStatedMetadata(preparedTransaction: string): { commandId: string; synchronizerId: string } {
  try {
    const { metadata } = PreparedTransaction.fromBinary(Buffer.from(preparedTransaction, 'base64'));
    return {
      commandId: metadata?.submitterInfo?.commandId ?? '',
      synchronizerId: metadata?.synchronizerId ?? '',
    };
  } catch {
    return { commandId: '', synchronizerId: '' };
  }
}

function participantRefusalMessage(operation: string, error: CantonProtocolError): string {
  if (error.code === 'HASH_MISMATCH') {
    return `Canton ${operation} response hash is not the hash of its prepared transaction`;
  }
  if (error.code === 'UNEXPECTED') {
    return `Canton ${operation} response prepared transaction does not state the requested ${error.field ?? 'details'}`;
  }
  if (error.code === 'UNDECODABLE') return `Canton ${operation} response prepared transaction cannot be hashed`;
  return error.field === 'hash'
    ? `Canton ${operation} response did not include a valid prepared hash`
    : `Canton ${operation} response did not include a valid prepared transaction`;
}

function submittedRefusalMessage(error: CantonProtocolError): string {
  if (error.code === 'HASH_MISMATCH') return 'preparedTransactionHashHex is not the hash of preparedTransaction';
  if (error.code === 'UNEXPECTED') return `preparedTransaction does not state the expected ${error.field ?? 'details'}`;
  return 'preparedTransaction cannot be decoded and hashed';
}

function refusalContext(error: CantonProtocolError): Record<string, string> {
  return { code: error.code, ...(error.field === undefined ? {} : { field: error.field }) };
}

function withCause<E extends Error>(wrapper: E, cause: unknown): E {
  Object.defineProperty(wrapper, 'cause', { value: cause, enumerable: false, writable: true });
  return wrapper;
}
