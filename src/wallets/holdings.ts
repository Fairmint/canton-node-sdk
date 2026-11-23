/**
 * Read a wallet party's holdings from the ACS (DA Registry holdings and Canton Coin) and pick the inputs for a transfer
 * or burn, with exact decimal arithmetic.
 */
import { AMULET_INSTRUMENT_ID, AMULET_TEMPLATES } from './amulet/constants';
import { formatDecimalUnits, MAX_DECIMAL_UNITS, parseDecimalUnits } from './decimal';
import { WalletError } from './errors';
import { holdingViewOf } from './holding-view';
import { readInstrumentId, sameInstrument } from './instrument';
import { isRecord, nonEmptyString } from './json';
import { DA_REGISTRY_TEMPLATES } from '../da-registry/templates';
import { isTemplate } from './templates';
import type { ActiveContract, InstrumentId } from './types';

/**
 * Which kind of holding contract a holding was read from, and so whose signatures made it genuine:
 *
 * - `da-registry`: a DA Utility Registry `Holding`, signed by its registrar (the instrument admin) and its owner;
 * - `amulet`: Canton Coin, a Splice `Amulet` or `LockedAmulet`, signed by the DSO (the instrument admin) and its owner
 *   (and, for a `LockedAmulet`, by every lock holder).
 */
export type HoldingSource = 'da-registry' | 'amulet';

export interface Holding {
  readonly contractId: string;
  readonly owner: string;
  readonly instrumentId: InstrumentId;
  /**
   * Decimal string as the ledger reports it. For Canton Coin this is the amount the holding was created with (the
   * `HoldingV1` view's `amount`); holding fees accrued since are not deducted.
   */
  readonly amount: string;
  /** Locked to an allocation, a burn request or a transfer in flight: it cannot be spent. */
  readonly locked: boolean;
  /** The synchronizer the holding is assigned to, when the ledger reported it. Inputs never mix synchronizers. */
  readonly synchronizerId?: string;
  /**
   * Which kind of holding contract it is (see {@link HoldingSource}). The wallet always sets it; optional so an object
   * built without it (a test double, a cached state) still type-checks, and absent reads as `'da-registry'`.
   */
  readonly source?: HoldingSource;
  /**
   * The `HoldingV1` view's metadata, for a holding read through its view (Canton Coin: the round it was created in and
   * its holding fee rate, `amulet.splice.lfdecentralizedtrust.org/created-in-round` and `.../rate-per-round`).
   */
  readonly meta?: Readonly<Record<string, string>>;
}

/**
 * Daml `Optional` read back: absent, `null` or `{tag: 'None'}` is unlocked; a record is a lock; anything else is not
 * readable.
 */
function readLocked(value: unknown): boolean | null {
  if (value === undefined || value === null) return false;
  if (!isRecord(value)) return null;
  return value['tag'] !== 'None';
}

const synchronizerOf = (contract: ActiveContract): { synchronizerId?: string } =>
  contract.synchronizerId !== undefined ? { synchronizerId: contract.synchronizerId } : {};

/** A DA Registry `Holding`, read from its create argument (`owner`, `instrument {source, id}`, `amount`, `lock`). */
function parseDaHolding(contract: ActiveContract): Holding | null {
  const args = contract.createArgument;
  const instrument = args?.['instrument'];
  if (args === null || !isRecord(instrument)) return null;
  const owner = nonEmptyString(args['owner']);
  const instrumentId = readInstrumentId({ admin: instrument['source'], id: instrument['id'] });
  const { amount } = args;
  const locked = readLocked(args['lock']);
  if (
    owner === undefined ||
    instrumentId === null ||
    typeof amount !== 'string' ||
    parseDecimalUnits(amount) === null ||
    locked === null
  ) {
    return null;
  }
  return {
    contractId: contract.contractId,
    owner,
    instrumentId,
    amount,
    locked,
    ...synchronizerOf(contract),
    source: 'da-registry',
  };
}

