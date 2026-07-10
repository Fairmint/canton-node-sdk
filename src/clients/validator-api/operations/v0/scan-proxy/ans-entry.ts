import type { components, operations } from '../../../../../generated/apps/validator/src/main/openapi/scan-proxy';

type GeneratedAnsEntry = components['schemas']['AnsEntry'];
type GeneratedLookupByNameResponse =
  operations['lookupAnsEntryByName']['responses']['200']['content']['application/json'];
type GeneratedLookupByPartyResponse =
  operations['lookupAnsEntryByParty']['responses']['200']['content']['application/json'];

/**
 * ANS entry as serialized by Scan.
 *
 * Guardrail serializes absent optional values as JSON `null`. The upstream OpenAPI description documents this for
 * `expires_at`, but its generated type omits `null`; LocalNet also returns `null` for DSO-provided `contract_id`s.
 */
export type ScanProxyAnsEntry = Omit<GeneratedAnsEntry, 'contract_id' | 'expires_at'> & {
  contract_id?: string | null;
  expires_at?: string | null;
};

export type LookupScanProxyAnsEntryByNameResponse = Omit<GeneratedLookupByNameResponse, 'entry'> & {
  entry: ScanProxyAnsEntry;
};

export type LookupScanProxyAnsEntryByPartyResponse = Omit<GeneratedLookupByPartyResponse, 'entry'> & {
  entry: ScanProxyAnsEntry;
};
