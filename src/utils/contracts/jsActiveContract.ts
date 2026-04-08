import {
  JsActiveContractSchema,
  type JsActiveContract,
  type JsGetActiveContractsResponseItem,
} from '../../clients/ledger-json-api/schemas/api/state';
import { ValidationError } from '../../core/errors';
import { isRecord, isString } from '../../core/utils';

export type JsActiveCreatedEvent = JsActiveContract['createdEvent'];

export type JsActiveContractItem = JsGetActiveContractsResponseItem & {
  readonly contractEntry: {
    readonly JsActiveContract: JsActiveContract;
  };
};

/** Type guard for canonical `JsActiveContract` entries returned by `getActiveContracts`. */
export function isJsActiveContractItem(item: unknown): item is JsActiveContractItem {
  if (!isRecord(item)) {
    return false;
  }

  const { contractEntry } = item;
  if (!isRecord(contractEntry) || !('JsActiveContract' in contractEntry)) {
    return false;
  }

  return JsActiveContractSchema.safeParse(contractEntry['JsActiveContract']).success;
}

function getContractEntryKeys(item: unknown): readonly string[] | undefined {
  if (!isRecord(item)) {
    return undefined;
  }

  const { contractEntry } = item;
  return isRecord(contractEntry) ? Object.keys(contractEntry) : undefined;
}

/**
 * Validates that every `getActiveContracts` row is a canonical `JsActiveContract`.
 *
 * Throws a `ValidationError` when the ledger returns another response variant such as `JsEmpty` or an incomplete entry.
 */
export function getJsActiveContractItems(
  items: readonly JsGetActiveContractsResponseItem[]
): JsActiveContractItem[] {
  return items.map((item, index) => {
    if (!isJsActiveContractItem(item)) {
      throw new ValidationError('Expected getActiveContracts to return only canonical JsActiveContract entries', {
        index,
        workflowId: isRecord(item) && isString(item['workflowId']) ? item['workflowId'] : undefined,
        contractEntryKeys: getContractEntryKeys(item),
      });
    }

    return item;
  });
}

/** Returns created events after validating that every row is a canonical `JsActiveContract`. */
export function getJsActiveCreatedEvents(
  items: readonly JsGetActiveContractsResponseItem[]
): JsActiveCreatedEvent[] {
  return getJsActiveContractItems(items).map((item) => item.contractEntry.JsActiveContract.createdEvent);
}
