/**
 * One wallet party's DA Utility Registry token actions through any CIP-0103 wallet provider: holdings, transfers,
 * transfer offers, mint offers, burn requests and transfer preapprovals. Every write reads its contracts fresh, fetches
 * its choice context from DA's Utilities API, refuses anything that does not check out, and submits as the wallet party
 * only.
 *
 * Canton Coin (on by default, `WalletOptions.cantonCoin`): the party's Canton Coin holdings (Splice `Amulet` and
 * `LockedAmulet`, read through their `HoldingV1` interface view) are listed with its other tokens, and Canton Coin
 * transfer offers (`AmuletTransferInstruction`s, for example a faucet's) beside DA's, to accept, reject or withdraw the
 * same way. Canton Coin is not transferred or burnt through this wallet.
 *
 * Trust: a holding counts when its instrument admin (DA's registrar, or for Canton Coin the DSO) and its owner signed
 * it; an offer, a request or a preapproval when it names DA's operator and (offers and requests) a provider trusted for
 * its instrument admin signed it. By default a registrar must be its own provider; `registry.trustedProviders` trusts
 * others (see `isFromRegistry`). A Canton Coin offer counts when it is of Canton Coin and the DSO and its sender signed
 * it. The DSO party is resolved once for both (`createAmuletRegistry`): pinned, else the registry's `adminId`; while it
 * is unconfirmed, no Canton Coin is listed (`WalletState.cantonCoinUnavailable`).
 */
import {
  cip103Wallet,
  isDaNetwork,
  type AcsFilter,
  type Cip103Provider,
  type Cip103Wallet,
  type WalletReadRetryOptions,
} from './cip103';
import {
  acceptMintOfferCommand,
  cancelBurnRequestCommand,
  createDaTransferPreapprovalCommand,
  MAX_PREAPPROVAL_INSTRUMENTS,
  rejectMintOfferCommand,
  requestBurnCommand,
  transferCommand,
  transferInstructionCommand,
  withdrawTransferPreapprovalCommand,
  type TransferInstructionAction,
  type TransferSpec,
} from './commands';
import {
  coveringPreapproval,
  isFromRegistry,
  parseAmuletTransferOffer,
  parseBurnRequest,
  parseMintOffer,
  parseTransferOffer,
  parseTransferPreapproval,
  type BurnRequest,
  type MintOffer,
  type TransferOffer,
  type TransferPreapproval,
} from './contracts';
import {
  createDaUtilitiesClient,
  DA_BURN_FACTORY_TEMPLATES,
  DA_TRANSFER_FACTORY_TEMPLATES,
  factoryTemplateError,
  type DaNetwork,
  type DaRegistryOptions,
  type DaUtilitiesClient,
  type TransferFactory,
  type TransferKind,
} from './da-utilities/client';
import { awaitWithAbort, throwIfAborted } from './abort';
import { AMULET_INSTRUMENT_ID, AMULET_TEMPLATES } from './amulet/constants';
import {
  AMULET_REGISTRY_NAME,
  AMULET_REGISTRY_REQUEST_TIMEOUT_MS,
  createAmuletRegistry,
  type AmuletRegistry,
  type CantonCoinOptions,
} from './amulet/registry';
import { isWalletSubmitError, RegistryResponseError, WalletError, WalletSubmitError } from './errors';
import { HOLDING_V1_INTERFACE_ID } from './holding-view';
import {
  instrumentBalances,
  isCantonCoin,
  parseHolding,
  selectHoldings,
  type Holding,
  type InstrumentBalance,
  type InstrumentMetadata,
} from './holdings';
import { formatDecimalUnits } from './decimal';
import { sameInstrument } from './instrument';
import { isRecord } from './json';
import { isTemplate } from './templates';
import { isTransferOfferExpired, lockedInExpiredOffers } from './tokens';
import { DA_REGISTRY_TEMPLATES } from '../da-registry/templates';
import { TOKEN_STANDARD_V1_REASON_META_KEY } from '../utils/token-standard/v1/constants';
import type { ActiveContract, InstrumentId, SubmitResult, WalletSubmission } from './types';

const SECOND_MS = 1000;
const DAY_MS = 24 * 60 * 60 * SECOND_MS;

/** Transfers: `executeBefore` defaults to now + 24 h, a common wallet default. */
const TRANSFER_TTL_MS = DAY_MS;
/** Burn requests: `executeBefore` defaults to now + 7 days, giving the registrar a week to accept or reject. */
const BURN_TTL_MS = 7 * DAY_MS;
/**
 * `requestedAt` = now − 60 s for transfers and burn requests: registries require it in the past by ledger time, and the
 * client's clock can run ahead of the participant's.
 */
const REQUESTED_AT_SKEW_MS = 60 * SECOND_MS;
/** A burn reference: no personal data (DA's operator and the registrar see it). */
export const BURN_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
/** The reason a rejected mint offer gives the registrar: fixed, so nothing personal reaches the ledger. */
export const MINT_OFFER_REJECT_REASON = 'Rejected by the holder';

/** The number of random base-36 digits that end a burn reference. */
const BURN_REFERENCE_SUFFIX_DIGITS = 6;
/** 7 × 36: random bytes at or above it are drawn again, so every base-36 digit is equally likely. */
const UNBIASED_BYTE_LIMIT = 252;

/** `count` uniformly distributed base-36 digits from the Web Crypto API. Not a secret: only unique. */
function randomBase36(count: number): string {
  const bytes = new Uint8Array(16);
  let digits = '';
  while (digits.length < count) {
    for (const byte of globalThis.crypto.getRandomValues(bytes)) {
      if (byte < UNBIASED_BYTE_LIMIT && digits.length < count) digits += (byte % 36).toString(36);
    }
  }
  return digits;
}

/**
 * A burn reference with no personal data: `holder-burn-<UTC yyyymmddThhmmssZ>-<6 random base-36 digits>` (DA's operator
 * and the registrar see it). Never `redeem-…`, a prefix a transfer agent may reserve for the redemptions it files
 * itself. `requestBurn` uses one when no `reference` is given.
 */
export function newBurnReference(now: Date): string {
  const stamp = new Date(requireTime(now, 'now')).toISOString().replace(/[-:]|\.\d+/g, '');
  return `holder-burn-${stamp}-${randomBase36(BURN_REFERENCE_SUFFIX_DIGITS)}`;
}

