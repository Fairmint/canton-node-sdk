import { isRecord } from '../../core/utils';

/** Reads the first valid party-details record, optionally requiring one exact party id. */
export function readMatchingExternalPartyDetails(source: unknown, partyId?: string): Record<string, unknown> | null {
  if (!isRecord(source)) return null;
  const { partyDetails } = source;
  const details = Array.isArray(partyDetails) ? partyDetails : [partyDetails];
  for (const detail of details) {
    if (!isRecord(detail)) continue;
    const { party } = detail;
    if (typeof party !== 'string' || !party.trim()) continue;
    if (partyId !== undefined && party !== partyId) continue;
    return detail;
  }
  return null;
}
