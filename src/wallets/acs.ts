/**
 * Parse Ledger JSON API v2 active-contract entries (`JsGetActiveContractsResponse`), read through the wallet's CIP-0103
 * `ledgerApi`.
 */
import { WalletReadError } from './errors';
import { isJsonObject, isRecord, nonEmptyString } from './json';
import type { ActiveContract } from './types';

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
 * `JsIncompleteUnassigned`, `JsEmpty`) and for a contract without `packageName` (which no template filter can match).
 * Throws on an entry this parser does not recognise.
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
  const packageName = nonEmptyString(created['packageName']);
  if (packageName === undefined) return null;
  const { createArgument } = created;
  const synchronizerId = isRecord(active) ? nonEmptyString(active['synchronizerId']) : undefined;
  return {
    contractId,
    templateId,
    packageName,
    signatories: parseParties(created['signatories']),
    createArgument: isJsonObject(createArgument) ? createArgument : null,
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
