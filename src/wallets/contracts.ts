/**
 * Readers for the DA Registry contracts a holder acts on: mint offers, transfer offers, burn requests and transfer
 * preapprovals. Each returns null for a contract of another template or package, or one whose create argument does not
 * read.
 */
import { readInstrumentId } from './instrument';
import { isRecord, nonEmptyString } from './json';
import { DA_REGISTRY_TEMPLATES } from '../da-registry/templates';
import { isTemplate } from './templates';
import type { ActiveContract, InstrumentId } from './types';
import { TOKEN_STANDARD_V1_REASON_META_KEY } from '../utils/token-standard/v1/constants';

interface RegistryParties {
  /** DA's operator party. */
  readonly operator: string;
  /** The registry provider serving the registrar; trusted only when the registry client lists it for the registrar. */
  readonly provider: string;
}

export interface MintOffer extends RegistryParties {
  readonly contractId: string;
  readonly holder: string;
  readonly instrumentId: InstrumentId;
  readonly amount: string;
  readonly reference: string;
  /** The mint's reason metadata (the issuer's note to the holder), when present. */
  readonly memo: string | null;
  readonly requestedAt: string;
  readonly executeBefore: string;
}

export interface TransferOffer extends RegistryParties {
  readonly contractId: string;
  readonly sender: string;
  readonly receiver: string;
  readonly instrumentId: InstrumentId;
  readonly amount: string;
  /** The transfer's reason metadata (the sender's memo), when present. */
  readonly memo: string | null;
  readonly requestedAt: string;
  readonly executeBefore: string;
}

export interface BurnRequest extends RegistryParties {
  readonly contractId: string;
  readonly holder: string;
  readonly instrumentId: InstrumentId;
  readonly amount: string;
  readonly reference: string;
  /** The burn's reason metadata, when present. */
  readonly memo: string | null;
  readonly requestedAt: string;
  readonly executeBefore: string;
  /** The holding DA locked for the burn: the registrar's accept burns it, a reject or cancel unlocks it. */
  readonly lockedHoldingCid: string;
}

/** The receiver's standing acceptance of an instrument admin's transfers, so they complete at once. */
export interface TransferPreapproval {
  readonly contractId: string;
  /** DA's operator party. */
  readonly operator: string;
  readonly receiver: string;
  readonly instrumentAdmin: string;
  /** The instruments it covers; empty: every instrument of `instrumentAdmin`. */
  readonly instrumentIds: readonly string[];
}

/** Fields that must all be non-empty strings, or null. */
function strings<K extends string>(source: Record<string, unknown>, keys: readonly K[]): Record<K, string> | null {
  const result: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const value = nonEmptyString(source[key]);
    if (value === undefined) return null;
    result[key] = value;
  }
  return result as Record<K, string>;
}

/** Text fields that may be empty (a reference can be ""). */
function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** The reason (memo) a CIP-56 payload's `meta.values` carries, or null when there is none. */
function reasonMemo(payload: Record<string, unknown>): string | null {
  const { meta } = payload;
  const values = isRecord(meta) ? meta['values'] : undefined;
  return isRecord(values) ? text(values[TOKEN_STANDARD_V1_REASON_META_KEY]) : null;
}

function argumentsOf(contract: ActiveContract, templateId: string): Record<string, unknown> | null {
  return isTemplate(contract, templateId) ? contract.createArgument : null;
}

/**
 * A DA `MintOffer` (`{operator, provider, mint: {instrumentId, amount, holder, reference, requestedAt, executeBefore,
 * meta}}`). `memo` is the mint's `meta` reason, the same key a transfer's memo uses.
 */
export function parseMintOffer(contract: ActiveContract): MintOffer | null {
  const args = argumentsOf(contract, DA_REGISTRY_TEMPLATES.mintOffer);
  const mint = args?.['mint'];
  if (args === null || !isRecord(mint)) return null;
  const parties = strings(args, ['operator', 'provider']);
  const fields = strings(mint, ['holder', 'amount', 'requestedAt', 'executeBefore']);
  const instrumentId = readInstrumentId(mint['instrumentId']);
  const reference = text(mint['reference']);
  if (!parties || !fields || !instrumentId || reference === null) return null;
  return {
    contractId: contract.contractId,
    ...parties,
    ...fields,
    instrumentId,
    reference,
    memo: reasonMemo(mint),
  };
}

