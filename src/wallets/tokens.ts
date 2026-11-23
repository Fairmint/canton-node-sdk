/**
 * One view per token of a wallet state, so a page renders Canton Coin and DA Registry tokens alike: one picker and one
 * panel, whatever the token. Also the rule that decides which of the party's own transfer offers are expired, and how
 * much of a token they keep locked.
 */
import { CANTON_COIN_METADATA } from './amulet/constants';
import type { BurnRequest, MintOffer, TransferOffer, TransferPreapproval } from './contracts';
import { coveringPreapproval } from './contracts';
import { formatDecimalUnits, parseDecimalUnits } from './decimal';
import { instrumentKey, isCantonCoin, type Holding, type InstrumentBalance, type InstrumentMetadata } from './holdings';
import type { InstrumentId } from './types';

/**
 * Whether a transfer offer's `executeBefore` has passed at `atMs` (milliseconds since the epoch). The ledger decides by
 * ledger time, which can differ from the clock by a little; an unreadable `executeBefore` is not expired.
 */
export function isTransferOfferExpired(offer: Pick<TransferOffer, 'executeBefore'>, atMs: number): boolean {
  const deadline = Date.parse(offer.executeBefore);
  return !Number.isNaN(deadline) && deadline <= atMs;
}

/**
 * Per instrument (by `instrumentKey`), the locked units that `offers` (the party's own expired outgoing offers) keep
 * locked: an offer that names its locked holding (Canton Coin) counts that holding's amount while it is still a locked
 * holding of the party, and nothing once it is gone (its lock was already released; withdrawing only archives the
 * offer); an offer that names none (DA) counts its amount. Each instrument's total is capped at its locked total.
 */
export function lockedInExpiredOffers(
  holdings: readonly Holding[],
  offers: readonly TransferOffer[]
): Map<string, bigint> {
  const lockedHoldings = new Map(holdings.filter((h) => h.locked).map((h) => [h.contractId, h]));
  const lockedTotals = new Map<string, bigint>();
  for (const holding of lockedHoldings.values()) {
    const key = instrumentKey(holding.instrumentId);
    lockedTotals.set(key, (lockedTotals.get(key) ?? 0n) + (parseDecimalUnits(holding.amount) ?? 0n));
  }
  const counted = new Set<string>();
  const totals = new Map<string, bigint>();
  for (const offer of offers) {
    const key = instrumentKey(offer.instrumentId);
    let units: bigint;
    if (offer.lockedHoldingCid !== undefined) {
      const holding = lockedHoldings.get(offer.lockedHoldingCid);
      if (holding === undefined || counted.has(holding.contractId)) continue;
      counted.add(holding.contractId);
      units = parseDecimalUnits(holding.amount) ?? 0n;
    } else {
      units = parseDecimalUnits(offer.amount) ?? 0n;
    }
    totals.set(key, (totals.get(key) ?? 0n) + units);
  }
  for (const [key, units] of totals) {
    const cap = lockedTotals.get(key) ?? 0n;
    if (units > cap) totals.set(key, cap);
  }
  return totals;
}

/**
 * The party's own Canton Coin locks that expired at `atMs` and that none of `offers` names (any direction): the offer
 * that locked it is gone, or the lock was never an offer's. Splice lets the owner alone release such a lock
 * (`LockedAmulet_OwnerExpireLockV2`). A lock with no absolute expiry (`lockExpiresAt` absent) is never counted, and an
 * active offer's lock is left to withdrawing that offer. `holdings` are the party's own.
 */
export function expiredUnclaimedLocks(
  holdings: readonly Holding[],
  offers: ReadonlyArray<Pick<TransferOffer, 'lockedHoldingCid'>>,
  atMs: number
): Holding[] {
  const named = new Set(
    offers.flatMap((offer) => (offer.lockedHoldingCid === undefined ? [] : [offer.lockedHoldingCid]))
  );
  return holdings.filter((holding) => {
    if (!holding.locked || !isCantonCoin(holding) || holding.lockExpiresAt === undefined) return false;
    const expiry = Date.parse(holding.lockExpiresAt);
    return !Number.isNaN(expiry) && expiry <= atMs && !named.has(holding.contractId);
  });
}

/** Per instrument (by `instrumentKey`), the units of `holdings`. */
export function unitsByInstrument(holdings: readonly Holding[]): Map<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const holding of holdings) {
    const key = instrumentKey(holding.instrumentId);
    totals.set(key, (totals.get(key) ?? 0n) + (parseDecimalUnits(holding.amount) ?? 0n));
  }
  return totals;
}

