/**
 * The CIP-56 (token standard V1) registry seam: what a transfer, or an answer to a pending transfer, needs from the
 * instrument's registry off ledger. DA's Utility Registry implements it today (`createDaUtilitiesClient`); another
 * registry (for example Canton Coin) is a new implementation of this interface.
 */
import type { TransferOffer } from './contracts';
import type { JsonObject } from './json';
import { qualifiedName } from './templates';
import type { ActiveContract, ContractFilter, DisclosedContract, InstrumentId } from './types';

/** Splice `ChoiceContext` data: passed through unchanged as `extraArgs.context`. */
export interface ChoiceContextData {
  readonly values: JsonObject;
}

/** What the registry returns for a choice: its context, and the contracts to disclose with the submission. */
export interface ChoiceContext {
  readonly choiceContextData: ChoiceContextData;
  readonly disclosedContracts: readonly DisclosedContract[];
}

/** A factory to exercise, with its choice context. */
export interface FactoryWithChoiceContext extends ChoiceContext {
  readonly factoryId: string;
}

/**
 * How the registry will run a transfer:
 *
 * - `offer`: a pending transfer the receiver must accept before it expires. The sender's tokens stay locked until the
 *   offer is accepted, rejected by the receiver or withdrawn by the sender; expiry alone only stops acceptance and does
 *   not unlock them (withdraw an expired offer to get them back);
 * - `direct`: the receiver pre-approved transfers, so the holdings move at once;
 * - `self`: sender and receiver are the same party (the holdings are merged or split).
 */
export type TransferKind = 'offer' | 'direct' | 'self';

export interface TransferFactory extends FactoryWithChoiceContext {
  readonly transferKind: TransferKind;
}

/** The CIP-56 `Transfer` record. */
export interface TransferSpec {
  readonly sender: string;
  readonly receiver: string;
  /** Decimal string. */
  readonly amount: string;
  readonly instrumentId: InstrumentId;
  /** ISO-8601. */
  readonly requestedAt: string;
  /** ISO-8601. */
  readonly executeBefore: string;
  readonly inputHoldingCids: readonly string[];
  readonly meta: { readonly values: Readonly<Record<string, string>> };
}

export interface TransferFactoryArgs {
  readonly expectedAdmin: string;
  readonly transfer: TransferSpec;
}

/** An action on a pending transfer: the receiver accepts or rejects, the sender withdraws. */
export type TransferInstructionAction = 'accept' | 'reject' | 'withdraw';

/** Reads the wallet party's active contracts matching a filter (the wallet's own ACS). */
export type ReadContracts = (filter: ContractFilter) => Promise<ActiveContract[]>;

export interface TokenRegistry {
  /**
   * Whether a holding read through the CIP-56 HoldingV1 interface is one of this registry's, and genuine: of its
   * template and signed by the party that issues it (any party can create a look-alike with the wallet party as
   * observer). A wallet also holds other registries' holdings (Canton Coin, other registries' tokens); the token wallet
   * lists and spends only the ones this returns true for.
   */
  servesHolding(contract: ActiveContract): boolean;
  /**
   * Filters a token wallet reads holdings with besides the CIP-56 HoldingV1 interface, for example the registry's own
   * holding template, whose create argument still reads when the ledger could not compute a HoldingV1 view. Every read
   * of holdings (a write's fresh read and the state snapshot) uses the same filters, and the same `servesHolding`.
   */
  readonly holdingFilters?: readonly ContractFilter[];
  /**
   * This registry's pending transfers (CIP-56 TransferInstructions) visible to the wallet, read through `read` and
   * checked to be genuine (made by the registry, not a look-alike any party could create). Both directions: the caller
   * splits them by sender and receiver.
   */
  pendingTransfers(read: ReadContracts): Promise<TransferOffer[]>;
  /**
   * The filters `pendingTransfers` reads. A token wallet adds them to its one state snapshot, so listing pending
   * transfers costs no ledger read of its own; a read of any other filter goes to the wallet separately.
   */
  readonly pendingTransferFilters?: readonly ContractFilter[];
  /**
   * `Module:Entity` names of the templates this registry's transfer factory may have. A factory of any other template
   * is refused before anything is signed.
   */
  readonly expectedTransferFactoryTemplates: readonly string[];
  transferFactory(args: TransferFactoryArgs): Promise<TransferFactory>;
  transferInstructionContext(
    registrar: string,
    instructionCid: string,
    action: TransferInstructionAction
  ): Promise<ChoiceContext>;
}

/**
 * Null when `factoryId` is one of the disclosed contracts and its template is expected; otherwise why not. A registry
 * that names any other contract is refused before anything is signed.
 */
export function factoryTemplateError(
  factory: FactoryWithChoiceContext,
  expectedTemplates: readonly string[]
): string | null {
  const disclosed = factory.disclosedContracts.find((contract) => contract.contractId === factory.factoryId);
  if (!disclosed) {
    return 'The registry named a factory it did not disclose.';
  }
  const name = qualifiedName(disclosed.templateId);
  return name !== null && expectedTemplates.includes(name)
    ? null
    : `The registry named a factory of an unexpected template (${disclosed.templateId}).`;
}
