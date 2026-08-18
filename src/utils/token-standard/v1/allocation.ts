/**
 * Reserving units under an allocation, and the three ways an allocation ends.
 *
 * `AllocationFactory_Allocate` returns an `AllocationInstructionResult`, which names the allocation when the registry
 * allocates in one step. `Allocation_ExecuteTransfer`, `_Cancel` and `_Withdraw` all return holdings; the difference
 * between them is who gets them.
 */

import { requireTransactionUpdateId } from '../../parsers/event-parser';
import { TOKEN_STANDARD_V1_ALLOCATION_EXIT_CHOICES, TokenStandardV1Choice } from './constants';
import { readContractIds, readVariant, requireContractIds, requireResultRecord, requireResultRecordOfAny } from './result';
import type { TokenStandardV1TransferStatus } from './transfer';

export interface TokenStandardV1AllocationResult {
  readonly updateId: string;
  /** A registry that allocates in one step always reports `completed`. */
  readonly status: TokenStandardV1TransferStatus;
  readonly senderChangeCids: string[];
  /** The allocation the units are now reserved under. */
  readonly allocationCid: string | undefined;
}

/** The `AllocationInstructionResult` of `AllocationFactory_Allocate`. */
export function parseAllocationResult(transaction: unknown): TokenStandardV1AllocationResult {
  const result = requireResultRecord(transaction, TokenStandardV1Choice.allocate);
  const updateId = requireTransactionUpdateId(transaction);
  const senderChangeCids = requireContractIds(result['senderChangeCids'], 'senderChangeCids');
  const output = readVariant(result['output']);

  if (output?.tag === 'AllocationInstructionResult_Completed') {
    const allocationCid = output.value['allocationCid'];
    return {
      updateId,
      status: 'completed',
      senderChangeCids,
      allocationCid: typeof allocationCid === 'string' ? allocationCid : undefined,
    };
  }

  return {
    updateId,
    status: output?.tag === 'AllocationInstructionResult_Pending' ? 'pending' : 'failed',
    senderChangeCids,
    allocationCid: undefined,
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
  return {
    updateId: requireTransactionUpdateId(transaction),
    senderHoldingCids: readContractIds(result['senderHoldingCids']),
    receiverHoldingCids: readContractIds(result['receiverHoldingCids']),
  };
}