export interface WalletOptions {
  /** Any CIP-0103 (Canton dApp API) provider, already connected as `partyId`. */
  readonly provider: Cip103Provider;
  /** The party every action reads and acts as. */
  readonly partyId: string;
  /** The DA network the provider's ledger is on; selects DA's Utilities API. */
  readonly network: DaNetwork;
  readonly registry?: DaRegistryOptions;
  /**
   * Canton Coin, on by default: the party's Canton Coin holdings and Canton Coin transfer offers are listed with its
   * other tokens and DA's offers. The DSO party is `dsoParty` when pinned, else the `adminId` of the Canton Coin
   * registry (`registryUrl`, SV-1's Scan of `network` by default), asked only when the party has Canton Coin. While
   * neither confirms it (Scan down or slow), no Canton Coin is listed and `WalletState.cantonCoinUnavailable` is true.
   * `false`: no Canton Coin is read and the registry is never asked.
   */
  readonly cantonCoin?: CantonCoinOptions | false;
  /**
   * Whether the wallet session this wallet belongs to is still live. Once it answers false, every write is refused with
   * `invalid-input` before its first read, and again right before the wallet signs, so nothing is submitted: the
   * provider may now be signed in to another account. Reads are not limited. Default: always live.
   */
  readonly isActive?: () => boolean;
}

/** Test hooks beside {@link WalletOptions}; not part of the public options. */
export interface WalletInternalOptions extends WalletOptions {
  /** Defaults to the system clock. */
  readonly now?: () => Date;
  /** How reads back off when the wallet rate-limits them. */
  readonly readRetry?: WalletReadRetryOptions;
}

/**
 * Per-call options of a wallet action.
 *
 * `signal` cancels the action: once it aborts, the call rejects with an `AbortError` (`describeWalletError` kind
 * `cancelled`), its registry requests get the signal, and nothing is submitted. A write checks the signal for the last
 * time right before it hands the transaction to the wallet; from then on it runs to its outcome (CIP-0103 has no
 * cancellation, and a submission must never be left half-known), so a late abort is ignored.
 */
export interface WalletCallOptions {
  readonly signal?: AbortSignal;
}

/** DA's and Canton Coin's pending transfers alike (`TransferOffer.registry` tells them apart). */
export interface TransferOffers {
  /** Offers to the wallet party, which it can accept or reject. */
  readonly incoming: TransferOffer[];
  /** The wallet party's own offers, which it can withdraw. */
  readonly outgoing: TransferOffer[];
}

/** Everything a wallet page shows, read as one snapshot of the ledger. */
export interface WalletState {
  /** The ledger offset every list was read at. */
  readonly offset: number;
  /** The wallet party's holdings (DA Registry holdings and Canton Coin, see `Holding.source`), locked ones included. */
  readonly holdings: Holding[];
  /** `holdings` summed per instrument (unlocked and locked apart), sorted by instrument id then admin. */
  readonly balances: InstrumentBalance[];
  readonly transferOffers: TransferOffers;
  /** Mint offers to the wallet party. */
  readonly mintOffers: MintOffer[];
  /** The wallet party's open burn requests (pending redemptions). */
  readonly burnRequests: BurnRequest[];
  /** The wallet party's transfer preapprovals. */
  readonly transferPreapprovals: TransferPreapproval[];
  /**
   * True when the party has Canton Coin (holdings or transfer offers) but its DSO party could not be confirmed (the
   * Canton Coin registry failed, timed out or is backing off after a failure, and no `cantonCoin.dsoParty` is pinned):
   * `holdings`, `balances` and `transferOffers` then leave all Canton Coin out, and everything else is complete. Load
   * again to retry. The wallet always sets it (false otherwise); optional so a state built without it still
   * type-checks.
   */
  readonly cantonCoinUnavailable?: boolean;
}

export interface TransferRequest {
  readonly receiver: string;
  readonly instrumentId: InstrumentId;
  /** Positive decimal, at most 10 places. */
  readonly amount: string;
  /** Shown to the receiver as the transfer's reason (`splice.lfdecentralizedtrust.org/reason`). */
  readonly memo?: string;
  /**
   * Refuse (`preapproval-required`, at plan time, before anything is signed) unless the registry runs the transfer
   * direct, so no offer is ever created.
   */
  readonly requirePreapproval?: boolean;
  /** Offer acceptance deadline; defaults to now + 24 h at submission; must be in the future. */
  readonly executeBefore?: Date;
}

export interface TransferResult extends SubmitResult {
  readonly kind: TransferKind;
}

/**
 * A planned transfer, to show the user how the registry will run it before they confirm. `submit` sends exactly the
 * planned request; when the registry now answers another kind (a preapproval expired or appeared in between), it is
 * refused with `kind-changed` before signing.
 */
export interface TransferPlan {
  /** How the registry would run the transfer when it was planned. */
  readonly kind: TransferKind;
  /** A sentence explaining `kind` to the user. */
  readonly description: string;
  /** The party the transfer is from. */
  readonly partyId: string;
  /** The request as planned (a frozen copy). */
  readonly request: Readonly<TransferRequest>;
  /** Run the transfer (a write: one at a time, see `Wallet`). */
  submit(options?: WalletCallOptions): Promise<TransferResult>;
}

export interface BurnRequestOptions {
  readonly instrumentId: InstrumentId;
  readonly amount: string;
  /** Matches {@link BURN_REFERENCE_PATTERN}; never personal data. Defaults to a generated `holder-burn-…` reference. */
  readonly reference?: string;
  /** Defaults to now + 7 days. */
  readonly executeBefore?: Date;
}

/** A filed burn request: the submission, and the reference it was filed with (the given one or a generated one). */
export interface BurnRequestResult extends SubmitResult {
  readonly reference: string;
}

/** One expired offer withdrawn: its submission, the offer and the amount it offered. */
export interface WithdrawnOffer extends SubmitResult {
  readonly transferOfferCid: string;
  readonly amount: string;
}

/** What `withdrawExpiredTransferOffers` withdrew, in the order it did. */
export interface WithdrawExpiredResult {
  readonly withdrawn: readonly WithdrawnOffer[];
}

export interface TransferPreapprovalOptions {
  readonly instrumentAdmin: string;
  /** Up to 10 instrument ids of the admin; empty or omitted: every instrument of the admin. */
  readonly instrumentIds?: readonly string[];
}

