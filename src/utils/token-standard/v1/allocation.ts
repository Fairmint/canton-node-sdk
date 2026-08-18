/**
 * Reserving units under an allocation, and the three ways an allocation ends.
 *
 * `AllocationFactory_Allocate` returns an `AllocationInstructionResult`, which names the allocation when the registry
 * allocates in one step. `Allocation_ExecuteTransfer`, `_Cancel` and `_Withdraw` all return holdings; the difference
 * between them is who gets them.
 */

import { findExercisedEvent, requireTransactionUpdateId } from '../../parsers/event-parser';
import {
  TOKEN_STANDARD_V1_ALLOCATION_EXIT_CHOICES,
  TOKEN_STANDARD_V1_ALLOCATION_RESULT_TAGS,
  TokenStandardV1AllocationResultTag,
  TokenStandardV1Choice,
} from './constants';
import {
  readContractIds,
  requireContractIds,
  requireKnownVariant,
  requireNonEmptyString,
  requireResultRecord,
  requireResultRecordOfAny,
} from './result';
import type { TokenStandardV1TransferStatus } from './transfer';

export interface TokenStandardV1AllocationResult {
  readonly updateId: string;
  /** A registry that allocates in one step always reports `completed`. */
  readonly status: TokenStandardV1TransferStatus;
  readonly senderChangeCids: string[];
  /** The allocation the units are now reserved under. */
  readonly allocationCid: string | undefined;
  /** The pending instruction, when the allocation did not complete in this transaction. */
  readonly allocationInstructionCid: string | undefined;
}

/**
 * The `AllocationInstructionResult` of `AllocationFactory_Allocate`.
 *
 * As with a transfer, `failed` is reported only for the standard's `_Failed` output; an undefined output tag, or a
 * result naming no output, is reported rather than read as a rejected allocation.
 */
export function parseAllocationResult(transaction: unknown): TokenStandardV1AllocationResult {
  const result = requireResultRecord(transaction, TokenStandardV1Choice.allocate);
  const updateId = requireTransactionUpdateId(transaction);
  const senderChangeCids = requireContractIds(result['senderChangeCids'], 'senderChangeCids');
  const output = requireKnownVariant(result, 'output', TOKEN_STANDARD_V1_ALLOCATION_RESULT_TAGS, 'allocation result');

  if (output.tag === TokenStandardV1AllocationResultTag.completed) {
    return {
      updateId,
      status: 'completed',
      senderChangeCids,
      allocationCid: requireNonEmptyString(output.value['allocationCid'], 'allocationCid'),
      allocationInstructionCid: undefined,
    };
  }

  if (output.tag === TokenStandardV1AllocationResultTag.pending) {
    return {
      updateId,
      status: 'pending',
      senderChangeCids,
      allocationCid: undefined,
      allocationInstructionCid: requireNonEmptyString(
        output.value['allocationInstructionCid'],
        'allocationInstructionCid'
      ),
    };
  }

  return {
    updateId,
    status: 'failed',
    senderChangeCids,
    allocationCid: undefined,
    allocationInstructionCid: undefined,
  };
}

export interface TokenStandardV1AllocationTransferResult {
  readonly updateId: string;
  /** Units returned to the sender: everything on a cancel or a withdraw, nothing on a delivery. */
  readonly senderHoldingCids: string[];
  readonly receiverHoldingCids: string[];
}

/** The result of the allocation exit in this transaction — `Allocation_ExecuteTransfer`, `_Cancel` or `_Withdraw`. */
export function parseAllocationTransferResult(transaction: unknown): TokenStandardV1AllocationTransferResult {
  const result = requireResultRecordOfAny(transaction, TOKEN_STANDARD_V1_ALLOCATION_EXIT_CHOICES);
  const exercised = findExercisedEvent(transaction, TOKEN_STANDARD_V1_ALLOCATION_EXIT_CHOICES);
  const executedTransfer = exercised?.choice === TokenStandardV1Choice.allocationExecuteTransfer;
  return {
    updateId: requireTransactionUpdateId(transaction),
    senderHoldingCids: executedTransfer
      ? readContractIds(result['senderHoldingCids'], 'senderHoldingCids')
      : requireContractIds(result['senderHoldingCids'], 'senderHoldingCids'),
    receiverHoldingCids: executedTransfer
      ? requireContractIds(result['receiverHoldingCids'], 'receiverHoldingCids')
      : readContractIds(result['receiverHoldingCids'], 'receiverHoldingCids'),
  };
}
