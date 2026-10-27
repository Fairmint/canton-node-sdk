import { type LedgerJsonApiClient } from '../../clients';
import { isJsActiveContractItem } from '../contracts';
import { type ActiveContract } from './types';

export interface GetActiveContractsByTemplateParams {
  /** Parties whose view of the active contract set is read. Every party must be actable by the client's user. */
  parties: string[];
  /**
   * Template filters, in package-name form (`#<package-name>:<Module>:<Entity>`) or package-id form
   * (`<packageId>:<Module>:<Entity>`).
   */
  templateIds: string[];
  /**
   * When set, contracts on any other synchronizer are dropped: a submission pinned to one synchronizer cannot use them.
   * When omitted, contracts on every connected synchronizer are returned.
   */
  synchronizerId?: string;
  includeCreatedEventBlob?: boolean;
}

/**
 * Reads the active contracts of the given templates visible to `parties`.
 *
 * Empty pages (`JsEmpty` entries, returned when nothing matches) are skipped. Malformed entries are skipped rather than
 * throwing, matching the ledger's streaming semantics; use {@link isJsActiveContractItem} directly if strict validation
 * is needed.
 */
export async function getActiveContractsByTemplate(
  client: LedgerJsonApiClient,
  params: GetActiveContractsByTemplateParams
): Promise<ActiveContract[]> {
  const items = await client.getActiveContracts({
    parties: params.parties,
    templateIds: params.templateIds,
    ...(params.includeCreatedEventBlob !== undefined
      ? { includeCreatedEventBlob: params.includeCreatedEventBlob }
      : {}),
  });
  const contracts: ActiveContract[] = [];
  for (const item of items) {
    if (!isJsActiveContractItem(item)) continue;
    const { createdEvent, synchronizerId } = item.contractEntry.JsActiveContract;
    if (params.synchronizerId !== undefined && synchronizerId !== params.synchronizerId) continue;
    contracts.push({
      contractId: createdEvent.contractId,
      templateId: createdEvent.templateId,
      createArgument: createdEvent.createArgument,
      synchronizerId,
      ...(createdEvent.createdEventBlob ? { createdEventBlob: createdEvent.createdEventBlob } : {}),
    });
  }
  return contracts;
}