/**
 * A wallet party's DA Utility Registry token actions through a CIP-0103 provider.
 *
 * One write at a time: a write started while another is in progress (from its first read to its submission's outcome)
 * is refused at once with `busy`, so two writes never pick the same holdings. `loadState` and `planTransfer` are reads
 * and are not limited.
 */
export interface Wallet {
  readonly partyId: string;
  readonly network: DaNetwork;
  /**
   * One ledger snapshot: holdings and balances, transfer offers (incoming and outgoing), mint offers, burn requests and
   * transfer preapprovals (one ledger-end call and one ACS read). Calls made while a snapshot is in flight share it,
   * unless a write settled since it started.
   */
  loadState(options?: WalletCallOptions): Promise<WalletState>;
  /** How the registry would run a transfer, kept to submit once the user confirmed it (see {@link TransferPlan}). */
  planTransfer(request: TransferRequest, options?: WalletCallOptions): Promise<TransferPlan>;
  acceptTransferOffer(transferOfferCid: string, options?: WalletCallOptions): Promise<SubmitResult>;
  rejectTransferOffer(transferOfferCid: string, options?: WalletCallOptions): Promise<SubmitResult>;
  /** Withdraw one of the party's own transfer offers, which unlocks its tokens (also after the offer expired). */
  withdrawTransferOffer(transferOfferCid: string, options?: WalletCallOptions): Promise<SubmitResult>;
  /**
   * Withdraw all of the party's own expired transfer offers of one token (`TransferOffer.expired`), so the tokens they
   * keep locked (`InstrumentBalance.lockedInExpiredOffers`) are unlocked: one `TransferInstruction_Withdraw` per offer,
   * each as `withdrawTransferOffer` sends it, through the offer's own registry. Refused with `not-found` when there is
   * none. Stops at the first failure and throws it; the offers withdrawn before it stay withdrawn.
   */
  withdrawExpiredTransferOffers(
    instrumentId: InstrumentId,
    options?: WalletCallOptions
  ): Promise<WithdrawExpiredResult>;
  acceptMintOffer(mintOfferCid: string, options?: WalletCallOptions): Promise<SubmitResult>;
  /** Reject a mint offer; the registrar sees {@link MINT_OFFER_REJECT_REASON}. */
  rejectMintOffer(mintOfferCid: string, options?: WalletCallOptions): Promise<SubmitResult>;
  /**
   * File a burn (redemption) request; DA locks the amount until the registrar accepts or rejects it, or the holder
   * cancels it. Resolves with the reference it was filed with. If the submission fails, the `WalletSubmitError` carries
   * that reference too (`burnReference`, and in its message): after an `unknown` outcome, find the burn request by it
   * before filing another, or the amount may be locked twice.
   */
  requestBurn(burn: BurnRequestOptions, options?: WalletCallOptions): Promise<BurnRequestResult>;
  /** Cancel one of the party's open burn requests; DA unlocks the amount. */
  cancelBurnRequest(burnRequestCid: string, options?: WalletCallOptions): Promise<SubmitResult>;
  /**
   * Create the party's transfer preapproval for an instrument admin, so transfers of those instruments to the party
   * complete at once. Refused with `already-exists` when one of the party's preapprovals already covers them.
   */
  createTransferPreapproval(
    preapproval: TransferPreapprovalOptions,
    options?: WalletCallOptions
  ): Promise<SubmitResult>;
  /** Withdraw one of the party's transfer preapprovals. */
  removeTransferPreapproval(preapprovalCid: string, options?: WalletCallOptions): Promise<SubmitResult>;
}

/** A sentence explaining how the registry runs a transfer of each kind. */
const TRANSFER_KIND_DESCRIPTIONS: Readonly<Record<TransferKind, string>> = {
  direct: 'Direct: the receiver pre-approved this instrument, so the tokens move at once.',
  offer:
    'Offer: the receiver must accept it before it expires. Your tokens stay locked until it is accepted, rejected by the receiver or withdrawn by you; expiry only stops acceptance and does not unlock them.',
  self: 'Self-transfer: the receiver is this wallet; the holdings are merged or split.',
};

/** The DA templates a state snapshot reads. */
const DA_STATE_TEMPLATES: readonly AcsFilter[] = [
  DA_REGISTRY_TEMPLATES.holding,
  DA_REGISTRY_TEMPLATES.transferOffer,
  DA_REGISTRY_TEMPLATES.mintOffer,
  DA_REGISTRY_TEMPLATES.burnRequest,
  DA_REGISTRY_TEMPLATES.transferPreapproval,
];

/** Canton Coin's holdings, read through the `HoldingV1` view (the interface filter matches DA's `Holding` too). */
const CANTON_COIN_HOLDING_FILTERS: readonly AcsFilter[] = [
  { interfaceId: HOLDING_V1_INTERFACE_ID, includeInterfaceView: true },
];

/**
 * Every filter a state snapshot reads with Canton Coin on, in one cumulative filter: `HoldingV1` with its view (it
 * matches Canton Coin's `Amulet` and `LockedAmulet`, and DA's `Holding` again, which the ledger returns once), the DA
 * templates, and Canton Coin's transfer instructions.
 */
const CANTON_COIN_STATE_FILTERS: readonly AcsFilter[] = [
  ...CANTON_COIN_HOLDING_FILTERS,
  ...DA_STATE_TEMPLATES,
  AMULET_TEMPLATES.transferInstruction,
];

/** Canton Coin's holding templates. */
const CANTON_COIN_HOLDING_TEMPLATES: readonly string[] = [AMULET_TEMPLATES.amulet, AMULET_TEMPLATES.lockedAmulet];
/** Canton Coin contracts whose DSO must be confirmed before they are listed. */
const CANTON_COIN_TEMPLATES: readonly string[] = [
  ...CANTON_COIN_HOLDING_TEMPLATES,
  AMULET_TEMPLATES.transferInstruction,
];

/** Whether any of `contracts` is of one of `templateIds`. */
const anyOf = (contracts: readonly ActiveContract[], templateIds: readonly string[]): boolean =>
  contracts.some((contract) => templateIds.some((templateId) => isTemplate(contract, templateId)));

function requireNonEmpty(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WalletError('invalid-input', `${field} is required`);
  }
  return value;
}