/**
 * Canton Coin, read from its `HoldingV1` view (an interface filter returns no create argument for it). The instrument
 * must be `Amulet`; an `Amulet` must be unlocked and a `LockedAmulet` locked, as Splice's views report them. A
 * `LockedAmulet` is signed by its lock holders as well as the DSO and the owner (`signatory lock.holders, signatory
 * amulet`), so every lock holder the view names must be a signatory: a view naming a holder who did not sign is not
 * genuine.
 */
function parseAmuletHolding(contract: ActiveContract): Holding | null {
  const view = holdingViewOf(contract);
  if (view?.instrumentId.id !== AMULET_INSTRUMENT_ID) return null;
  if (parseDecimalUnits(view.amount) === null) return null;
  const locked = view.lock !== null;
  if (locked !== isTemplate(contract, AMULET_TEMPLATES.lockedAmulet)) return null;
  if (view.lock !== null && !view.lock.holders.every((holder) => contract.signatories.includes(holder))) return null;
  return {
    contractId: contract.contractId,
    owner: view.owner,
    instrumentId: view.instrumentId,
    amount: view.amount,
    locked,
    ...synchronizerOf(contract),
    source: 'amulet',
    meta: view.meta.values,
  };
}

/**
 * The holding contracts the wallet counts, per source: the templates (package-name form, so the package name is checked
 * too) and how to read them. Every rule then requires the instrument admin's and the owner's signatures (a
 * `LockedAmulet`'s parser also requires its lock holders').
 */
const HOLDING_RULES: ReadonlyArray<{
  readonly templateIds: readonly string[];
  readonly parse: (contract: ActiveContract) => Holding | null;
}> = [
  { templateIds: [DA_REGISTRY_TEMPLATES.holding], parse: parseDaHolding },
  { templateIds: [AMULET_TEMPLATES.amulet, AMULET_TEMPLATES.lockedAmulet], parse: parseAmuletHolding },
];

/**
 * A genuine holding, or null: a DA Registry `Holding` (read from its create argument) or a Canton Coin `Amulet` or
 * `LockedAmulet` (read from its `HoldingV1` view). Genuine: of a template in the trust table above, and signed by its
 * instrument admin (DA's registrar, or the DSO) and its owner, and a `LockedAmulet` by every lock holder. Any party can
 * create a look-alike from its own package, with the wallet party as an observer, so only those signatures make a
 * holding real. An unreadable holding is never spendable.
 */
