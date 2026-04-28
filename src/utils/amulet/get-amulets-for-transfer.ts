import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { extractString, isNumber, isRecord, isString } from '../../core/utils';
import { isJsActiveContractItem } from '../contracts';

export interface AmuletForTransfer {
  readonly contractId: string;
  readonly templateId: string;
  readonly effectiveAmount: string;
  readonly owner: string;
}

export type TransferInputForTransfer =
  | {
      readonly tag: 'InputAmulet';
      readonly contractId: string;
      readonly templateId: string;
      readonly effectiveAmount: string;
      readonly owner: string;
    }
  | {
      readonly tag: 'InputAppRewardCoupon';
      readonly contractId: string;
      readonly templateId: string;
      readonly effectiveAmount: string;
      readonly beneficiary: string;
    }
  | {
      readonly tag: 'InputValidatorRewardCoupon';
      readonly contractId: string;
      readonly templateId: string;
      readonly effectiveAmount: string;
      readonly beneficiary: string;
    };

export interface GetAmuletsForTransferParams {
  /** Ledger JSON API client for querying active contracts. */
  readonly jsonApiClient: LedgerJsonApiClient;
  /** Party IDs to read as (first one is used as sender). */
  readonly readAs?: readonly string[];
  /**
   * If true, returns all valid transfer inputs (Amulet, AppRewardCoupon, ValidatorRewardCoupon). Defaults to false
   * (only Amulet).
   */
  readonly includeAllTransferInputs?: boolean;
}

/** Internal contract representation with extracted data */
interface ContractData {
  contractId: string;
  templateId: string;
  payload: Record<string, unknown>;
}

/** Safely extract a number or string from an unknown value */
function extractNumericValue(value: unknown): string | number | undefined {
  if (isString(value) || isNumber(value)) return value;
  return undefined;
}

/**
 * Extract the effective amount from a contract payload. For Amulets: amount is nested as { initialAmount: string } For
 * Coupons: amount is directly a string
 */
function extractAmount(payload: Record<string, unknown>, templateId: string): string {
  if (templateId.includes('AppRewardCoupon') || templateId.includes('ValidatorRewardCoupon')) {
    // For coupons, amount is directly in payload
    const amount = extractNumericValue(payload['amount']);
    return amount !== undefined ? String(amount) : '0';
  }

  // For amulets, amount is nested: { initialAmount: string }
  const amountObj = payload['amount'];
  if (!isRecord(amountObj)) {
    return '0';
  }
  const initialAmount = extractNumericValue(amountObj['initialAmount']);
  return initialAmount !== undefined ? String(initialAmount) : '0';
}

/** Extract the owner from a contract payload. For Amulets: owner field For Coupons: beneficiary or provider field */
function extractOwner(payload: Record<string, unknown>, templateId: string): string {
  if (templateId.includes('AppRewardCoupon') || templateId.includes('ValidatorRewardCoupon')) {
    // For coupons, beneficiary is optional and falls back to provider
    return extractString(payload['beneficiary']) ?? extractString(payload['provider']) ?? '';
  }

  // For amulets, use owner field
  return extractString(payload['owner']) ?? '';
}

/**
 * Gets unlocked Amulet contracts owned by the selected sender (`readAs[0]`) plus reward coupons when enabled.
 *
 * @param params - Ledger client for ACS snapshots plus viewer scopes (`readAs`)
 * @returns Contracts sorted largest-first so greedy transfers consume highest denominations first
 *
 * @example
 * ```ts
 * const inputs = await getAmuletsForTransfer({
 *   jsonApiClient,
 *   readAs: [senderPartyId],
 * });
 * ```
 */
export async function getAmuletsForTransfer(params: GetAmuletsForTransferParams): Promise<AmuletForTransfer[]> {
  const { jsonApiClient, readAs, includeAllTransferInputs } = params;

  // Query ledger for active contracts for this party
  if (!readAs?.[0]) {
    return [];
  }
  const senderParty = readAs[0];

  // Build template IDs to query based on includeAllTransferInputs flag
  const templateIds = includeAllTransferInputs
    ? [
        '#splice-amulet:Splice.Amulet:Amulet',
        '#splice-amulet:Splice.Amulet:AppRewardCoupon',
        '#splice-amulet:Splice.Amulet:ValidatorRewardCoupon',
      ]
    : ['#splice-amulet:Splice.Amulet:Amulet'];

  const activeContracts = await jsonApiClient.getActiveContracts({
    parties: [senderParty],
    templateIds,
  });

  const allContracts: ContractData[] = [];
  const contractsArr = Array.isArray(activeContracts) ? activeContracts : [];

  for (const ctr of contractsArr) {
    // Only handle the canonical JsActiveContract format
    if (!isJsActiveContractItem(ctr)) {
      continue;
    }

    const { createdEvent } = ctr.contractEntry.JsActiveContract;
    const { templateId, contractId, createArgument: payload } = createdEvent;

    // Filter for valid transfer input contracts
    const isUnlockedAmulet = templateId.includes('Splice.Amulet:Amulet') && !templateId.includes('LockedAmulet');
    const isAppRewardCoupon = templateId.includes('AppRewardCoupon');
    const isValidatorRewardCoupon = templateId.includes('ValidatorRewardCoupon');

    if (!isUnlockedAmulet && !isAppRewardCoupon && !isValidatorRewardCoupon) {
      continue;
    }

    allContracts.push({ contractId, templateId, payload });
  }

  // Filter contracts owned by sender and with positive balance
  const partyContracts = allContracts.filter((c) => {
    const owner = extractOwner(c.payload, c.templateId);
    const amount = parseFloat(extractAmount(c.payload, c.templateId));
    return amount > 0 && owner === senderParty;
  });

  if (partyContracts.length === 0) {
    return [];
  }

  // Sort biggest → smallest so we pick high-value contracts first
  partyContracts.sort((a, b) => {
    const amountA = parseFloat(extractAmount(a.payload, a.templateId));
    const amountB = parseFloat(extractAmount(b.payload, b.templateId));
    return amountB - amountA;
  });

  // Map to the output structure
  return partyContracts.map((c) => ({
    contractId: c.contractId,
    templateId: c.templateId,
    effectiveAmount: extractAmount(c.payload, c.templateId),
    owner: extractOwner(c.payload, c.templateId),
  }));
}
