import { type SubmitAndWaitForTransactionResponse } from '../../clients/ledger-json-api/operations';
import { isRecord, isString } from '../../core/utils';

/** One entry of `transaction.events` as returned by the Ledger JSON API. */
export type TransactionEventEntry = SubmitAndWaitForTransactionResponse['transaction']['events'][number];

/** The `CreatedEvent` payload of a transaction event. */
export type TransactionCreatedEvent = Extract<TransactionEventEntry, { CreatedEvent: unknown }>['CreatedEvent'];

/** Type guard for the `{ CreatedEvent: ... }` entry of `transaction.events`. */
export function isCreatedEventEntry(event: unknown): event is { readonly CreatedEvent: TransactionCreatedEvent } {
  if (!isRecord(event)) return false;
  const created = event['CreatedEvent'];
  return isRecord(created) && isString(created['templateId']) && isString(created['contractId']);
}

/**
 * The first contract created by the transaction whose template matches `expectedTemplateId`, ignoring the package
 * component (so `#pkg-name:Module:Template`, `pkg-id:Module:Template` and `Module:Template` all match).
 */
export function findCreatedEventByTemplateId(
  response: SubmitAndWaitForTransactionResponse,
  expectedTemplateId: string
): TransactionCreatedEvent | undefined {
  const expectedTemplateIdSuffix = expectedTemplateId.includes(':')
    ? expectedTemplateId.substring(expectedTemplateId.indexOf(':') + 1)
    : expectedTemplateId;

  for (const event of response.transaction.events) {
    if (!isCreatedEventEntry(event)) continue;
    const created = event.CreatedEvent;
    const actualTemplateIdSuffix = created.templateId.includes(':')
      ? created.templateId.substring(created.templateId.indexOf(':') + 1)
      : created.templateId;

    if (actualTemplateIdSuffix === expectedTemplateIdSuffix) {
      return created;
    }
  }
  return undefined;
}