/** Milliseconds of a caller's `Date`; `invalid-input` for an invalid one (NaN), which `toISOString` would throw on. */
function requireTime(date: Date, field: string): number {
  const ms = date instanceof Date ? date.getTime() : Number.NaN;
  if (!Number.isFinite(ms)) {
    throw new WalletError('invalid-input', `${field} is not a valid time`);
  }
  return ms;
}

/** ISO-8601 of a time in milliseconds; `invalid-input` when it is outside the `Date` range. */
function isoTime(ms: number, field: string): string {
  return new Date(requireTime(new Date(ms), field)).toISOString();
}

function requireInstrumentId(instrumentId: InstrumentId): InstrumentId {
  return {
    admin: requireNonEmpty(instrumentId.admin, 'instrumentId.admin'),
    id: requireNonEmpty(instrumentId.id, 'instrumentId.id'),
  };
}

/** A deadline after `at`: the given one, else `at + defaultMs`; `invalid-input` when it is not in the future. */
function deadline(executeBefore: Date | undefined, at: number, defaultMs: number): string {
  const ms = executeBefore === undefined ? at + defaultMs : requireTime(executeBefore, 'executeBefore');
  if (ms <= at) throw new WalletError('invalid-input', 'executeBefore must be in the future');
  return isoTime(ms, 'executeBefore');
}

