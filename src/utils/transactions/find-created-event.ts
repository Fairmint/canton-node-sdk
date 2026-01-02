import type { SubmitAndWaitForTransactionTreeResponse } from '../../clients/ledger-json-api/operations/v2/commands/submit-and-wait-for-transaction-tree';
import type { CreatedTreeEvent } from '../../clients/ledger-json-api/schemas/api/events';

/**
 * Finds a CreatedTreeEvent for a given template name from a transaction tree response. The template name search
 * excludes the templateId prefix and matches the template name portion.
 *
 * @param response - The SubmitAndWaitForTransactionTreeResponse containing the transaction tree
 * @param templateName - The template name to search for (e.g., "Splice.Amulet:FeaturedAppActivityMarker")
 * @returns The CreatedTreeEvent if found, undefined otherwise
 */
export function findCreatedEventByTemplateName(
  response: SubmitAndWaitForTransactionTreeResponse,
  templateName: string
): CreatedTreeEvent | undefined {
  const { transactionTree } = response;

  // Iterate through all events in the transaction tree
  for (const event of Object.values(transactionTree.eventsById)) {
    // Check if this is a CreatedTreeEvent
    if ('CreatedTreeEvent' in event) {
      const typedEvent = event as { CreatedTreeEvent: { value: { templateId: string } } };
      const createdEvent = typedEvent.CreatedTreeEvent.value;
      const fullTemplateId = createdEvent.templateId;

      // Extract the template name part (after the last colon)
      const templateNamePart = fullTemplateId.split(':').pop();

      if (templateNamePart === templateName) {
        return event as unknown as CreatedTreeEvent;
      }
    }
  }

  return undefined;
}
