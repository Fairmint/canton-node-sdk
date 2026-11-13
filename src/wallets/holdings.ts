/** Read holdings from the ACS and pick the inputs for a transfer or burn, with exact decimal arithmetic. */
import { formatDecimalUnits, MAX_DECIMAL_UNITS, parseDecimalUnits } from './decimal';
import { TokenWalletError } from './errors';
import { readInstrumentId, sameInstrument } from './instrument';
import { isRecord, nonEmptyString } from './json';
import { DA_REGISTRY_TEMPLATES } from '../da-registry/templates';
import { TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID } from '../utils/token-standard/v1/constants';
import { sameQualifiedName } from './templates';
import type { ActiveContract, InstrumentId } from './types';

export interface Holding {
  readonly contractId: string;
  readonly owner: string;
  readonly instrumentId: InstrumentId;
  /** Decimal string as the ledger reports it. */
  readonly amount: string;
  /** Locked to an allocation, a burn request or a transfer in flight: it cannot be spent. */
  readonly locked: boolean;
}

/**
 * Daml `Optional` read back: absent, `null` or `{tag: 'None'}` is unlocked; a record is a lock; anything else is not
 * readable.
 */
function readLocked(value: unknown): boolean | null {
  if (value === undefined || value === null) return false;
  if (!isRecord(value)) return null;
  if (value['tag'] === 'None') return false;
  return true;
}

function holding(
  contractId: string,
  fields: {
    owner: unknown;
    instrumentId: InstrumentId | null;
    amount: unknown;
    lock: unknown;
  }
): Holding | null {
  const owner = nonEmptyString(fields.owner);
  const locked = readLocked(fields.lock);
  if (
    owner === undefined ||
    fields.instrumentId === null ||
    typeof fields.amount !== 'string' ||
    parseDecimalUnits(fields.amount) === null ||
    locked === null
  ) {
    return null;
  }
  return {
    contractId,
    owner,
    instrumentId: fields.instrumentId,
    amount: fields.amount,
    locked,
  };
}

/**
 * A holding from its CIP-56 HoldingV1 interface view when the ledger gave one, else from a DA Registry `Holding`'s
 * create argument (`owner`, `instrument {source, id}`, `amount`, `lock`). Null when neither reads: an unreadable
 * holding is never spendable.
 */
export function parseHolding(contract: ActiveContract): Holding | null {
  const view = contract.interfaceViews.find((v) =>
    sameQualifiedName(v.interfaceId, TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID)
  );
  if (view) {
    const v = view.viewValue;
    return holding(contract.contractId, {
      owner: v['owner'],
      instrumentId: readInstrumentId(v['instrumentId']),
      amount: v['amount'],
      lock: v['lock'],
    });
  }
  const args = contract.createArgument;
  if (args !== null && sameQualifiedName(contract.templateId, DA_REGISTRY_TEMPLATES.holding)) {
    const { instrument } = args;
    return holding(contract.contractId, {
      owner: args['owner'],
      instrumentId: isRecord(instrument)
        ? readInstrumentId({
            admin: instrument['source'],
            id: instrument['id'],
          })
        : null,
      amount: args['amount'],
      lock: args['lock'],
    });
  }
  return null;
}

export interface HoldingSelection {
  readonly inputHoldingCids: string[];
  /** Sum of the selected holdings (decimal string, 10 places). */
  readonly selectedTotal: string;
  /** The requested amount, normalized to 10 places. */
  readonly amount: string;
}

/**
 * Parse a positive amount (at most 10 decimal places, at most the Daml `Numeric 10` maximum 10^28 - 10^-10) to units of
 * 10^-10. Throws `invalid-input` otherwise.
 */
export function requirePositiveAmount(amount: string): bigint {
  const units = parseDecimalUnits(amount.trim());
  if (units === null || units === 0n || units > MAX_DECIMAL_UNITS) {
    throw new TokenWalletError(
      'invalid-input',
      `Amount ${JSON.stringify(amount)} must be a positive decimal below 10^28 with at most 10 decimal places`
    );
  }
  return units;
}

interface Candidate {
  readonly contractId: string;
  readonly units: bigint;
}

/** The first holdings of `ordered` that reach `needed`, or null when they all fall short. */
function cover(
  ordered: readonly Candidate[],
  needed: bigint
): { readonly picked: Candidate[]; readonly total: bigint } | null {
  const picked: Candidate[] = [];
  let total = 0n;
  for (const candidate of ordered) {
    if (total >= needed) break;
    picked.push(candidate);
    total += candidate.units;
  }
  return total >= needed ? { picked, total } : null;
}

/**
 * Pick unlocked holdings of `owner` and `instrumentId` that cover `amount`: largest first (ties by contract id), so the
 * same holdings always give the same inputs, and as few as possible are used. The registry adds the inputs up as a Daml
 * `Numeric 10`, so when that cover's total exceeds 10^28 - 10^-10 the smallest holdings are tried first instead. Throws
 * `insufficient-balance` when the unlocked total is short, and `amount-out-of-range` when neither cover is
 * representable.
 */
export function selectHoldings(
  holdings: readonly Holding[],
  request: {
    readonly owner: string;
    readonly instrumentId: InstrumentId;
    readonly amount: string;
  }
): HoldingSelection {
  const needed = requirePositiveAmount(request.amount);
  const candidates = holdings
    .filter((h) => !h.locked && h.owner === request.owner && sameInstrument(h.instrumentId, request.instrumentId))
    .flatMap((h) => {
      const units = parseDecimalUnits(h.amount);
      return units === null || units === 0n ? [] : [{ contractId: h.contractId, units }];
    })
    .sort((a, b) => {
      if (a.units !== b.units) return a.units > b.units ? -1 : 1;
      return a.contractId < b.contractId ? -1 : a.contractId > b.contractId ? 1 : 0;
    });

  const largestFirst = cover(candidates, needed);
  if (largestFirst === null) {
    const total = candidates.reduce((sum, c) => sum + c.units, 0n);
    throw new TokenWalletError(
      'insufficient-balance',
      `Insufficient unlocked ${request.instrumentId.id}: need ${formatDecimalUnits(needed)}, have ${formatDecimalUnits(total)}`
    );
  }
  const representable = [largestFirst, cover([...candidates].reverse(), needed)].find(
    (c) => c !== null && c.total <= MAX_DECIMAL_UNITS
  );
  if (representable === undefined || representable === null) {
    throw new TokenWalletError(
      'amount-out-of-range',
      `No set of unlocked ${request.instrumentId.id} holdings covers ${formatDecimalUnits(needed)} within the Daml Numeric 10 range; nothing was submitted`
    );
  }
  return {
    inputHoldingCids: representable.picked.map((c) => c.contractId),
    selectedTotal: formatDecimalUnits(representable.total),
    amount: formatDecimalUnits(needed),
  };
}
