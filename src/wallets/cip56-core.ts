/**
 * The CIP-56 (token standard V1) core of `createWallet`, over any CIP-0103 wallet provider and any `TokenRegistry`:
 * list the registry's holdings, preview and run a transfer, and answer pending transfers. Internal: `wallet.ts` adds
 * DA's mint, burn and preapproval actions and exports the wallet.
 */
import {
  cip103Wallet,
  primaryPartyId,
  type Cip103Provider,
  type Cip103Wallet,
  type WalletReadRetryOptions,
} from './cip103';
import { transferCommand, transferInstructionCommand } from './commands';
import type { TransferOffer } from './contracts';
import { RegistryResponseError, WalletError } from './errors';
import { instrumentBalances, parseHolding, selectHoldings, type Holding, type InstrumentBalance } from './holdings';
import {
  TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID,
  TOKEN_STANDARD_V1_REASON_META_KEY,
} from '../utils/token-standard/v1/constants';
import { contractFilterKey, contractMatchesFilter } from './templates';
import {
  factoryTemplateError,
  type ReadContracts,
  type TokenRegistry,
  type TransferInstructionAction,
  type TransferFactory,
  type TransferKind,
  type TransferSpec,
} from './token-registry';
import type { ActiveContract, ContractFilter, InstrumentId, SubmitResult } from './types';

const SECOND_MS = 1000;
const DAY_MS = 24 * 60 * 60 * SECOND_MS;

/** Transfers: `executeBefore` = now + 24 h, a common wallet default. */
export const TRANSFER_TTL_MS = DAY_MS;
/**
 * `requestedAt` = now − 60 s for transfers and burn requests: registries require it in the past by ledger time, and the
 * client's clock can run ahead of the participant's.
 */
export const REQUESTED_AT_SKEW_MS = 60 * SECOND_MS;

/** The options of the CIP-56 core; `WalletOptions` builds on them. */
export interface CoreOptions {
  /**
   * Any CIP-0103 (Canton dApp API) provider, already connected by the dApp: Loop's `loop.getCip103Provider()`, a
   * `@canton-network/dapp-sdk` provider, `window.canton`, …
   */
  readonly provider: Cip103Provider;
  /**
   * Act as this party. Defaults to the wallet's primary account, read on every action (a `TransferPlan` keeps the party
   * it was previewed for, and refuses to submit as another).
   */
  readonly partyId?: string;
  readonly registry: TokenRegistry;
  /** Defaults to the system clock. */
  readonly now?: () => Date;
  /** How reads back off when the wallet rate-limits them (CIP-0103 -32005). Writes are never retried. */
  readonly readRetry?: WalletReadRetryOptions;
  /**
   * Whether the wallet session this token wallet belongs to is still live. Once it answers false, every write (a
   * transfer, a `TransferPlan`'s `submit`, an offer answer, a mint accept, a burn request, a preapproval) is refused
   * with `invalid-input` before its first read, and again right before the wallet signs, so nothing is submitted: the
   * provider may now be signed in to another account. Reads are not limited. `createWalletStore` passes its session's
   * `isCurrent(wallet)`. Default: always live.
   */
  readonly isActive?: () => boolean;
}

/** The CIP-56 part of `WalletState`, read as one snapshot. */
export interface BaseState {
  /** The party the snapshot was read for. */
  readonly partyId: string;
  /** The ledger offset every list was read at. */
  readonly offset: number;
  /** The wallet party's holdings this registry serves, locked ones included. */
  readonly holdings: Holding[];
  /** `holdings` summed per instrument (unlocked and locked apart), sorted by instrument id then admin. */
  readonly balances: InstrumentBalance[];
  readonly transferOffers: TransferOffers;
}

export interface TransferRequest {
  readonly receiver: string;
  readonly instrumentId: InstrumentId;
  /** Positive decimal, at most 10 places. */
  readonly amount: string;
}

export interface TransferOptions extends TransferRequest {
  /** Shown to the receiver as the transfer's reason (`splice.lfdecentralizedtrust.org/reason`). */
  readonly memo?: string;
  /**
   * Submit only if the receiver pre-approved the transfer (the registry answers `direct`). Anything else is refused
   * with `preapproval-required` before signing, so no offer is ever created.
   */
  readonly requirePreapproval?: boolean;
  /**
   * The kind `previewTransfer` reported and the user confirmed. When the registry now answers another kind (a
   * preapproval expired or appeared in between), the transfer is refused with `kind-changed` before signing.
   */
  readonly expectedKind?: TransferKind;
}

export interface TransferResult extends SubmitResult {
  readonly kind: TransferKind;
}