/** What the wallet can do with a token. Honest per token: Canton Coin's are what this wallet supports for it today. */
export interface TokenCapabilities {
  /** Send it (`planTransfer`, `submitTransfer`). Not Canton Coin. */
  readonly send: boolean;
  /** Redeem it (`requestBurn`). Not Canton Coin. */
  readonly burn: boolean;
  /**
   * Pre-approve incoming transfers of it (`createTransferPreapproval` with the token's admin and id). Not Canton Coin:
   * Canton Coin's own preapproval is made through a validator, not this wallet.
   */
  readonly preapprove: boolean;
  /** Accept or reject incoming transfer offers of it (a faucet's Canton Coin offers included). */
  readonly answerOffers: boolean;
  /**
   * Withdraw the party's own offers of it, expired ones included (`withdrawTransferOffer`,
   * `withdrawExpiredTransferOffers`, `reclaimLockedTokens`).
   */
  readonly withdrawOffers: boolean;
  /** Accept or reject mint offers of it. Only DA Registry tokens have mint offers. */
  readonly answerMintOffers: boolean;
}

/** Everything a page shows for one token, from one wallet state (see {@link walletTokens}). */
export interface WalletToken {
  /** `instrumentKey(instrumentId)`: a React `key` and a picker value. Opaque: compare it, do not parse it. */
  readonly key: string;
  readonly instrumentId: InstrumentId;
  /** The registry's symbol (`CC`, `CNTN`), else the instrument id. Label the picker with it. */
  readonly symbol: string;
  /** The registry's name (`Canton Coin`), else the instrument id. */
  readonly name: string;
  /** Decimal places to show and accept: the registry's, else 10. */
  readonly decimals: number;
  /** The registry's metadata, when it answered. */
  readonly metadata?: InstrumentMetadata;
  /** Spendable (unlocked) total, 10 decimal places. */
  readonly available: string;
  /** Locked total (offers, redemptions, allocations in flight), 10 decimal places. */
  readonly locked: string;
  /**
   * The part of `locked` that `reclaimLockedTokens` would unlock (the party's expired offers, and its expired Canton
   * Coin locks no offer names), 10 decimal places, capped at `locked`. Exact for Canton Coin; for a DA token an
   * estimate (its offers name no locked holding, so each expired offer counts its amount).
   */
  readonly lockedReclaimable: string;
  /**
   * Whether `reclaimLockedTokens` has something to do for this token: an expired outgoing offer to withdraw, or an
   * expired Canton Coin lock to release. Show the Reclaim button on it, not on `lockedReclaimable`.
   */
  readonly canReclaim: boolean;
  readonly holdingCount: number;
  readonly isCantonCoin: boolean;
  readonly capabilities: TokenCapabilities;
  /**
   * Transfer offers of this token. `expiredIncoming` is the part of `incoming` the party can no longer accept (the
   * ledger refuses it; it can still reject them): hide Accept on them. `expiredOutgoing` is the part of `outgoing` no
   * receiver can accept any more (`reclaimLockedTokens` withdraws them).
   */
  readonly offers: {
    readonly incoming: readonly TransferOffer[];
    readonly outgoing: readonly TransferOffer[];
    readonly expiredIncoming: readonly TransferOffer[];
    readonly expiredOutgoing: readonly TransferOffer[];
  };
  readonly mintOffers: readonly MintOffer[];
  readonly burnRequests: readonly BurnRequest[];
  /**
   * The party's DA preapproval that covers this token (issuer-wide, or naming it), or null. Always null for Canton
   * Coin: read `preapprovalStatus`.
   */
  readonly preapproval: TransferPreapproval | null;
  /**
   * `covered` (`preapproval` is set) or `none` for a DA token. `unknown` for Canton Coin: its preapproval is a
   * DSO-signed Splice `TransferPreapproval` made through the party's validator, which this wallet does not read, so a
   * page must not say the party has none.
   */
  readonly preapprovalStatus: 'covered' | 'none' | 'unknown';
}

