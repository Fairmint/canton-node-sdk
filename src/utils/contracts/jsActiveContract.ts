import { type JsGetActiveContractsResponseItem } from '../../clients/ledger-json-api/schemas/api/state';
import { ValidationError } from '../../core/errors';
import { isRecord, isString } from '../../core/utils';

export interface JsActiveCreatedEvent {
  readonly contractId: string;
  readonly templateId: string;
  readonly createArgument: Readonly<Record<string, unknown>>;
}

export interface JsActiveContract {
  readonly createdEvent: JsActiveCreatedEvent;
}

export type JsActiveContractItem = JsGetActiveContractsResponseItem & {
  readonly contractEntry: {
    readonly JsActiveContract: JsActiveContract;
  };
};

function isJsActiveCreatedEvent(event: unknown): event is JsActiveCreatedEvent {
  if (!isRecord(event)) {
    return false;
  }

  return isString(event['contractId']) && isString(event['templateId']) && isRecord(event['createArgument']);
}

/** Type guard for `JsActiveContract` entries with the minimal fields generic consumers can safely rely on. */
export function isJsActiveContractItem(item: unknown): item is JsActiveContractItem {
  if (!isRecord(item)) {
    return false;
  }

  const { contractEntry } = item;
  if (!isRecord(contractEntry) || !('JsActiveContract' in contractEntry)) {
    return false;
  }

  const jsActiveContract = contractEntry['JsActiveContract'];
  return isRecord(jsActiveContract) && isJsActiveCreatedEvent(jsActiveContract['createdEvent']);
}

function getContractEntryKeys(item: unknown): readonly string[] | undefined {
  if (!isRecord(item)) {
    return undefined;
  }

  const { contractEntry } = item;
  return isRecord(contractEntry) ? Object.keys(contractEntry) : undefined;
}

/**
 * Validates that every `getActiveContracts` row is a `JsActiveContract` entry with the minimum created-event fields
 * generic helpers consume.
 *
 * Throws a `ValidationError` when the ledger returns another response variant such as `JsEmpty` or a malformed active
 * contract row missing `contractId`, `templateId`, or `createArgument`.
 */
export function getJsActiveContractItems(
  items: readonly JsGetActiveContractsResponseItem[]
): readonly JsActiveContractItem[] {
  return items.map((item, index) => {
    if (!isJsActiveContractItem(item)) {
      throw new ValidationError(
        'Expected getActiveContracts to return only JsActiveContract entries with contractId, templateId, and createArgument',
        {
          index,
          workflowId: isRecord(item) && isString(item['workflowId']) ? item['workflowId'] : undefined,
          contractEntryKeys: getContractEntryKeys(item),
        }
      );
    }

    return item;
  });
}

/** Returns created events after validating the minimal fields generic `JsActiveContract` consumers rely on. */
export function getJsActiveCreatedEvents(
  items: readonly JsGetActiveContractsResponseItem[]
): readonly JsActiveCreatedEvent[] {
  return getJsActiveContractItems(items).map((item) => item.contractEntry.JsActiveContract.createdEvent);
}
