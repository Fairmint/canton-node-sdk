import { type SubmitAndWaitForTransactionTreeResponse } from '../../clients/ledger-json-api/operations';

/** Canonical CreatedTreeEvent value structure from the Ledger JSON API */
export interface CreatedTreeEventValue {
  contractId: string;
  templateId: string;
  contractKey: string | null;
  createArgument: Record<string, unknown>;
  createdEventBlob: string;
  witnessParties: string[];
  signatories: string[];
  observers: string[];
  createdAt: string;
  packageName: string;
  offset: number;
  nodeId: number;
  interfaceViews: string[];
  implementedInterfaces?: string[];
}

export interface CreatedTreeEventWrapper {
  CreatedTreeEvent: {
    value: CreatedTreeEventValue;
  };
}

function isCreatedTreeEventWrapper(event: unknown): event is CreatedTreeEventWrapper {
  if (!event || typeof event !== 'object') return false;
  const e = event as { CreatedTreeEvent?: { value?: unknown } };
  return Boolean(e.CreatedTreeEvent) && typeof e.CreatedTreeEvent === 'object' && 'value' in e.CreatedTreeEvent;
}

export function findCreatedEventByTemplateId(
  response: SubmitAndWaitForTransactionTreeResponse,
  expectedTemplateId: string
): CreatedTreeEventWrapper | undefined {
  // Canonical structure: transactionTree.eventsById
  const { transactionTree } = response;

  const { eventsById } = transactionTree as { eventsById?: Record<string, unknown> };
  if (!eventsById || typeof eventsById !== 'object') {
    return undefined;
  }

  // Extract the part after the first ':' from the expected template ID for matching
  const expectedTemplateIdSuffix = expectedTemplateId.includes(':')
    ? expectedTemplateId.substring(expectedTemplateId.indexOf(':') + 1)
    : expectedTemplateId;

  for (const event of Object.values(eventsById)) {
    if (isCreatedTreeEventWrapper(event)) {
      const created = event.CreatedTreeEvent.value;
      if (created.templateId) {
        // Extract the part after the first ':' from the actual template ID
        const actualTemplateIdSuffix = created.templateId.includes(':')
          ? created.templateId.substring(created.templateId.indexOf(':') + 1)
          : created.templateId;

        if (actualTemplateIdSuffix === expectedTemplateIdSuffix) {
          return event;
        }
      }
    }
  }
  return undefined;
}
