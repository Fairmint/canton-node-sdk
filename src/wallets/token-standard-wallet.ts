/**
 * Generic CIP-56 (token standard V1) holder actions through any CIP-0103 wallet provider and any `TokenRegistry`: list
 * the registry's holdings, preview and run a transfer, and answer pending transfers. Registry-specific actions (DA's
 * mint offers, burn requests and preapprovals) build on it in `token-wallet.ts`.
 */
import { cip103Wallet, primaryPartyId, type Cip103Provider, type Cip103Wallet } from './cip103';
import { transferCommand, transferInstructionCommand } from './commands';
import { TRANSFER_REASON_META_KEY, type TransferOffer } from './contracts';
import { RegistryResponseError, TokenWalletError } from './errors';
import { parseHolding, selectHoldings, type Holding } from './holdings';
import { TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID } from '../utils/token-standard/v1/constants';
import {
  factoryTemplateError,
  type TokenRegistry,
  type TransferInstructionAction,
  type TransferFactory,
  type TransferKind,
  type TransferSpec,
} from './token-registry';
import type { InstrumentId, SubmitResult } from './types';

const SECOND_MS = 1000;
const DAY_MS = 24 * 60 * 60 * SECOND_MS;

/** Transfers: `executeBefore` = now + 24 h, a common wallet default. */
export const TRANSFER_TTL_MS = DAY_MS;
/**
 * `requestedAt` = now − 60 s for transfers and burn requests: registries require it in the past by ledger time, and the
 * client's clock can run ahead of the participant's.
 */
export const REQUESTED_AT_SKEW_MS = 60 * SECOND_MS;