/** The parts of a `WalletState` {@link walletTokens} reads. */
export interface WalletTokensInput {
  readonly balances: readonly InstrumentBalance[];
  readonly transferOffers: { readonly incoming: readonly TransferOffer[]; readonly outgoing: readonly TransferOffer[] };
  readonly mintOffers: readonly MintOffer[];
  readonly burnRequests: readonly BurnRequest[];
  readonly transferPreapprovals: readonly TransferPreapproval[];
}

const ZERO = formatDecimalUnits(0n);
const units = (text: string | undefined): bigint => (text === undefined ? 0n : (parseDecimalUnits(text) ?? 0n));
const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * One {@link WalletToken} per token the state names: every balance, and every token of an offer, mint offer or burn
 * request (a token offered to the party before it holds any is listed with zero balances). Sorted by symbol, then
 * instrument id, then admin, by code unit. Canton Coin and DA Registry tokens share the shape; `capabilities` says
 * which actions apply.
 */
export function walletTokens(state: WalletTokensInput): WalletToken[] {
  interface Draft {
    instrumentId: InstrumentId;
    balance?: InstrumentBalance;
    cantonCoin: boolean;
  }
  const drafts = new Map<string, Draft>();
  const note = (instrumentId: InstrumentId, cantonCoin: boolean, balance?: InstrumentBalance): void => {
    const key = instrumentKey(instrumentId);
    const draft = drafts.get(key) ?? { instrumentId, cantonCoin: false };
    draft.cantonCoin ||= cantonCoin;
    if (balance !== undefined) draft.balance = balance;
    drafts.set(key, draft);
  };
  for (const balance of state.balances) note(balance.instrumentId, balance.source === 'amulet', balance);
  for (const offer of [...state.transferOffers.incoming, ...state.transferOffers.outgoing]) {
    note(offer.instrumentId, offer.registry === 'amulet');
  }
  for (const item of [...state.mintOffers, ...state.burnRequests]) note(item.instrumentId, false);

  const of = <T extends { readonly instrumentId: InstrumentId }>(list: readonly T[], key: string): T[] =>
    list.filter((item) => instrumentKey(item.instrumentId) === key);

  return [...drafts.entries()]
    .map(([key, { instrumentId, balance, cantonCoin }]): WalletToken => {
      // Canton Coin offered before the party holds any has no balance to carry the registry's answer.
      const metadata = balance?.metadata ?? (cantonCoin ? CANTON_COIN_METADATA : undefined);
      const incoming = of(state.transferOffers.incoming, key);
      const outgoing = of(state.transferOffers.outgoing, key);
      const expiredOutgoing = outgoing.filter((offer) => offer.expired === true);
      const lockedUnits = units(balance?.locked);
      const inLocks = units(balance?.lockedInExpiredLocks);
      const reclaimable = units(balance?.lockedInExpiredOffers) + inLocks;
      const preapproval = cantonCoin
        ? null
        : coveringPreapproval(state.transferPreapprovals, {
            instrumentAdmin: instrumentId.admin,
            instrumentIds: [instrumentId.id],
          });
      return {
        key,
        instrumentId,
        symbol: metadata?.symbol ?? instrumentId.id,
        name: metadata?.name ?? instrumentId.id,
        decimals: metadata?.decimals ?? 10,
        ...(metadata !== undefined && { metadata }),
        available: balance?.unlocked ?? ZERO,
        locked: balance?.locked ?? ZERO,
        lockedReclaimable: formatDecimalUnits(reclaimable > lockedUnits ? lockedUnits : reclaimable),
        canReclaim: expiredOutgoing.length > 0 || inLocks > 0n,
        holdingCount: balance?.holdingCount ?? 0,
        isCantonCoin: cantonCoin,
        capabilities: {
          send: !cantonCoin,
          burn: !cantonCoin,
          preapprove: !cantonCoin,
          answerOffers: true,
          withdrawOffers: true,
          answerMintOffers: !cantonCoin,
        },
        offers: {
          incoming,
          outgoing,
          expiredIncoming: incoming.filter((offer) => offer.expired === true),
          expiredOutgoing,
        },
        mintOffers: of(state.mintOffers, key),
        burnRequests: of(state.burnRequests, key),
        preapproval,
        preapprovalStatus: cantonCoin ? 'unknown' : preapproval === null ? 'none' : 'covered',
      };
    })
    .sort(
      (a, b) =>
        compareText(a.symbol, b.symbol) ||
        compareText(a.instrumentId.id, b.instrumentId.id) ||
        compareText(a.instrumentId.admin, b.instrumentId.admin)
    );
}
