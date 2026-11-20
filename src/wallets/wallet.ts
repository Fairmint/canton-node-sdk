/**
 * One wallet party's DA Utility Registry token actions through any CIP-0103 wallet provider: holdings, transfers,
 * transfer offers, mint offers, burn requests and transfer preapprovals. Every write reads its contracts fresh, fetches
 * its choice context from DA's Utilities API, refuses anything that does not check out, and submits as the wallet party
 * only.
 *
 * Trust: a holding counts when its registrar and owner signed it; an offer, a request or a preapproval when it names
 * DA's operator and (offers and requests) a provider trusted for its instrument admin signed it. By default a registrar
 * must be its own provider; `registry.trustedProviders` trusts others (see `isFromRegistry`).
 */
import {
  cip103Wallet,
  isDaNetwork,
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
  isFromRegistry,
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
import { isWalletSubmitError, RegistryResponseError, WalletError, WalletSubmitError } from './errors';
import { instrumentBalances, parseHolding, selectHoldings, type Holding, type InstrumentBalance } from './holdings';
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
  /** The wallet party's DA holdings, locked ones included. */
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

/** Every template a state snapshot reads, in one cumulative filter. */
const STATE_TEMPLATES = [
  DA_REGISTRY_TEMPLATES.holding,
  DA_REGISTRY_TEMPLATES.transferOffer,
  DA_REGISTRY_TEMPLATES.mintOffer,
  DA_REGISTRY_TEMPLATES.burnRequest,
  DA_REGISTRY_TEMPLATES.transferPreapproval,
];

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
  async function read(templateId: string, signal: AbortSignal | undefined): Promise<ActiveContract[]> {
    return (await awaitWithAbort(async () => ledger.readActiveContracts([templateId]), signal)).contracts;
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

  const holdingsIn = (contracts: readonly ActiveContract[]): Holding[] =>
    contracts.flatMap((contract) => {
      const holding = parseHolding(contract);
      return holding !== null && holding.owner === partyId ? [holding] : [];
    });

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
  function transferOffers(contracts: readonly ActiveContract[], operator: string): TransferOffers {
    const offers = fromRegistry(contracts, parseTransferOffer, operator);
    return {
      incoming: offers.filter((offer) => offer.receiver === partyId && offer.sender !== partyId),
      outgoing: offers.filter((offer) => offer.sender === partyId),
    };
  }
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

  async function balancesWithMetadata(holdings: readonly Holding[]): Promise<InstrumentBalance[]> {
    return Promise.all(
      instrumentBalances(holdings).map(async (balance) => {
        const metadata = await registry.instrumentMetadata(balance.instrumentId);
        return metadata === undefined ? balance : { ...balance, metadata };
      })
    );
  }

  async function readState(): Promise<WalletState> {
    const { offset, contracts } = await ledger.readActiveContracts(STATE_TEMPLATES);
    const holdings = holdingsIn(contracts);
    const [operator, balances] = await Promise.all([registry.operatorParty(), balancesWithMetadata(holdings)]);
    return {
      offset,
      holdings,
      balances,
      transferOffers: transferOffers(contracts, operator),
      mintOffers: ownMintOffers(contracts, operator),
      burnRequests: ownBurnRequests(contracts, operator),
      transferPreapprovals: ownPreapprovals(contracts, operator),
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
    return signal === undefined ? shared : awaitWithAbort(async () => shared, signal);
  }

  /** A validated, frozen copy of a transfer request, so a later change to the caller's object changes nothing. */
  function plannedRequest(request: TransferRequest): Readonly<TransferRequest> {
    const { memo, requirePreapproval, executeBefore } = request;
    return Object.freeze({
      receiver: requireNonEmpty(request.receiver, 'receiver'),
      instrumentId: Object.freeze(requireInstrumentId(request.instrumentId)),
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
    const selection = selectHoldings(holdingsIn(await read(DA_REGISTRY_TEMPLATES.holding, signal)), {
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
    const [contracts, operator] = await Promise.all([
      read(DA_REGISTRY_TEMPLATES.transferOffer, signal),
      registry.operatorParty(signal),
    ]);
    const { incoming, outgoing } = transferOffers(contracts, operator);
    const offer = find(
      action === 'withdraw' ? outgoing : incoming,
      transferOfferCid,
      action === 'withdraw' ? 'Outgoing transfer offer' : 'Incoming transfer offer'
    );
    const context = await registry.transferInstructionContext(
      offer.instrumentId.admin,
      transferOfferCid,
      action,
      signal
    );
    return submit(
      {
        commands: [transferInstructionCommand(transferOfferCid, action, context.choiceContextData)],
        disclosedContracts: context.disclosedContracts,
      },
      signal
    );
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
    const at = now();
    const reference = burn.reference ?? newBurnReference(new Date(at));
    if (typeof reference !== 'string' || !BURN_REFERENCE_PATTERN.test(reference)) {
      throw new WalletError(
        'invalid-input',
        'reference must be 1-100 characters of letters, digits and . _ : - (starting with a letter or digit), with no personal data'
      );
    }
    const executeBefore = deadline(burn.executeBefore, at, BURN_TTL_MS);
    const selection = selectHoldings(holdingsIn(await read(DA_REGISTRY_TEMPLATES.holding, signal)), {
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
    const instrumentIds = [...new Set(preapproval.instrumentIds ?? [])];
    if (instrumentIds.length > MAX_PREAPPROVAL_INSTRUMENTS) {
      throw new WalletError(
        'invalid-input',
        `A preapproval allows at most ${MAX_PREAPPROVAL_INSTRUMENTS} instrument ids`
      );
    }
    instrumentIds.forEach((id) => requireNonEmpty(id, 'instrumentIds[]'));
    const [contracts, operator] = await Promise.all([
      read(DA_REGISTRY_TEMPLATES.transferPreapproval, signal),
      registry.operatorParty(signal),
    ]);
    const covering = ownPreapprovals(contracts, operator).find(
      (existing) =>
        existing.instrumentAdmin === instrumentAdmin &&
        (existing.instrumentIds.length === 0 ||
          (instrumentIds.length > 0 && instrumentIds.every((id) => existing.instrumentIds.includes(id))))
    );
    if (covering !== undefined) {
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