/**
 * A previewed transfer, for a dApp that shows the user how the registry will run it before they confirm. `submit` sends
 * exactly the planned request through the token wallet that planned it, as the party it was previewed for and with
 * `expectedKind: kind`: a transfer whose kind changed in between is refused with `kind-changed`, and one whose wallet
 * now acts as another party (an account switch, without a pinned `partyId`) with `invalid-input`, both before signing.
 *
 * A plan is bound to the wallet session that made it: when that token wallet's `isActive` answers false (the token
 * wallets `createWalletStore` opens: their `ConnectedWallet` is no longer the session's), `submit` is refused with
 * `invalid-input` and nothing is submitted, also when its `partyId` is pinned. Plan again in the current session.
 */
export interface TransferPlan {
  /** How the registry would run the transfer when it was planned. */
  readonly kind: TransferKind;
  /** The party the transfer was previewed for, and the only one `submit` sends it as. */
  readonly partyId: string;
  /** The request as planned (a frozen copy). */
  readonly request: Readonly<TransferRequest>;
  /** Run the transfer (a write: one at a time, see `Wallet`). */
  submit(options?: { readonly memo?: string; readonly requirePreapproval?: boolean }): Promise<TransferResult>;
}

export interface TransferOffers {
  /** Offers to the wallet party, which it can accept or reject. */
  readonly incoming: TransferOffer[];
  /** The wallet party's own offers, which it can withdraw. */
  readonly outgoing: TransferOffer[];
}

/** The CIP-56 actions of `Wallet`, on any registry's instruments. */
export interface TransferActions {
  /** The party every action reads and acts as. */
  partyId(): Promise<string>;
  /** The wallet party's holdings this registry serves, locked ones included (`locked: true`). */
  listHoldings(): Promise<Holding[]>;
  /** How the registry would run this transfer, without submitting it. */
  previewTransfer(request: TransferRequest): Promise<TransferKind>;
  /** Preview a transfer and keep it to submit once the user confirmed the kind (see {@link TransferPlan}). */
  planTransfer(request: TransferRequest): Promise<TransferPlan>;
  transfer(options: TransferOptions): Promise<TransferResult>;
  listTransferOffers(): Promise<TransferOffers>;
  acceptTransferOffer(transferOfferCid: string): Promise<SubmitResult>;
  rejectTransferOffer(transferOfferCid: string): Promise<SubmitResult>;
  withdrawTransferOffer(transferOfferCid: string): Promise<SubmitResult>;
  /**
   * Answer a transfer offer: `accept` or `reject` an incoming one, `withdraw` an outgoing one (the same as the three
   * methods above). Any other action is refused with `invalid-input`.
   */
  answerTransferOffer(transferOfferCid: string, action: TransferInstructionAction): Promise<SubmitResult>;
}

export function requireNonEmpty(value: string, field: string): string {
  if (value.trim().length === 0) {
    throw new WalletError('invalid-input', `${field} is required`);
  }
  return value;
}

/** Milliseconds of a caller's `Date`; `invalid-input` for an invalid one (NaN), which `toISOString` would throw on. */
export function requireTime(date: Date, field: string): number {
  const ms = date instanceof Date ? date.getTime() : Number.NaN;
  if (!Number.isFinite(ms)) {
    throw new WalletError('invalid-input', `${field} is not a valid time`);
  }
  return ms;
}

/** ISO-8601 of a time in milliseconds; `invalid-input` when it is outside the `Date` range. */
export function isoTime(ms: number, field: string): string {
  return new Date(requireTime(new Date(ms), field)).toISOString();
}

export function requireInstrumentId(instrumentId: InstrumentId): InstrumentId {
  return {
    admin: requireNonEmpty(instrumentId.admin, 'instrumentId.admin'),
    id: requireNonEmpty(instrumentId.id, 'instrumentId.id'),
  };
}

/** One state snapshot of the wallet party. */
export interface StateSnapshot {
  readonly wallet: Cip103Wallet;
  readonly offset: number;
  /** The wallet party's holdings the registry serves, selected from the snapshot as a write's fresh read selects them. */
  readonly holdings: Holding[];
  /**
   * Serves the snapshot's own filters from the snapshot; any other filter is read from the wallet at the snapshot's
   * offset (once per filter), so every list read through it belongs to the same snapshot.
   */
  readonly read: ReadContracts;
}

