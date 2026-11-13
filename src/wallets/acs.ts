/**
 * Parse Ledger JSON API v2 active-contract entries (`JsGetActiveContractsResponse`), read through the wallet's CIP-0103
 * `ledgerApi`.
 */
import { WalletReadError } from './errors';
import { isJsonObject, isRecord, nonEmptyString } from './json';
import type { ActiveContract, InterfaceView } from './types';

/** A view the ledger computed: no `viewStatus`, or a status code of 0. */
function viewSucceeded(view: Record<string, unknown>): boolean {
  const status = view['viewStatus'];
  if (status === undefined || status === null) return true;
  if (!isRecord(status)) return false;
  const { code } = status;
  return code === undefined || code === 0 || code === '0';
}

function parseInterfaceViews(value: unknown): InterfaceView[] {
  if (!Array.isArray(value)) return [];
  const views: InterfaceView[] = [];
  for (const view of value) {
    if (!isRecord(view) || !viewSucceeded(view)) continue;
    const interfaceId = nonEmptyString(view['interfaceId']);
    const { viewValue } = view;
    if (interfaceId !== undefined && isJsonObject(viewValue)) {
      views.push({ interfaceId, viewValue });
    }
  }
  return views;
}

/** A party list; anything else reads as no parties, so a contract without signatories counts as signed by no one. */
function parseParties(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((party) => {
    const id = nonEmptyString(party);
    return id === undefined ? [] : [id];
  });
}

/**
 * One ACS entry as an `ActiveContract`, or null for entries that are not active contracts (`JsIncompleteAssigned`,
 * `JsIncompleteUnassigned`, `JsEmpty`). Throws on an entry this parser does not recognise.
 */
export function parseActiveContractEntry(entry: unknown): ActiveContract | null {
  if (!isRecord(entry) || !isRecord(entry['contractEntry'])) {
    throw new WalletReadError('The wallet returned an active-contract entry without contractEntry');
  }
  const active = entry['contractEntry']['JsActiveContract'];
  if (active === undefined) return null;
  const created = isRecord(active) ? active['createdEvent'] : undefined;
  if (!isRecord(created)) {
    throw new WalletReadError('The wallet returned an active contract without createdEvent');
  }
  const contractId = nonEmptyString(created['contractId']);
  const templateId = nonEmptyString(created['templateId']);
  if (contractId === undefined || templateId === undefined) {
    throw new WalletReadError('The wallet returned an active contract without contractId or templateId');
  }
  const { createArgument } = created;
  const createdEventBlob = nonEmptyString(created['createdEventBlob']);
  const packageName = nonEmptyString(created['packageName']);
  const synchronizerId = isRecord(active) ? nonEmptyString(active['synchronizerId']) : undefined;
  return {
    contractId,
    templateId,
    ...(packageName !== undefined && { packageName }),
    signatories: parseParties(created['signatories']),
    createArgument: isJsonObject(createArgument) ? createArgument : null,
    interfaceViews: parseInterfaceViews(created['interfaceViews']),
    ...(createdEventBlob !== undefined && { createdEventBlob }),
    ...(synchronizerId !== undefined && { synchronizerId }),
  };
}

/** Every active contract in a list of ACS entries. */
export function parseActiveContractEntries(entries: readonly unknown[]): ActiveContract[] {
  return entries.flatMap((entry) => {
    const contract = parseActiveContractEntry(entry);
    return contract === null ? [] : [contract];
  });
}