/** A DA `TransferOffer` (`{operator, provider, transfer: CIP-56 Transfer}`), a CIP-56 TransferInstruction. */
export function parseTransferOffer(contract: ActiveContract): TransferOffer | null {
  const args = argumentsOf(contract, DA_REGISTRY_TEMPLATES.transferOffer);
  const transfer = args?.['transfer'];
  if (args === null || !isRecord(transfer)) return null;
  const parties = strings(args, ['operator', 'provider']);
  const fields = strings(transfer, ['sender', 'receiver', 'amount', 'requestedAt', 'executeBefore']);
  const instrumentId = readInstrumentId(transfer['instrumentId']);
  if (!parties || !fields || !instrumentId) return null;
  return {
    contractId: contract.contractId,
    ...parties,
    ...fields,
    instrumentId,
    memo: reasonMemo(transfer),
  };
}

/** A DA `BurnRequest` (`{operator, provider, burn: {..., meta}, lockedHoldingCid}`); `memo` is the burn's `meta` reason. */
export function parseBurnRequest(contract: ActiveContract): BurnRequest | null {
  const args = argumentsOf(contract, DA_REGISTRY_TEMPLATES.burnRequest);
  const burn = args?.['burn'];
  if (args === null || !isRecord(burn)) return null;
  const parties = strings(args, ['operator', 'provider', 'lockedHoldingCid']);
  const fields = strings(burn, ['holder', 'amount', 'requestedAt', 'executeBefore']);
  const instrumentId = readInstrumentId(burn['instrumentId']);
  const reference = text(burn['reference']);
  if (!parties || !fields || !instrumentId || reference === null) return null;
  return {
    contractId: contract.contractId,
    ...parties,
    ...fields,
    instrumentId,
    reference,
    memo: reasonMemo(burn),
  };
}

/** A DA `TransferPreapproval` (`{operator, receiver, instrumentAdmin, instrumentAllowances: [{id}]}`). */
export function parseTransferPreapproval(contract: ActiveContract): TransferPreapproval | null {
  const args = argumentsOf(contract, DA_REGISTRY_TEMPLATES.transferPreapproval);
  const allowances = args?.['instrumentAllowances'];
  if (args === null || !Array.isArray(allowances)) return null;
  const parties = strings(args, ['operator', 'receiver', 'instrumentAdmin']);
  const instrumentIds = allowances.map((allowance: unknown) =>
    isRecord(allowance) ? nonEmptyString(allowance['id']) : undefined
  );
  if (!parties || instrumentIds.includes(undefined)) return null;
  return {
    contractId: contract.contractId,
    ...parties,
    instrumentIds: instrumentIds.filter((id): id is string => id !== undefined),
  };
}

/**
 * Whether a registry contract was made under a trusted registry service of its instrument admin: a trusted provider
 * signed it and it names DA's operator. The create argument alone proves nothing (any party can create a look-alike
 * from its own package with any arguments); only the provider's signature does. DA's operator is an observer of these
 * contracts, not a signatory, so it is checked in the create argument only.
 *
 * `trustedProvidersOf` resolves the providers trusted for an instrument admin (the registry client's
 * `trustedProvidersOf`; by default only the instrument admin itself, a registrar that is its own provider). It is asked
 * for this contract's own instrument admin, and a contract whose provider is not among them is refused, whatever it
 * says.
 */
export function isFromRegistry(
  contract: RegistryParties & { readonly instrumentId: InstrumentId },
  signatories: readonly string[],
  daOperator: string,
  trustedProvidersOf: (instrumentAdmin: string) => readonly string[]
): boolean {
  return (
    contract.operator === daOperator &&
    trustedProvidersOf(contract.instrumentId.admin).includes(contract.provider) &&
    signatories.includes(contract.provider)
  );
}