/** What `createWallet` builds on: the CIP-56 actions, the wallet as the current party, the write guard. */
export interface Cip56Core {
  readonly api: TransferActions;
  /** The clock in milliseconds; `invalid-input` when it gives an invalid `Date`. */
  readonly now: () => number;
  /** The wallet as the current party: resolved per action, so an account switch in the wallet is followed. */
  readonly connect: () => Promise<Cip103Wallet>;
  /** The party's unlocked and locked holdings that the registry serves, freshly read (for writes). */
  readonly holdingsOf: (wallet: Cip103Wallet) => Promise<Holding[]>;
  /**
   * One snapshot of every state filter (holdings, the registry's pending transfers and the extension's own filters).
   * Concurrent calls for the same party share the snapshot in flight unless a write settled since it started.
   */
  readonly snapshot: () => Promise<StateSnapshot>;
  /** The CIP-56 state in a snapshot. */
  readonly stateOf: (snapshot: StateSnapshot) => Promise<BaseState>;
  /**
   * Run a write action alone: refused with `busy` (before `action` starts) while another write of this token wallet is
   * in progress, and released when `action` settles, whether it succeeded or failed. Refused with `invalid-input`
   * (before `action` starts) once `isActive` answers false; a wallet from `connect` checks it again before it submits.
   */
  readonly exclusive: <T>(action: () => Promise<T>) => Promise<T>;
}

const HOLDING_FILTER: ContractFilter = { interfaceId: TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID };
const TRANSFER_INSTRUCTION_ACTIONS: readonly TransferInstructionAction[] = ['accept', 'reject', 'withdraw'];

/**
 * The CIP-56 core of `createWallet`, which adds DA's actions on top of it and, with DA's registry, DA's filters to the
 * state snapshot through `extraStateFilters`.
 */