/** The DA Registry token actions of `options.partyId` through `options.provider`. */
export function createWallet(options: WalletOptions): Wallet {
  const { provider, isActive, now: clock = () => new Date(), readRetry } = options as WalletInternalOptions;
  const partyId = requireNonEmpty(options.partyId, 'partyId');
  const { network } = options;
  if (!isDaNetwork(network)) throw new TypeError('createWallet: network must be devnet or mainnet');
  const registry: DaUtilitiesClient = createDaUtilitiesClient(network, options.registry);
  const now = (): number => requireTime(clock(), 'now()');
  /** Canton Coin's registry: the one DSO resolution holdings and offers share; null with `cantonCoin: false`. */
  const cantonCoin: AmuletRegistry | null =
    options.cantonCoin === false ? null : createAmuletRegistry(network, options.cantonCoin, { now });
  const stateFilters = cantonCoin === null ? DA_STATE_TEMPLATES : CANTON_COIN_STATE_FILTERS;
  const offerTemplates =
    cantonCoin === null
      ? [DA_REGISTRY_TEMPLATES.transferOffer]
      : [DA_REGISTRY_TEMPLATES.transferOffer, AMULET_TEMPLATES.transferInstruction];

  /** Refuse a write once the wallet session this wallet belongs to ended (`isActive`). */
  function requireActive(): void {
    if (isActive !== undefined && !isActive()) {
      throw new WalletError(
        'invalid-input',
        'The wallet session this action was prepared in has ended (the wallet disconnected or switched accounts); nothing was submitted. Start the action again.'
      );
    }
  }

  const ledger: Cip103Wallet = cip103Wallet(provider, partyId, readRetry !== undefined ? { readRetry } : {});

  /** A ledger read; an aborted `signal` stops waiting for it (the wallet's read itself cannot be cancelled). */
  async function read(
    templateId: string | readonly string[],
    signal: AbortSignal | undefined
  ): Promise<ActiveContract[]> {
    const templateIds = typeof templateId === 'string' ? [templateId] : templateId;
    return (await awaitWithAbort(async () => ledger.readActiveContracts(templateIds), signal)).contracts;
  }

  async function submit(submission: WalletSubmission, signal: AbortSignal | undefined): Promise<SubmitResult> {
    // Checked again right before the wallet signs: a write's reads and registry calls await, and the session may end
    // (or the caller abort) meanwhile. Never after: a submission handed to the wallet runs to its outcome.
    throwIfAborted(signal);
    requireActive();
    return ledger.submit(submission);
  }

  // Checked and taken synchronously (before the first await), so a second write started in the same tick is refused
  // and two writes never select the same holdings.
  let busy = false;
  // Bumped when a write settles: a snapshot started before then may predate the write, so later reads do not join it.
  let writesSettled = 0;
  async function exclusive<T>(signal: AbortSignal | undefined, action: () => Promise<T>): Promise<T> {
    if (busy) {
      throw new WalletError('busy', 'Another wallet action is in progress; nothing was submitted');
    }
    throwIfAborted(signal);
    requireActive();
    busy = true;
    try {
      return await action();
    } finally {
      busy = false;
      writesSettled += 1;
    }
  }

  /**
   * The confirmed DSO party for the Canton Coin among `contracts`. The registry is asked only when there is Canton Coin
   * to check, so a party without any never calls it. `unavailable` when there is but the DSO cannot be confirmed: all
   * of it is then left out (fail closed, never every DSO's).
   */
  async function cantonCoinDso(
    contracts: readonly ActiveContract[],
    signal: AbortSignal | undefined,
    waitMs?: number
  ): Promise<{ readonly dso: string | undefined; readonly unavailable: boolean }> {
    if (cantonCoin === null || !anyOf(contracts, CANTON_COIN_TEMPLATES)) {
      return { dso: undefined, unavailable: false };
    }
    const dso = await cantonCoin.dsoParty(signal, waitMs);
    return { dso, unavailable: dso === undefined };
  }

  /**
   * The party's genuine holdings among `contracts`, each contract once. Canton Coin counts only when it is of the
   * confirmed `dso`; without one, none does.
   */
  function holdingsIn(contracts: readonly ActiveContract[], dso?: string): Holding[] {
    const seen = new Set<string>();
    return contracts.flatMap((contract) => {
      const holding = parseHolding(contract);
      if (holding?.owner !== partyId || seen.has(holding.contractId)) return [];
      if (isCantonCoin(holding) && (dso === undefined || holding.instrumentId.admin !== dso)) return [];
      seen.add(holding.contractId);
      return [holding];
    });
  }

  /** The party's DA Registry holdings, for a transfer or burn (Canton Coin is read-only here). */
  const daHoldingsIn = (contracts: readonly ActiveContract[]): Holding[] =>
    holdingsIn(contracts).filter((holding) => !isCantonCoin(holding));

  /**
   * Refuse a Canton Coin transfer or burn: this wallet only reads Canton Coin. Before any read when the instrument is
   * the known DSO's `Amulet` (pinned, or already confirmed by the registry); otherwise (`holdings` given) an `Amulet`
   * the party holds no DA Registry holding of. A DA Registry instrument a registrar named `Amulet` stays transferable.
   */
  function refuseCantonCoin(instrumentId: InstrumentId, action: string, holdings?: readonly Holding[]): void {
    if (instrumentId.id !== AMULET_INSTRUMENT_ID) return;
    if (cantonCoin === null) return;
    const knownDso = cantonCoin.knownDsoParty();
    // A known DSO decides; otherwise, with the holdings read, an `Amulet` the party holds no DA Registry holding of.
    const isAmulet =
      knownDso !== undefined
        ? instrumentId.admin === knownDso
        : holdings !== undefined &&
          !holdings.some(
            (holding) =>
              holding.instrumentId.admin === instrumentId.admin && holding.instrumentId.id === instrumentId.id
          );
    if (isAmulet) {
      throw new WalletError(
        'invalid-input',
        `Canton Coin (Amulet) cannot be ${action} through this wallet yet; nothing was submitted`
      );
    }
  }

  /**
   * Refuse a DA transfer preapproval for Canton Coin's DSO: it would do nothing for Canton Coin (a DSO
   * `TransferPreapproval` is made through a validator, not this wallet). `dso` is the DSO party: pinned, or confirmed
   * by Canton Coin's registry; undefined when neither is known.
   */
  function refuseCantonCoinPreapproval(instrumentAdmin: string, dso: string | undefined): void {
    if (dso !== undefined && instrumentAdmin === dso) {
      throw new WalletError(
        'invalid-input',
        `${instrumentAdmin} is Canton Coin's DSO party: a DA transfer preapproval does nothing for Canton Coin; nothing was submitted`
      );
    }
  }

  /** The registry contracts of `parse` among `contracts` that DA's registry made (see `isFromRegistry`). */
  function fromRegistry<T extends MintOffer | TransferOffer | BurnRequest>(
    contracts: readonly ActiveContract[],
    parse: (contract: ActiveContract) => T | null,
    operator: string
  ): T[] {
    return contracts.flatMap((contract) => {
      const parsed = parse(contract);
      return parsed !== null && isFromRegistry(parsed, contract.signatories, operator, registry.trustedProvidersOf)
        ? [parsed]
        : [];
    });
  }

  const ownMintOffers = (contracts: readonly ActiveContract[], operator: string): MintOffer[] =>
    fromRegistry(contracts, parseMintOffer, operator).filter((offer) => offer.holder === partyId);
  const ownBurnRequests = (contracts: readonly ActiveContract[], operator: string): BurnRequest[] =>
    fromRegistry(contracts, parseBurnRequest, operator).filter((request) => request.holder === partyId);
  /**
   * DA's transfer offers among `contracts` that DA's registry made, and Canton Coin's of the confirmed `dso` that the
   * DSO and their sender signed (none without one).
   */
  function transferOffers(contracts: readonly ActiveContract[], operator: string, dso?: string): TransferOffers {
    return byDirection([
      ...fromRegistry(contracts, parseTransferOffer, operator),
      ...amuletTransferOffers(contracts, dso),
    ]);
  }
  /** Canton Coin's transfer offers among `contracts` of the confirmed `dso`, signed by it and their sender. */
  function amuletTransferOffers(contracts: readonly ActiveContract[], dso: string | undefined): TransferOffer[] {
    if (dso === undefined) return [];
    return contracts.flatMap((contract) => {
      const offer = parseAmuletTransferOffer(contract, dso);
      return offer === null ? [] : [offer];
    });
  }
  const byDirection = (offers: readonly TransferOffer[]): TransferOffers => ({
    incoming: offers.filter((offer) => offer.receiver === partyId && offer.sender !== partyId),
    outgoing: offers.filter((offer) => offer.sender === partyId),
  });
  /** The party's own preapprovals under DA's operator: the party is their only signatory. */
  const ownPreapprovals = (contracts: readonly ActiveContract[], operator: string): TransferPreapproval[] =>
    contracts.flatMap((contract) => {
      const preapproval = parseTransferPreapproval(contract);
      return preapproval !== null &&
        preapproval.receiver === partyId &&
        preapproval.operator === operator &&
        contract.signatories.includes(partyId)
        ? [preapproval]
        : [];
    });

  /** One of `listed`, by contract id; `not-found` otherwise. */
  function find<T extends { readonly contractId: string }>(listed: readonly T[], contractId: string, what: string): T {
    const found = listed.find((item) => item.contractId === contractId);
    if (found === undefined) {
      throw new WalletError(
        'not-found',
        `${what} ${contractId} is not among the wallet's active ${what.toLowerCase()}s`
      );
    }
    return found;
  }

  /** The balances of `holdings`, each with its registry's metadata (Canton Coin's is given: it is looked up apart). */
  async function balancesWithMetadata(
    holdings: readonly Holding[],
    cantonCoinMetadata: InstrumentMetadata | undefined
  ): Promise<InstrumentBalance[]> {
    return Promise.all(
      instrumentBalances(holdings).map(async (balance) => {
        const metadata = isCantonCoin(balance)
          ? cantonCoinMetadata
          : await registry.instrumentMetadata(balance.instrumentId);
        return metadata === undefined ? balance : { ...balance, metadata };
      })
    );
  }

  async function readState(): Promise<WalletState> {
    const { offset, contracts } = await ledger.readActiveContracts(stateFilters);
    // Asked only when the party has Canton Coin. The DSO and Canton Coin's metadata are looked up at once, so a
    // snapshot waits for the registry once (see `createAmuletRegistry` for how long).
    const [{ dso, unavailable }, cantonCoinMetadata] = await Promise.all([
      cantonCoinDso(contracts, undefined),
      cantonCoin !== null && anyOf(contracts, CANTON_COIN_HOLDING_TEMPLATES)
        ? cantonCoin.instrumentMetadata()
        : undefined,
    ]);
    const holdings = holdingsIn(contracts, dso);
    const [operator, balances] = await Promise.all([
      registry.operatorParty(),
      balancesWithMetadata(holdings, cantonCoinMetadata),
    ]);
    const at = now();
    const withExpiry = (offers: readonly TransferOffer[]): TransferOffer[] =>
      offers.map((offer) => ({ ...offer, expired: isTransferOfferExpired(offer, at) }));
    const offers = transferOffers(contracts, operator, dso);
    const outgoing = withExpiry(offers.outgoing);
    const reclaimable = lockedInExpiredOffers(
      holdings,
      outgoing.filter((offer) => offer.expired === true)
    );
    return {
      offset,
      holdings,
      balances: balances.map((balance) => ({
        ...balance,
        lockedInExpiredOffers: formatDecimalUnits(reclaimable.get(balance.key) ?? 0n),
      })),
      transferOffers: { incoming: withExpiry(offers.incoming), outgoing },
      mintOffers: ownMintOffers(contracts, operator),
      burnRequests: ownBurnRequests(contracts, operator),
      transferPreapprovals: ownPreapprovals(contracts, operator),
      cantonCoinUnavailable: unavailable,
    };
  }

  let inFlight: { readonly writesSettled: number; readonly promise: Promise<WalletState> } | undefined;
  /** The snapshot is shared by concurrent callers, so a caller's `signal` only stops that caller waiting for it. */
  async function loadState({ signal }: WalletCallOptions = {}): Promise<WalletState> {
    throwIfAborted(signal);
    if (inFlight?.writesSettled !== writesSettled) {
      const promise: Promise<WalletState> = readState().finally(() => {
        if (inFlight?.promise === promise) inFlight = undefined;
      });
      inFlight = { writesSettled, promise };
    }
    const shared = inFlight.promise;
    // A cancelled caller may never observe `shared`; other callers still do, so a later failure is never unhandled.
    void shared.catch(() => undefined);
    return signal === undefined ? shared : awaitWithAbort(async () => shared, signal);
  }

  /** A validated, frozen copy of a transfer request, so a later change to the caller's object changes nothing. */
  function plannedRequest(request: TransferRequest): Readonly<TransferRequest> {
    const { memo, requirePreapproval, executeBefore } = request;
    const instrumentId = requireInstrumentId(request.instrumentId);
    refuseCantonCoin(instrumentId, 'transferred');
    return Object.freeze({
      receiver: requireNonEmpty(request.receiver, 'receiver'),
      instrumentId: Object.freeze(instrumentId),
      amount: request.amount,
      ...(memo !== undefined && memo.length > 0 && { memo }),
      ...(requirePreapproval === true && { requirePreapproval }),
      ...(executeBefore !== undefined && { executeBefore: new Date(requireTime(executeBefore, 'executeBefore')) }),
    });
  }

  /**
   * Select inputs and ask the registry for the factory. The factory must be a disclosed contract of a template DA uses
   * for the kind it answered (a direct transfer runs through a `TransferPreapproval`, nothing else does).
   */
  async function prepareTransfer(
    request: Readonly<TransferRequest>,
    signal: AbortSignal | undefined
  ): Promise<{ transfer: TransferSpec; factory: TransferFactory }> {
    const at = now();
    const executeBefore = deadline(request.executeBefore, at, TRANSFER_TTL_MS);
    const daHoldings = daHoldingsIn(await read(DA_REGISTRY_TEMPLATES.holding, signal));
    refuseCantonCoin(request.instrumentId, 'transferred', daHoldings);
    const selection = selectHoldings(daHoldings, {
      owner: partyId,
      instrumentId: request.instrumentId,
      amount: request.amount,
    });
    const transfer: TransferSpec = {
      sender: partyId,
      receiver: request.receiver,
      amount: selection.amount,
      instrumentId: request.instrumentId,
      requestedAt: isoTime(at - REQUESTED_AT_SKEW_MS, 'requestedAt'),
      executeBefore,
      inputHoldingCids: selection.inputHoldingCids,
      meta: { values: request.memo !== undefined ? { [TOKEN_STANDARD_V1_REASON_META_KEY]: request.memo } : {} },
    };
    const factory = await registry.transferFactory(request.instrumentId.admin, transfer, signal);
    const factoryError = factoryTemplateError(factory, DA_TRANSFER_FACTORY_TEMPLATES[factory.transferKind]);
    if (factoryError !== null) {
      throw new RegistryResponseError(`${factoryError} It answered a ${factory.transferKind} transfer.`);
    }
    return { transfer, factory };
  }

  async function planTransfer(request: TransferRequest, call: WalletCallOptions = {}): Promise<TransferPlan> {
    // The plan's own `submit` takes its own signal: this one cancels planning only.
    const planSignal = call.signal;
    throwIfAborted(planSignal);
    const planned = plannedRequest(request);
    const kind = (await prepareTransfer(planned, planSignal)).factory.transferKind;
    if (planned.requirePreapproval === true && kind !== 'direct') {
      throw new WalletError(
        'preapproval-required',
        `The receiver has no matching transfer preapproval (the registry would make a${kind === 'offer' ? 'n offer' : ` ${kind} transfer`}); nothing was submitted`
      );
    }
    return Object.freeze({
      kind,
      description: TRANSFER_KIND_DESCRIPTIONS[kind],
      partyId,
      request: planned,
      submit: async ({ signal }: WalletCallOptions = {}) =>
        exclusive(signal, async (): Promise<TransferResult> => {
          const { transfer, factory } = await prepareTransfer(planned, signal);
          if (factory.transferKind !== kind) {
            throw new WalletError(
              'kind-changed',
              `The registry would now make a${factory.transferKind === 'offer' ? 'n' : ''} ${factory.transferKind} transfer, not the planned ${kind}; nothing was submitted`
            );
          }
          const result = await submit(
            {
              commands: [
                transferCommand({
                  factoryId: factory.factoryId,
                  expectedAdmin: transfer.instrumentId.admin,
                  transfer,
                  context: factory.choiceContextData,
                }),
              ],
              disclosedContracts: factory.disclosedContracts,
            },
            signal
          );
          return { kind, ...result };
        }),
    });
  }

  async function answerTransferOffer(
    transferOfferCid: string,
    action: TransferInstructionAction,
    signal: AbortSignal | undefined
  ): Promise<SubmitResult> {
    // Read the target first, then resolve only the registry that validates it: the DSO for a Canton Coin offer, DA's
    // operator for a DA offer. Neither offer kind depends on the other registry being up.
    const target = (await read(offerTemplates, signal)).filter((contract) => contract.contractId === transferOfferCid);
    let offers: TransferOffers;
    if (cantonCoin !== null && anyOf(target, [AMULET_TEMPLATES.transferInstruction])) {
      const { dso, unavailable } = await cantonCoinDso(target, signal, AMULET_REGISTRY_REQUEST_TIMEOUT_MS);
      if (unavailable) {
        throw new RegistryResponseError(
          `${AMULET_REGISTRY_NAME} could not confirm Canton Coin's DSO party, so transfer offer ${transferOfferCid} cannot be checked; nothing was submitted. Try again later, or pin cantonCoin.dsoParty.`
        );
      }
      offers = byDirection(amuletTransferOffers(target, dso));
    } else if (anyOf(target, [DA_REGISTRY_TEMPLATES.transferOffer])) {
      offers = byDirection(fromRegistry(target, parseTransferOffer, await registry.operatorParty(signal)));
    } else {
      offers = { incoming: [], outgoing: [] };
    }
    const { incoming, outgoing } = offers;
    const offer = find(
      action === 'withdraw' ? outgoing : incoming,
      transferOfferCid,
      action === 'withdraw' ? 'Outgoing transfer offer' : 'Incoming transfer offer'
    );
    return submitOfferAnswer(offer, action, signal);
  }

  /** Exercise `action` on a transfer offer already read and validated, with its own registry's choice context. */
  async function submitOfferAnswer(
    offer: TransferOffer,
    action: TransferInstructionAction,
    signal: AbortSignal | undefined
  ): Promise<SubmitResult> {
    const transferOfferCid = offer.contractId;
    const context =
      offer.registry === 'amulet' && cantonCoin !== null
        ? await cantonCoin.transferInstructionContext(transferOfferCid, action, signal)
        : await registry.transferInstructionContext(offer.instrumentId.admin, transferOfferCid, action, signal);
    return submit(
      {
        commands: [transferInstructionCommand(transferOfferCid, action, context.choiceContextData)],
        disclosedContracts: context.disclosedContracts,
      },
      signal
    );
  }

  /**
   * Withdraw every one of the party's own expired transfer offers of `instrumentId`, one submission each, oldest
   * deadline first. Read once; each offer is withdrawn through its own registry (Canton Coin's for a Canton Coin offer,
   * DA's for a DA offer), exactly as `withdrawTransferOffer` does. Stops at the first failure and throws it (the offers
   * withdrawn before it stay withdrawn; a reload shows them).
   */
  async function runWithdrawExpired(
    instrumentIdInput: InstrumentId,
    signal: AbortSignal | undefined
  ): Promise<WithdrawExpiredResult> {
    const instrumentId = requireInstrumentId(instrumentIdInput);
    const contracts = (await read(offerTemplates, signal)).filter((contract) => {
      const transfer = contract.createArgument?.['transfer'];
      return isRecord(transfer) && transfer['sender'] === partyId;
    });
    const candidates: TransferOffer[] = [];
    let cantonCoinUnconfirmed = false;
    if (
      cantonCoin !== null &&
      instrumentId.id === AMULET_INSTRUMENT_ID &&
      anyOf(contracts, [AMULET_TEMPLATES.transferInstruction])
    ) {
      const { dso, unavailable } = await cantonCoinDso(contracts, signal, AMULET_REGISTRY_REQUEST_TIMEOUT_MS);
      cantonCoinUnconfirmed = unavailable;
      candidates.push(...amuletTransferOffers(contracts, dso));
    }
    const isAmuletOf = candidates.some((offer) => sameInstrument(offer.instrumentId, instrumentId));
    if (!isAmuletOf && anyOf(contracts, [DA_REGISTRY_TEMPLATES.transferOffer])) {
      candidates.push(...fromRegistry(contracts, parseTransferOffer, await registry.operatorParty(signal)));
    }
    const at = now();
    const expired = byDirection(candidates)
      .outgoing.filter((offer) => sameInstrument(offer.instrumentId, instrumentId) && isTransferOfferExpired(offer, at))
      .sort(
        (a, b) => Date.parse(a.executeBefore) - Date.parse(b.executeBefore) || (a.contractId < b.contractId ? -1 : 1)
      );
    if (expired.length === 0) {
      if (cantonCoinUnconfirmed) {
        throw new RegistryResponseError(
          `${AMULET_REGISTRY_NAME} could not confirm Canton Coin's DSO party, so the wallet's Canton Coin offers cannot be checked; nothing was submitted. Try again later, or pin cantonCoin.dsoParty.`
        );
      }
      throw new WalletError(
        'not-found',
        `The wallet has no expired outgoing transfer offers of ${instrumentId.id}; nothing was submitted`
      );
    }
    const withdrawn: WithdrawnOffer[] = [];
    for (const offer of expired) {
      const result = await submitOfferAnswer(offer, 'withdraw', signal);
      withdrawn.push({ ...result, transferOfferCid: offer.contractId, amount: offer.amount });
    }
    return { withdrawn };
  }

  async function ownMintOffer(mintOfferCid: string, signal: AbortSignal | undefined): Promise<MintOffer> {
    const [contracts, operator] = await Promise.all([
      read(DA_REGISTRY_TEMPLATES.mintOffer, signal),
      registry.operatorParty(signal),
    ]);
    return find(ownMintOffers(contracts, operator), mintOfferCid, 'Mint offer');
  }

  async function runRequestBurn(burn: BurnRequestOptions, signal: AbortSignal | undefined): Promise<BurnRequestResult> {
    const instrumentId = requireInstrumentId(burn.instrumentId);
    refuseCantonCoin(instrumentId, 'burned');
    const at = now();
    const reference = burn.reference ?? newBurnReference(new Date(at));
    if (typeof reference !== 'string' || !BURN_REFERENCE_PATTERN.test(reference)) {
      throw new WalletError(
        'invalid-input',
        'reference must be 1-100 characters of letters, digits and . _ : - (starting with a letter or digit), with no personal data'
      );
    }
    const executeBefore = deadline(burn.executeBefore, at, BURN_TTL_MS);
    const daHoldings = daHoldingsIn(await read(DA_REGISTRY_TEMPLATES.holding, signal));
    refuseCantonCoin(instrumentId, 'burned', daHoldings);
    const selection = selectHoldings(daHoldings, {
      owner: partyId,
      instrumentId,
      amount: burn.amount,
    });
    const factory = await registry.burnRequestContext(
      {
        holder: partyId,
        holdingContractIds: selection.inputHoldingCids,
        instrumentId,
      },
      signal
    );
    const factoryError = factoryTemplateError(factory, DA_BURN_FACTORY_TEMPLATES);
    if (factoryError !== null) throw new RegistryResponseError(factoryError);
    try {
      const result = await submit(
        {
          commands: [
            requestBurnCommand({
              allocationFactoryCid: factory.factoryId,
              expectedAdmin: instrumentId.admin,
              burn: {
                instrumentId,
                amount: selection.amount,
                holder: partyId,
                reference,
                requestedAt: isoTime(at - REQUESTED_AT_SKEW_MS, 'requestedAt'),
                executeBefore,
              },
              holdingCids: selection.inputHoldingCids,
              context: factory.choiceContextData,
            }),
          ],
          disclosedContracts: factory.disclosedContracts,
        },
        signal
      );
      return { ...result, reference };
    } catch (error) {
      // The reference may have been generated here: the caller needs it to look the burn request up before a retry,
      // above all after an unknown outcome, when the request may have been filed.
      if (!isWalletSubmitError(error)) throw error;
      throw new WalletSubmitError(error.outcome, `${error.message} Burn reference: ${reference}.`, {
        ...(error.code !== undefined && { code: error.code }),
        ...(error.commandId !== undefined && { commandId: error.commandId }),
        category: error.category,
        ...(error.cantonErrorId !== undefined && { cantonErrorId: error.cantonErrorId }),
        burnReference: reference,
      });
    }
  }

  async function runCreateTransferPreapproval(
    preapproval: TransferPreapprovalOptions,
    signal: AbortSignal | undefined
  ): Promise<SubmitResult> {
    const instrumentAdmin = requireNonEmpty(preapproval.instrumentAdmin, 'instrumentAdmin');
    // A known DSO (pinned, or confirmed earlier) refuses before any read.
    const knownDso = cantonCoin?.knownDsoParty();
    refuseCantonCoinPreapproval(instrumentAdmin, knownDso);
    const instrumentIds = [...new Set(preapproval.instrumentIds ?? [])];
    if (instrumentIds.length > MAX_PREAPPROVAL_INSTRUMENTS) {
      throw new WalletError(
        'invalid-input',
        `A preapproval allows at most ${MAX_PREAPPROVAL_INSTRUMENTS} instrument ids`
      );
    }
    instrumentIds.forEach((id) => requireNonEmpty(id, 'instrumentIds[]'));
    // Only the party's preapprovals are read (never its holdings, which could exceed the participant's ACS list limit).
    // Unpinned and not yet confirmed, Canton Coin's registry is asked for the DSO alongside, with its usual bounds (the
    // whole request on a first lookup, then a short wait; nothing during the back-off after a failure). When it cannot
    // confirm the DSO, the DA preapproval is still created (fail open): DA writes do not depend on Scan, and a DA
    // preapproval naming the DSO is inert (it lets no Canton Coin in) and can be withdrawn.
    const [contracts, operator, dso] = await Promise.all([
      read(DA_REGISTRY_TEMPLATES.transferPreapproval, signal),
      registry.operatorParty(signal),
      cantonCoin === null || knownDso !== undefined ? knownDso : cantonCoin.dsoParty(signal),
    ]);
    refuseCantonCoinPreapproval(instrumentAdmin, dso);
    const covering = coveringPreapproval(ownPreapprovals(contracts, operator), { instrumentAdmin, instrumentIds });
    if (covering !== null) {
      throw new WalletError(
        'already-exists',
        `Transfer preapproval ${covering.contractId} already covers ${instrumentIds.length === 0 ? 'every instrument' : instrumentIds.join(', ')} of ${instrumentAdmin}; nothing was submitted`
      );
    }
    return submit(
      {
        commands: [createDaTransferPreapprovalCommand({ operator, receiver: partyId, instrumentAdmin, instrumentIds })],
      },
      signal
    );
  }

  async function runRemoveTransferPreapproval(
    preapprovalCid: string,
    signal: AbortSignal | undefined
  ): Promise<SubmitResult> {
    const [contracts, operator] = await Promise.all([
      read(DA_REGISTRY_TEMPLATES.transferPreapproval, signal),
      registry.operatorParty(signal),
    ]);
    find(ownPreapprovals(contracts, operator), preapprovalCid, 'Transfer preapproval');
    return submit({ commands: [withdrawTransferPreapprovalCommand(preapprovalCid, partyId)] }, signal);
  }

  return {
    partyId,
    network,
    loadState,
    planTransfer,
    acceptTransferOffer: async (cid, { signal } = {}) =>
      exclusive(signal, async () => answerTransferOffer(cid, 'accept', signal)),
    rejectTransferOffer: async (cid, { signal } = {}) =>
      exclusive(signal, async () => answerTransferOffer(cid, 'reject', signal)),
    withdrawTransferOffer: async (cid, { signal } = {}) =>
      exclusive(signal, async () => answerTransferOffer(cid, 'withdraw', signal)),
    withdrawExpiredTransferOffers: async (instrumentId, { signal } = {}) =>
      exclusive(signal, async () => runWithdrawExpired(instrumentId, signal)),
    acceptMintOffer: async (cid, { signal } = {}) =>
      exclusive(signal, async () => {
        await ownMintOffer(cid, signal);
        const context = await registry.mintOfferAcceptContext(cid, signal);
        return submit(
          {
            commands: [acceptMintOfferCommand(cid, context.choiceContextData)],
            disclosedContracts: context.disclosedContracts,
          },
          signal
        );
      }),
    rejectMintOffer: async (cid, { signal } = {}) =>
      exclusive(signal, async () => {
        await ownMintOffer(cid, signal);
        return submit({ commands: [rejectMintOfferCommand(cid, MINT_OFFER_REJECT_REASON)] }, signal);
      }),
    requestBurn: async (burn, { signal } = {}) => exclusive(signal, async () => runRequestBurn(burn, signal)),
    cancelBurnRequest: async (cid, { signal } = {}) =>
      exclusive(signal, async () => {
        const [contracts, operator] = await Promise.all([
          read(DA_REGISTRY_TEMPLATES.burnRequest, signal),
          registry.operatorParty(signal),
        ]);
        find(ownBurnRequests(contracts, operator), cid, 'Burn request');
        return submit({ commands: [cancelBurnRequestCommand(cid)] }, signal);
      }),
    createTransferPreapproval: async (preapproval, { signal } = {}) =>
      exclusive(signal, async () => runCreateTransferPreapproval(preapproval, signal)),
    removeTransferPreapproval: async (cid, { signal } = {}) =>
      exclusive(signal, async () => runRemoveTransferPreapproval(cid, signal)),
  };
}
