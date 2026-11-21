/**
 * Readers for the registry contracts a holder acts on: DA's mint offers, transfer offers, burn requests and transfer
 * preapprovals, and Canton Coin's transfer instructions (as transfer offers). Each returns null for a contract of
 * another template or package, or one whose create argument does not read.
 */
import { AMULET_INSTRUMENT_ID } from './amulet/constants';
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
  readonly requestedAt: string;
  readonly executeBefore: string;
}

/** Which registry a transfer offer is under: DA's Utility Registry, or Canton Coin's (the DSO's, served by Scan). */
export type TransferOfferRegistry = 'da' | 'amulet';

/**
 * A pending CIP-56 transfer (a TransferInstruction) to or from the wallet party: a DA `TransferOffer`, or a Canton Coin
 * `AmuletTransferInstruction`. One shape, so an inbox lists both alike. For Canton Coin, `operator` and `provider` are
 * both the DSO party, which runs its own registry.
 */
export interface TransferOffer extends RegistryParties {
  readonly registry: TransferOfferRegistry;
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

function argumentsOf(contract: ActiveContract, templateId: string): Record<string, unknown> | null {
  return isTemplate(contract, templateId) ? contract.createArgument : null;
}

/**
 * A DA `MintOffer` (`{operator, provider, mint: {instrumentId, amount, holder, reference, requestedAt,
 * executeBefore}}`).
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
    registry: 'da',
    contractId: contract.contractId,
    ...parties,
    ...fields,
    instrumentId,
    memo: reasonOf(transfer['meta']),
  };
}

/** The CIP-56 reason metadata (the sender's memo) of a `Metadata` value, or null. */
function reasonOf(meta: unknown): string | null {
  const values = isRecord(meta) ? meta['values'] : undefined;
  return isRecord(values) ? text(values[TOKEN_STANDARD_V1_REASON_META_KEY]) : null;
}

/**
 * Canton Coin's pending transfer (`#splice-amulet:Splice.AmuletTransferInstruction:AmuletTransferInstruction`): the
 * Amulet implementation of the token standard `TransferInstruction` interface. Signatories: the DSO (the instrument
 * admin) and the sender.
 */
export const AMULET_TRANSFER_INSTRUCTION_TEMPLATE =
  '#splice-amulet:Splice.AmuletTransferInstruction:AmuletTransferInstruction';

/**
 * An `AmuletTransferInstruction` (`{lockedAmulet, transfer: CIP-56 Transfer}`) as a {@link TransferOffer}, or null when
 * it is of another template or package, does not read, is not of Canton Coin under `dsoParty`, or was not signed by
 * both the DSO and its sender (anyone can create a look-alike in their own package; only the signatures prove it).
 */
export function parseAmuletTransferOffer(contract: ActiveContract, dsoParty: string): TransferOffer | null {
  const args = argumentsOf(contract, AMULET_TRANSFER_INSTRUCTION_TEMPLATE);
  const transfer = args?.['transfer'];
  if (args === null || !isRecord(transfer)) return null;
  const fields = strings(transfer, ['sender', 'receiver', 'amount', 'requestedAt', 'executeBefore']);
  const instrumentId = readInstrumentId(transfer['instrumentId']);
  if (!fields || !instrumentId) return null;
  if (instrumentId.admin !== dsoParty || instrumentId.id !== AMULET_INSTRUMENT_ID) return null;
  if (!contract.signatories.includes(dsoParty) || !contract.signatories.includes(fields.sender)) return null;
  return {
    registry: 'amulet',
    contractId: contract.contractId,
    operator: dsoParty,
    provider: dsoParty,
    ...fields,
    instrumentId,
    memo: reasonOf(transfer['meta']),
  };
}

/** A DA `BurnRequest` (`{operator, provider, burn: {...}, lockedHoldingCid}`). */
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
