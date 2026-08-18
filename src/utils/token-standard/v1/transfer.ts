/**
 * What became of a transfer: delivered, waiting on the receiver, or returned to the sender.
 *
 * `TransferInstructionResult.output` is the only thing that says which, and all five transfer choices return it, so one
 * reader covers instructing, accepting, rejecting, withdrawing and expiring.
 */

import { requireTransactionUpdateId } from '../../parsers/event-parser';
import {
  TOKEN_STANDARD_V1_TRANSFER_RESULT_CHOICES,
  TOKEN_STANDARD_V1_TRANSFER_RESULT_TAGS,
  TokenStandardV1TransferResultTag,
} from './constants';
import { requireContractIds, requireKnownVariant, requireResultRecordOfAny } from './result';

/** What became of the units: delivered, waiting on the receiver, or returned to the sender. */
export type TokenStandardV1TransferStatus = 'completed' | 'pending' | 'failed';

export interface TokenStandardV1TransferResult {
  readonly updateId: string;
  readonly status: TokenStandardV1TransferStatus;
  /** Change back to the sender, and on a failed path the returned units themselves. */
  readonly senderChangeCids: string[];
  /** The receiver's new holdings, on a completed transfer. */
  readonly receiverHoldingCids: string[];
  /** The pending offer, when the transfer did not complete in this transaction. */
  readonly transferInstructionCid: string | undefined;
}

/**
 * The `TransferInstructionResult` of whichever of the five transfer choices this transaction exercised.
 *
 * `failed` is reported only for the standard's `_Failed` output, which says the units went back to the sender. An
 * output the standard does not define, or a result naming none at all, is a failure to read the transaction rather than
 * a transfer that failed.
 */
export function parseTransferResult(transaction: unknown): TokenStandardV1TransferResult {
  const result = requireResultRecordOfAny(transaction, TOKEN_STANDARD_V1_TRANSFER_RESULT_CHOICES);
  const updateId = requireTransactionUpdateId(transaction);
  const senderChangeCids = requireContractIds(result['senderChangeCids'], 'senderChangeCids');
  const output = requireKnownVariant(result, 'output', TOKEN_STANDARD_V1_TRANSFER_RESULT_TAGS, 'transfer result');

  if (output.tag === TokenStandardV1TransferResultTag.completed) {
    return {
      updateId,
      status: 'completed',
      senderChangeCids,
      receiverHoldingCids: requireContractIds(output.value['receiverHoldingCids'], 'receiverHoldingCids'),
      transferInstructionCid: undefined,
    };
  }

  if (output.tag === TokenStandardV1TransferResultTag.pending) {
    const { transferInstructionCid } = output.value;
    return {
      updateId,
      status: 'pending',
      senderChangeCids,
      receiverHoldingCids: [],
      transferInstructionCid: typeof transferInstructionCid === 'string' ? transferInstructionCid : undefined,
    };
  }

  return {
    updateId,
    status: 'failed',
    senderChangeCids,
    receiverHoldingCids: [],
    transferInstructionCid: undefined,
  };
}