export function parseHolding(contract: ActiveContract): Holding | null {
  const rule = HOLDING_RULES.find(({ templateIds }) => templateIds.some((id) => isTemplate(contract, id)));
  const holding = rule?.parse(contract) ?? null;
  if (
    holding === null ||
    !contract.signatories.includes(holding.instrumentId.admin) ||
    !contract.signatories.includes(holding.owner)
  ) {
    return null;
  }
  return holding;
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
    throw new WalletError(
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
 * The most candidates (largest first) {@link skippingCover} searches. The search is quadratic, so a wallet with more
 * unlocked holdings of the instrument than this is searched over its largest ones only.
 */
export const MAX_SKIPPING_COVER_CANDIDATES = 500;

/**
 * A representable cover that may skip holdings, for when neither prefix cover fits the Numeric 10 range: for each start
 * index of the largest-first `ordered`, add the holdings from there on, skipping any that would take the total past
 * 10^28 - 10^-10, until the total reaches `needed`. Of the covers found, the one with the fewest inputs (then the
 * earliest start) wins, so the result is deterministic. Null when no start index gives one.
 */
function skippingCover(
  ordered: readonly Candidate[],
  needed: bigint
): { readonly picked: Candidate[]; readonly total: bigint } | null {
  let best: { readonly picked: Candidate[]; readonly total: bigint } | null = null;
  for (let start = 0; start < ordered.length; start += 1) {
    const picked: Candidate[] = [];
    let total = 0n;
    for (let i = start; i < ordered.length && total < needed; i += 1) {
      const candidate = ordered[i];
      if (candidate === undefined || total + candidate.units > MAX_DECIMAL_UNITS) continue;
      picked.push(candidate);
      total += candidate.units;
    }
    if (total >= needed && (best === null || picked.length < best.picked.length)) {
      best = { picked, total };
    }
  }
  return best;
}

/**
 * Pick unlocked holdings of `owner` and `instrumentId` that cover `amount`: largest first (ties by contract id), so the
 * same holdings always give the same inputs, and as few as possible are used. The registry adds the inputs up as a Daml
 * `Numeric 10`, so when that cover's total exceeds 10^28 - 10^-10 the smallest holdings are tried first instead, and
 * when that overflows too, a cover that skips holdings (see {@link skippingCover}). Throws `insufficient-balance` when
 * the unlocked total is short, and `amount-out-of-range` when no cover found is representable.
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
      return units === null || units === 0n
        ? []
        : [{ contractId: h.contractId, units, synchronizerId: h.synchronizerId }];
    })
    .sort((a, b) => {
      if (a.units !== b.units) return a.units > b.units ? -1 : 1;
      return a.contractId < b.contractId ? -1 : a.contractId > b.contractId ? 1 : 0;
    });

  // One transaction cannot spend holdings assigned to different synchronizers, so select within one synchronizer:
  // the group with the largest balance first (ties by synchronizer id), so the choice is deterministic.
  const groups = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const key = candidate.synchronizerId ?? '';
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [candidate]);
    else group.push(candidate);
  }
  const ordered = [...groups.entries()]
    .map(([key, group]) => ({ key, group, total: group.reduce((sum, c) => sum + c.units, 0n) }))
    .sort((a, b) => (a.total !== b.total ? (a.total > b.total ? -1 : 1) : a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const total = candidates.reduce((sum, c) => sum + c.units, 0n);
  const covering = ordered.filter((g) => g.total >= needed);
  if (covering.length === 0) {
    const spread =
      total >= needed && ordered.length > 1
        ? ` on any one synchronizer (the ${formatDecimalUnits(total)} is spread across ${ordered.length} synchronizers)`
        : '';
    throw new WalletError(
      'insufficient-balance',
      `Insufficient unlocked ${request.instrumentId.id}: need ${formatDecimalUnits(needed)}, have ${formatDecimalUnits(spread === '' ? total : (ordered[0]?.total ?? 0n))}${spread}`
    );
  }

  const fits = (c: { readonly total: bigint } | null): boolean => c !== null && c.total <= MAX_DECIMAL_UNITS;
  let representable: {
    readonly picked: ReadonlyArray<{ readonly contractId: string }>;
    readonly total: bigint;
  } | null = null;
  let limited = '';
  for (const { group } of covering) {
    const searched = group.slice(0, MAX_SKIPPING_COVER_CANDIDATES);
    representable =
      [cover(group, needed), cover([...group].reverse(), needed)].find(fits) ?? skippingCover(searched, needed);
    if (representable !== null) break;
    if (searched.length < group.length) {
      limited = ` (searched the largest ${MAX_SKIPPING_COVER_CANDIDATES} of ${group.length} holdings)`;
    }
  }
  if (representable === null) {
    throw new WalletError(
      'amount-out-of-range',
      `Found no set of unlocked ${request.instrumentId.id} holdings that covers ${formatDecimalUnits(needed)} within the Daml Numeric 10 range${limited}; nothing was submitted`
    );
  }
  return {
    inputHoldingCids: representable.picked.map((c) => c.contractId),
    selectedTotal: formatDecimalUnits(representable.total),
    amount: formatDecimalUnits(needed),
  };
}

/** An instrument's CIP-56 registry metadata (`/registry/metadata/v1/instruments/{id}`), as its admin recommends it. */
export interface InstrumentMetadata {
  readonly name: string;
  readonly symbol: string;
  /** Decimal places to show and accept (0-10). */
  readonly decimals: number;
}

/** One instrument's holdings, summed exactly. */
export interface InstrumentBalance {
  /** A stable key per instrument, for a React `key` or a lookup. Opaque: compare it, do not parse it. */
  readonly key: string;
  readonly instrumentId: InstrumentId;
  /** The spendable (unlocked) total, with 10 decimal places. */
  readonly unlocked: string;
  /** The total locked to a burn request, an allocation or a transfer in flight, with 10 decimal places. */
  readonly locked: string;
  /**
   * The part of `locked` held by the party's own expired transfer offers of the instrument (10 decimal places): no
   * receiver can accept them any more, so withdrawing them (`withdrawExpiredTransferOffers`) unlocks it. Set by
   * `loadState` (`'0.0000000000'` when there is none); absent on a balance built another way.
   */
  readonly lockedInExpiredOffers?: string;
  /** How many holdings (locked ones included) make up the totals. */
  readonly holdingCount: number;
  /** The registry's metadata of the instrument; absent when the registry did not answer it. */
  readonly metadata?: InstrumentMetadata;
  /**
   * Where the holdings come from: `amulet` for Canton Coin (see {@link HoldingSource}). The wallet always sets it;
   * optional like `Holding.source`, and absent reads as `'da-registry'`.
   */
  readonly source?: HoldingSource;
}

/**
 * Whether a holding or balance is Canton Coin (`source: 'amulet'`). Canton Coin is listed but not transferred, burnt or
 * pre-approved through the wallet: filter it out of pickers for those actions (`balances.filter((b) =>
 * !isCantonCoin(b))`).
 */
export function isCantonCoin(entry: Holding | InstrumentBalance): boolean {
  return entry.source === 'amulet';
}

/** Escapes `%` and `@` in one key component, so the component holds no bare `@` and the escape itself is unambiguous. */
const escapeKeyComponent = (text: string): string => text.replace(/%/g, '%25').replace(/@/g, '%40');

/**
 * A stable, unambiguous key for an instrument: `<id>@<admin>`, with `%` and `@` in each component percent-escaped
 * (`%25`, `%40`), so the one bare `@` always separates id from admin and distinct instruments never share a key
 * (`USD@issuer` at `registrar::1220bb` is `USD%40issuer@registrar::1220bb`; `USD` at `issuer@registrar::1220bb` is
 * `USD@issuer%40registrar::1220bb`). An id and admin without `%` or `@`, as usual, read unchanged. Treat the key as
 * opaque: compare it, do not parse it.
 */
export function instrumentKey({ admin, id }: InstrumentId): string {
  return `${escapeKeyComponent(id)}@${escapeKeyComponent(admin)}`;
}

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The holdings summed per instrument, locked apart, sorted by instrument id then admin (by code unit, so the order does
 * not depend on the locale). Holdings come from {@link parseHolding}, which refuses an unparseable amount.
 */
export function instrumentBalances(holdings: readonly Holding[]): InstrumentBalance[] {
  const totals = new Map<
    string,
    { instrumentId: InstrumentId; source: HoldingSource; unlocked: bigint; locked: bigint; count: number }
  >();
  for (const entry of holdings) {
    const units = parseDecimalUnits(entry.amount);
    if (units === null) continue;
    const key = instrumentKey(entry.instrumentId);
    const total = totals.get(key) ?? {
      instrumentId: entry.instrumentId,
      source: entry.source ?? 'da-registry',
      unlocked: 0n,
      locked: 0n,
      count: 0,
    };
    if (entry.locked) total.locked += units;
    else total.unlocked += units;
    total.count += 1;
    totals.set(key, total);
  }
  return [...totals.entries()]
    .map(([key, total]) => ({
      key,
      instrumentId: total.instrumentId,
      unlocked: formatDecimalUnits(total.unlocked),
      locked: formatDecimalUnits(total.locked),
      holdingCount: total.count,
      source: total.source,
    }))
    .sort(
      (a, b) =>
        compareText(a.instrumentId.id, b.instrumentId.id) || compareText(a.instrumentId.admin, b.instrumentId.admin)
    );
}