export function cip56Core(options: CoreOptions, extraStateFilters: readonly ContractFilter[] = []): Cip56Core {
  const { provider, registry } = options;
  const clock = options.now ?? (() => new Date());
  const now = (): number => requireTime(clock(), 'now()');
  if (options.partyId !== undefined) requireNonEmpty(options.partyId, 'partyId');

  async function partyId(): Promise<string> {
    return options.partyId ?? primaryPartyId(provider);
  }

  const { isActive } = options;
  /** Refuse a write once the wallet session this token wallet belongs to ended (`isActive`). */
  function requireActive(): void {
    if (isActive !== undefined && !isActive()) {
      throw new WalletError(
        'invalid-input',
        'The wallet session this action was prepared in has ended (the wallet disconnected or switched accounts); nothing was submitted. Start the action again.'
      );
    }
  }

  const walletOptions = options.readRetry !== undefined ? { readRetry: options.readRetry } : {};
  function walletOf(party: string): Cip103Wallet {
    const wallet = cip103Wallet(provider, party, walletOptions);
    if (isActive === undefined) return wallet;
    // Checked again right before the wallet signs: a write's reads and registry calls await, and the session may end
    // meanwhile.
    return {
      ...wallet,
      submit: async (submission) => {
        requireActive();
        return wallet.submit(submission);
      },
    };
  }
  async function connect(): Promise<Cip103Wallet> {
    return walletOf(await partyId());
  }

  // Checked and taken synchronously (before the first await), so a second write started in the same tick is refused
  // and two writes never select the same holdings.
  let busy = false;
  // Bumped when a write settles: a snapshot started before then may predate the write, so later reads do not join it.
  let writesSettled = 0;
  async function exclusive<T>(action: () => Promise<T>): Promise<T> {
    if (busy) {
      throw new WalletError('busy', 'Another wallet action is in progress; nothing was submitted');
    }
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
   * The validated holdings among `contracts`: of the registry (`servesHolding`, which checks template and signatories),
   * readable by `parseHolding` (HoldingV1 view, else the create argument) and owned by `owner`. Writes and the snapshot
   * both select holdings with this alone, over the same holding filters, so they see the same holdings: whatever passes
   * implements HoldingV1 or is of one of the registry's holding templates, so a holding-filter read returns it too.
   * (Matching the snapshot by filter instead would drop a holding whose HoldingV1 view the ledger failed to compute.)
   */
  function holdingsIn(owner: string, contracts: readonly ActiveContract[]): Holding[] {
    return contracts.flatMap((contract) => {
      if (!registry.servesHolding(contract)) return [];
      const holding = parseHolding(contract);
      return holding !== null && holding.owner === owner ? [holding] : [];
    });
  }

  const holdingFilters: readonly ContractFilter[] = [HOLDING_FILTER, ...(registry.holdingFilters ?? [])];

  async function holdingsOf(wallet: Cip103Wallet): Promise<Holding[]> {
    return holdingsIn(wallet.partyId, (await wallet.readActiveContracts(holdingFilters)).contracts);
  }

  const stateFilters: readonly ContractFilter[] = [
    ...holdingFilters,
    ...(registry.pendingTransferFilters ?? []),
    ...extraStateFilters,
  ];
  const stateFilterKeys = new Set(stateFilters.map(contractFilterKey));

  async function takeSnapshot(party: string): Promise<StateSnapshot> {
    const wallet = walletOf(party);
    const { offset, contracts } = await wallet.readActiveContracts(stateFilters);
    // A filter the snapshot did not carry (a registry without `pendingTransferFilters`) is read at the snapshot's
    // offset, not at a new ledger end, and once per snapshot however many lists ask for it.
    const extraReads = new Map<string, Promise<ActiveContract[]>>();
    const read: ReadContracts = async (filter) => {
      const key = contractFilterKey(filter);
      if (stateFilterKeys.has(key)) return contracts.filter((contract) => contractMatchesFilter(contract, filter));
      let pending = extraReads.get(key);
      if (pending === undefined) {
        pending = wallet.listActiveContracts(filter, { activeAtOffset: offset });
        extraReads.set(key, pending);
        // A failed read is not kept, so a later list of the same snapshot tries again.
        pending.catch(() => {
          if (extraReads.get(key) === pending) extraReads.delete(key);
        });
      }
      return [...(await pending)];
    };
    return { wallet, offset, holdings: holdingsIn(party, contracts), read };
  }

  // Keyed by party as well: without a pinned `partyId`, a read after an account switch must not join the previous
  // party's snapshot.
  let inFlight:
    { readonly writesSettled: number; readonly party: string; readonly promise: Promise<StateSnapshot> } | undefined;
  async function snapshot(): Promise<StateSnapshot> {
    const party = await partyId();
    const settled = writesSettled;
    if (inFlight?.writesSettled === settled && inFlight.party === party) return inFlight.promise;
    const promise: Promise<StateSnapshot> = takeSnapshot(party).finally(() => {
      if (inFlight?.promise === promise) inFlight = undefined;
    });
    inFlight = { writesSettled: settled, party, promise };
    return promise;
  }

  async function stateOf(taken: StateSnapshot): Promise<BaseState> {
    return {
      partyId: taken.wallet.partyId,
      offset: taken.offset,
      holdings: [...taken.holdings],
      balances: instrumentBalances(taken.holdings),
      transferOffers: await transferOffersOf(taken.wallet.partyId, taken.read),
    };
  }

  /** Select inputs and ask the registry for the factory; the factory must be an expected, disclosed template. */
  async function prepareTransfer(
    wallet: Cip103Wallet,
    request: TransferOptions
  ): Promise<{ transfer: TransferSpec; factory: TransferFactory }> {
    const instrumentId = requireInstrumentId(request.instrumentId);
    const receiver = requireNonEmpty(request.receiver, 'receiver');
    const selection = selectHoldings(await holdingsOf(wallet), {
      owner: wallet.partyId,
      instrumentId,
      amount: request.amount,
    });
    const at = now();
    const transfer: TransferSpec = {
      sender: wallet.partyId,
      receiver,
      amount: selection.amount,
      instrumentId,
      requestedAt: isoTime(at - REQUESTED_AT_SKEW_MS, 'requestedAt'),
      executeBefore: isoTime(at + TRANSFER_TTL_MS, 'executeBefore'),
      inputHoldingCids: selection.inputHoldingCids,
      meta: {
        values:
          request.memo !== undefined && request.memo.length > 0
            ? { [TOKEN_STANDARD_V1_REASON_META_KEY]: request.memo }
            : {},
      },
    };
    const factory = await registry.transferFactory({
      expectedAdmin: instrumentId.admin,
      transfer,
    });
    const factoryError = factoryTemplateError(factory, registry.expectedTransferFactoryTemplates);
    if (factoryError !== null) throw new RegistryResponseError(factoryError);
    return { transfer, factory };
  }

  async function runTransfer(wallet: Cip103Wallet, request: TransferOptions): Promise<TransferResult> {
    const { transfer: spec, factory } = await prepareTransfer(wallet, request);
    const kind = factory.transferKind;
    if (request.requirePreapproval === true && kind !== 'direct') {
      throw new WalletError(
        'preapproval-required',
        `The receiver has no matching transfer preapproval (the registry would make a${kind === 'offer' ? 'n offer' : ` ${kind} transfer`}); nothing was submitted`
      );
    }
    if (request.expectedKind !== undefined && kind !== request.expectedKind) {
      throw new WalletError(
        'kind-changed',
        `The registry would now make a${kind === 'offer' ? 'n' : ''} ${kind} transfer, not the previewed ${request.expectedKind}; nothing was submitted`
      );
    }
    const result = await wallet.submit({
      commands: [
        transferCommand({
          factoryId: factory.factoryId,
          expectedAdmin: spec.instrumentId.admin,
          transfer: spec,
          context: factory.choiceContextData,
        }),
      ],
      disclosedContracts: factory.disclosedContracts,
    });
    return { kind, ...result };
  }

  async function transferOffersOf(party: string, read: ReadContracts): Promise<TransferOffers> {
    const offers = await registry.pendingTransfers(read);
    return {
      incoming: offers.filter((o) => o.receiver === party && o.sender !== party),
      outgoing: offers.filter((o) => o.sender === party),
    };
  }

  async function runAnswerTransferOffer(
    transferOfferCid: string,
    action: TransferInstructionAction
  ): Promise<SubmitResult> {
    if (!TRANSFER_INSTRUCTION_ACTIONS.includes(action)) {
      throw new WalletError('invalid-input', `action must be one of ${TRANSFER_INSTRUCTION_ACTIONS.join(', ')}`);
    }
    const wallet = await connect();
    const { incoming, outgoing } = await transferOffersOf(wallet.partyId, async (filter) =>
      wallet.listActiveContracts(filter)
    );
    const offer = (action === 'withdraw' ? outgoing : incoming).find((o) => o.contractId === transferOfferCid);
    if (!offer) {
      throw new WalletError(
        'not-found',
        `Transfer offer ${transferOfferCid} is not among the wallet's ${action === 'withdraw' ? 'outgoing' : 'incoming'} offers`
      );
    }
    const context = await registry.transferInstructionContext(offer.instrumentId.admin, transferOfferCid, action);
    return wallet.submit({
      commands: [transferInstructionCommand(transferOfferCid, action, context.choiceContextData)],
      disclosedContracts: context.disclosedContracts,
    });
  }

  async function previewTransfer(request: TransferRequest): Promise<TransferKind> {
    return (await prepareTransfer(await connect(), request)).factory.transferKind;
  }

  const transfer = async (request: TransferOptions): Promise<TransferResult> =>
    exclusive(async () => runTransfer(await connect(), request));

  async function planTransfer(request: TransferRequest): Promise<TransferPlan> {
    // A copy, so a later change to the caller's object cannot change what is submitted.
    const planned: Readonly<TransferRequest> = Object.freeze({
      receiver: request.receiver,
      instrumentId: Object.freeze({ admin: request.instrumentId.admin, id: request.instrumentId.id }),
      amount: request.amount,
    });
    // Resolved once: the preview and the submission both act as this party, never as an account resolved later.
    const plannedParty = await partyId();
    const wallet = walletOf(plannedParty);
    const kind = (await prepareTransfer(wallet, planned)).factory.transferKind;
    return Object.freeze({
      kind,
      partyId: plannedParty,
      request: planned,
      submit: async (submitOptions: { readonly memo?: string; readonly requirePreapproval?: boolean } = {}) =>
        exclusive(async () => {
          // The user confirmed a transfer from `plannedParty`: refuse it if the wallet has switched accounts since, so
          // it never debits a party the preview did not show.
          const current = await partyId();
          if (current !== plannedParty) {
            throw new WalletError(
              'invalid-input',
              `The wallet now acts as ${current}, not ${plannedParty}, the party this transfer was previewed for; nothing was submitted. Preview the transfer again.`
            );
          }
          return runTransfer(wallet, {
            ...planned,
            ...(submitOptions.memo !== undefined && { memo: submitOptions.memo }),
            ...(submitOptions.requirePreapproval !== undefined && {
              requirePreapproval: submitOptions.requirePreapproval,
            }),
            expectedKind: kind,
          });
        }),
    });
  }

  return {
    now,
    connect,
    holdingsOf,
    exclusive,
    snapshot,
    stateOf,
    api: {
      partyId,
      listHoldings: async () => [...(await snapshot()).holdings],
      previewTransfer,
      planTransfer,
      transfer,
      listTransferOffers: async () => {
        const taken = await snapshot();
        return transferOffersOf(taken.wallet.partyId, taken.read);
      },
      acceptTransferOffer: async (cid) => exclusive(async () => runAnswerTransferOffer(cid, 'accept')),
      rejectTransferOffer: async (cid) => exclusive(async () => runAnswerTransferOffer(cid, 'reject')),
      withdrawTransferOffer: async (cid) => exclusive(async () => runAnswerTransferOffer(cid, 'withdraw')),
      answerTransferOffer: async (cid, action) => exclusive(async () => runAnswerTransferOffer(cid, action)),
    },
  };
}
