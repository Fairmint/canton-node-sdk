import type { SubmitAndWaitForTransactionResponse } from '../../clients/ledger-json-api/operations/v2/commands/submit-and-wait-for-transaction';
import { isCreatedEventEntry, type TransactionCreatedEvent } from '../contracts/findCreatedEvent';

/**
 * Finds the first contract created by a transaction whose template name (the part after the last colon, e.g.
 * `FeaturedAppActivityMarker`) equals `templateName`.
 *
 * @param response - The submit-and-wait-for-transaction response
 * @param templateName - The template name to search for, without module or package
 * @returns The created event if found, undefined otherwise
 */
export function findCreatedEventByTemplateName(
  response: SubmitAndWaitForTransactionResponse,
  templateName: string
): TransactionCreatedEvent | undefined {
  for (const event of response.transaction.events) {
    if (!isCreatedEventEntry(event)) continue;
    if (event.CreatedEvent.templateId.split(':').pop() === templateName) {
      return event.CreatedEvent;
    }
  }

  return undefined;
}
