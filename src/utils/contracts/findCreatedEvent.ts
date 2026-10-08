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
 * Template identity with the package component removed.
 *
 * Ledger template IDs are `package:Module:Entity` (package id or `#package-name`). A package is present only when there
 * are at least three colon-separated segments; `Module:Entity` is already package-agnostic and must be kept whole.
 */
function templateIdentity(templateId: string): string {
  const segments = templateId.split(':');
  return segments.length >= 3 ? segments.slice(1).join(':') : templateId;
}

/**
 * The first contract created by the transaction whose template matches `expectedTemplateId`, ignoring the package
 * component (so `#pkg-name:Module:Template`, `pkg-id:Module:Template` and `Module:Template` all match).
 */
export function findCreatedEventByTemplateId(
  response: SubmitAndWaitForTransactionResponse,
  expectedTemplateId: string
): TransactionCreatedEvent | undefined {
  const expectedIdentity = templateIdentity(expectedTemplateId);

  for (const event of response.transaction.events) {
    if (!isCreatedEventEntry(event)) continue;
    const created = event.CreatedEvent;
    if (templateIdentity(created.templateId) === expectedIdentity) {
      return created;
    }
  }
  return undefined;
}
