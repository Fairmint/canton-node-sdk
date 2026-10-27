/**
 * Readers and small Daml-value helpers for Digital Asset's Registry: claims, credential requirements and party sets, as
 * the JSON Ledger API encodes them.
 */

/** A Daml `(Text, Text)` tuple as the JSON Ledger API encodes it. */
export interface DamlTuple2 {
  _1: string;
  _2: string;
}

/** One credential claim: `property=value` (for example `canTransfer=CNTN`). */
export interface ClaimSpec {
  property: string;
  value: string;
}

/** `InstrumentIdentifier.scheme` for an instrument the registrar defines itself. */
export const DA_REGISTRAR_INTERNAL_SCHEME = 'RegistrarInternalScheme';

export interface PartyCredentialRequirement {
  issuer: string;
  requiredClaims: DamlTuple2[];
}

export function credentialRequirement(issuer: string, claim: ClaimSpec): PartyCredentialRequirement {
  return { issuer, requiredClaims: [{ _1: claim.property, _2: claim.value }] };
}

/** A Daml `DA.Set.Set Party`. */
export function partySet(parties: string[]): { map: Array<[string, Record<string, never>]> } {
  return { map: [...new Set(parties)].sort().map((p) => [p, {}]) };
}

export function partySetMembers(value: unknown): string[] {
  const map = (value as { map?: unknown } | null)?.map;
  if (!Array.isArray(map)) return [];
  return map.map((entry) => (Array.isArray(entry) ? String(entry[0]) : String(entry)));
}

/** Normalizes a `(Text, Text)` claim read from the ledger (`{_1,_2}`) or DA's REST API (`{property,value}`). */
export function readClaimTuple(value: unknown): ClaimSpec {
  const v = value as Record<string, unknown>;
  return { property: String(v['_1'] ?? v['property']), value: String(v['_2'] ?? v['value']) };
}

export function readRequirements(value: unknown): Array<{ issuer: string; claims: ClaimSpec[] }> {
  if (!Array.isArray(value)) return [];
  return value.map((r: Record<string, unknown>) => ({
    issuer: String(r['issuer']),
    claims: Array.isArray(r['requiredClaims']) ? r['requiredClaims'].map(readClaimTuple) : [],
  }));
}

function requirementKey(r: { issuer: string; claims: ClaimSpec[] }): string {
  // JSON keeps claim pairs unambiguous both for equality and for the sort itself: a delimiter-joined key would
  // equate one claim `a=1,b=2` with two claims, and comma-stringified pairs would sort `('a','b,c')` and
  // `('a,b','c')` identically.
  return JSON.stringify([r.issuer, r.claims.map((c) => JSON.stringify([c.property, c.value])).sort()]);
}

/** Order-insensitive equality of two requirement lists. */
export function sameRequirements(
  a: Array<{ issuer: string; claims: ClaimSpec[] }>,
  b: Array<{ issuer: string; claims: ClaimSpec[] }>
): boolean {
  const ka = a.map(requirementKey).sort();
  const kb = b.map(requirementKey).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

/** Daml `Optional Bool` read back from the ledger: absent and `null` are both None. */
export function readOptionalBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}