export interface TokenStandardWalletOptions<R extends TokenRegistry = TokenRegistry> {
  /**
   * Any CIP-0103 (Canton dApp API) provider, already connected by the dApp: Loop's `loop.getCip103Provider()`, a
   * `@canton-network/dapp-sdk` provider, `window.canton`, …
   */
  readonly provider: Cip103Provider;
  /** Act as this party. Defaults to the wallet's primary account, read on every action. */
  readonly partyId?: string;
  readonly registry: R;
  /** Defaults to the system clock. */
  readonly now?: () => Date;
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

export interface TransferOffers {
  /** Offers to the wallet party, which it can accept or reject. */
  readonly incoming: TransferOffer[];
  /** The wallet party's own offers, which it can withdraw. */
  readonly outgoing: TransferOffer[];
}

/**
 * The CIP-56 actions on one registry's instruments. One write action at a time: a write started while another is in
 * progress (from its first read to its submission's outcome) is refused at once with `busy`, so two writes never pick
 * the same holdings. Reads and previews are not limited.
 */
export interface TokenStandardWallet {
  /** The party every action reads and acts as. */
  partyId(): Promise<string>;
  /** The wallet party's holdings this registry serves, locked ones included (`locked: true`). */
  listHoldings(): Promise<Holding[]>;
  /** How the registry would run this transfer, without submitting it. */
  previewTransfer(request: TransferRequest): Promise<TransferKind>;
  transfer(options: TransferOptions): Promise<TransferResult>;
  listTransferOffers(): Promise<TransferOffers>;
  acceptTransferOffer(transferOfferCid: string): Promise<SubmitResult>;
  rejectTransferOffer(transferOfferCid: string): Promise<SubmitResult>;
  withdrawTransferOffer(transferOfferCid: string): Promise<SubmitResult>;
}

export function requireNonEmpty(value: string, field: string): string {
  if (value.trim().length === 0) {
    throw new TokenWalletError('invalid-input', `${field} is required`);
  }
  return value;
}

/** Milliseconds of a caller's `Date`; `invalid-input` for an invalid one (NaN), which `toISOString` would throw on. */
export function requireTime(date: Date, field: string): number {
  const ms = date instanceof Date ? date.getTime() : Number.NaN;
  if (!Number.isFinite(ms)) {
    throw new TokenWalletError('invalid-input', `${field} is not a valid time`);
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

/** What a registry-specific extension builds on: the wallet as the current party, its holdings, the write guard. */
export interface TokenStandardCore {
  readonly api: TokenStandardWallet;
  /** The clock in milliseconds; `invalid-input` when it gives an invalid `Date`. */
  readonly now: () => number;
  /** The wallet as the current party: resolved per action, so an account switch in the wallet is followed. */
  readonly connect: () => Promise<Cip103Wallet>;
  /** The party's unlocked and locked holdings that the registry serves. */
  readonly holdingsOf: (wallet: Cip103Wallet) => Promise<Holding[]>;
  /**
   * Run a write action alone: refused with `busy` (before `action` starts) while another write of this token wallet is
   * in progress, and released when `action` settles, whether it succeeded or failed.
   */
  readonly exclusive: <T>(action: () => Promise<T>) => Promise<T>;
}

/** The generic CIP-56 core; `createTokenWallet` adds DA's actions on top of it. */
export function tokenStandardCore(options: TokenStandardWalletOptions): TokenStandardCore {
  const { provider, registry } = options;
  const clock = options.now ?? (() => new Date());
  const now = (): number => requireTime(clock(), 'now()');
  if (options.partyId !== undefined) requireNonEmpty(options.partyId, 'partyId');

  async function partyId(): Promise<string> {
    return options.partyId ?? primaryPartyId(provider);
  }

  async function connect(): Promise<Cip103Wallet> {
    return cip103Wallet(provider, await partyId());
  }

  // Checked and taken synchronously (before the first await), so a second write started in the same tick is refused
  // and two writes never select the same holdings.
  let busy = false;
  async function exclusive<T>(action: () => Promise<T>): Promise<T> {
    if (busy) {
      throw new TokenWalletError('busy', 'Another wallet action is in progress; nothing was submitted');
    }
    busy = true;
    try {
      return await action();
    } finally {
      busy = false;
    }
  }

  async function holdingsOf(wallet: Cip103Wallet): Promise<Holding[]> {
    const contracts = await wallet.listActiveContracts({
      interfaceId: TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID,
    });
    return contracts.flatMap((contract) => {
      if (!registry.servesHolding(contract)) return [];
      const holding = parseHolding(contract);
      return holding !== null && holding.owner === wallet.partyId ? [holding] : [];
    });
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
          request.memo !== undefined && request.memo.length > 0 ? { [TRANSFER_REASON_META_KEY]: request.memo } : {},
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

  async function runTransfer(request: TransferOptions): Promise<TransferResult> {
    const wallet = await connect();
    const { transfer: spec, factory } = await prepareTransfer(wallet, request);
    const kind = factory.transferKind;
    if (request.requirePreapproval === true && kind !== 'direct') {
      throw new TokenWalletError(
        'preapproval-required',
        `The receiver has no matching transfer preapproval (the registry would make a${kind === 'offer' ? 'n offer' : ` ${kind} transfer`}); nothing was submitted`
      );
    }
    if (request.expectedKind !== undefined && kind !== request.expectedKind) {
      throw new TokenWalletError(
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

  async function transferOffersOf(wallet: Cip103Wallet): Promise<TransferOffers> {
    const offers = await registry.pendingTransfers(async (filter) => wallet.listActiveContracts(filter));
    return {
      incoming: offers.filter((o) => o.receiver === wallet.partyId && o.sender !== wallet.partyId),
      outgoing: offers.filter((o) => o.sender === wallet.partyId),
    };
  }

  async function runAnswerTransferOffer(
    transferOfferCid: string,
    action: TransferInstructionAction
  ): Promise<SubmitResult> {
    const wallet = await connect();
    const { incoming, outgoing } = await transferOffersOf(wallet);
    const offer = (action === 'withdraw' ? outgoing : incoming).find((o) => o.contractId === transferOfferCid);
    if (!offer) {
      throw new TokenWalletError(
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

  return {
    now,
    connect,
    holdingsOf,
    exclusive,
    api: {
      partyId,
      listHoldings: async () => holdingsOf(await connect()),
      previewTransfer: async (request) => (await prepareTransfer(await connect(), request)).factory.transferKind,
      transfer: async (request) => exclusive(async () => runTransfer(request)),
      listTransferOffers: async () => transferOffersOf(await connect()),
      acceptTransferOffer: async (cid) => exclusive(async () => runAnswerTransferOffer(cid, 'accept')),
      rejectTransferOffer: async (cid) => exclusive(async () => runAnswerTransferOffer(cid, 'reject')),
      withdrawTransferOffer: async (cid) => exclusive(async () => runAnswerTransferOffer(cid, 'withdraw')),
    },
  };
}

/**
 * CIP-56 holder actions on the instruments of any `TokenRegistry` through a CIP-0103 provider. For DA Utility Registry
 * instruments use `createTokenWallet`, which adds DA's mint, burn and preapproval actions.
 */
export function createTokenStandardWallet(options: TokenStandardWalletOptions): TokenStandardWallet {
  return tokenStandardCore(options).api;
}
