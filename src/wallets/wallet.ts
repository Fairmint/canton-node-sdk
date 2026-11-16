/**
 * One token wallet over any CIP-0103 wallet provider: the CIP-56 actions on any `TokenRegistry`'s instruments
 * (`cip56-core.ts`: holdings, transfers, pending transfers), plus, with DA's Utility Registry client, DA's own: accept
 * a mint offer, request a burn, create a transfer preapproval, list mint offers and burn requests. Every write fetches
 * its choice context from the registry, refuses anything that does not check out, and submits as the wallet party
 * only.
 *
 * DA's actions: by default a registrar must be its own registry provider; a registrar served by another provider is
 * trusted only through the registry client's `trustedProviders` option (see `isFromRegistry`).
 */
import {
  acceptMintOfferCommand,
  createDaTransferPreapprovalCommand,
  MAX_PREAPPROVAL_INSTRUMENTS,
  requestBurnCommand,
} from './commands';
import { isFromRegistry, parseBurnRequest, parseMintOffer, type BurnRequest, type MintOffer } from './contracts';
import {
  createDaUtilitiesClient,
  DA_BURN_FACTORY_TEMPLATES,
  DA_UTILITIES_BASE_URLS,
  isDaUtilitiesClient,
  type DaNetwork,
  type DaUtilitiesClient,
} from './da-utilities/client';
import { RegistryResponseError, TokenWalletError, WalletSubmitError } from './errors';
import { selectHoldings } from './holdings';
import { DA_REGISTRY_TEMPLATES } from '../da-registry/templates';
import { factoryTemplateError, type TokenRegistry } from './token-registry';
import {
  isoTime,
  REQUESTED_AT_SKEW_MS,
  requireInstrumentId,
  requireNonEmpty,
  requireTime,
  cip56Core,
  type BaseState,
  type CoreOptions,
  type StateSnapshot,
  type TransferActions,
} from './cip56-core';
import type { ActiveContract, ContractFilter, InstrumentId, SubmitResult } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Burn requests: `executeBefore` defaults to now + 7 days, giving the registrar a week to accept or reject. */
export const BURN_TTL_MS = 7 * DAY_MS;
/** A burn reference: no personal data (DA's operator and the registrar see it). */
export const BURN_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;

/** The number of random base-36 digits that end a burn reference. */
const BURN_REFERENCE_SUFFIX_DIGITS = 6;
/** 7 × 36: random bytes at or above it are drawn again, so every base-36 digit is equally likely. */
const UNBIASED_BYTE_LIMIT = 252;

/**
 * `count` uniformly distributed base-36 digits, from the Web Crypto API when the runtime has it (one byte per digit,
 * bytes in the incomplete last range drawn again). Not a secret: only unique.
 */
function randomBase36(count: number): string {
  // Typed as always present, but missing in old runtimes.
  const { crypto } = globalThis as { crypto?: Partial<Crypto> };
  let digits = '';
  if (typeof crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    while (digits.length < count) {
      for (const byte of crypto.getRandomValues(bytes)) {
        if (byte < UNBIASED_BYTE_LIMIT && digits.length < count) digits += (byte % 36).toString(36);
      }
    }
    return digits;
  }
  while (digits.length < count) digits += Math.floor(Math.random() * 36).toString(36);
  return digits;
}

/**
 * A burn reference with no personal data: `holder-burn-<UTC yyyymmddThhmmssZ>-<6 random base-36 digits>` (DA's operator
 * and the registrar see it). Never `redeem-…`, a prefix a transfer agent may reserve for the redemptions it files
 * itself. `requestBurn` uses one when no `reference` is given.
 */
export function newBurnReference(now: Date = new Date()): string {
  const stamp = new Date(requireTime(now, 'now')).toISOString().replace(/[-:]|\.\d+/g, '');
  const suffix = randomBase36(BURN_REFERENCE_SUFFIX_DIGITS);
  return `holder-burn-${stamp}-${suffix}`;
}

/**
 * The wallet's provider, party and registry: pass `registry` (any `TokenRegistry`; DA's actions need
 * `createDaUtilitiesClient(...)`), or `network` to get `createDaUtilitiesClient({ network })` with the global `fetch`
 * and no trusted providers.
 */
export type WalletOptions = Omit<CoreOptions, 'registry'> &
  (
    | { readonly registry: TokenRegistry; readonly network?: undefined }
    | { readonly network: DaNetwork; readonly registry?: undefined }
  );

export interface BurnRequestOptions {
  readonly instrumentId: InstrumentId;
  readonly amount: string;
  /** Matches {@link BURN_REFERENCE_PATTERN}; never personal data. Defaults to {@link newBurnReference}. */
  readonly reference?: string;
  /** Defaults to now + 7 days. */
  readonly executeBefore?: Date;
}

/** A filed burn request: the submission, and the reference it was filed with (the given one or a generated one). */
export interface BurnRequestResult extends SubmitResult {
  readonly reference: string;
}

/** Everything a token wallet page shows, read as one snapshot of the ledger. */
export interface WalletState extends BaseState {
  /** DA mint offers to the wallet party; `[]` when the registry is not DA's. */
  readonly mintOffers: MintOffer[];
  /** The wallet party's open DA burn requests; `[]` when the registry is not DA's. */
  readonly burnRequests: BurnRequest[];
}

const MINT_OFFER_FILTER: ContractFilter = { templateId: DA_REGISTRY_TEMPLATES.mintOffer };
const BURN_REQUEST_FILTER: ContractFilter = { templateId: DA_REGISTRY_TEMPLATES.burnRequest };

/**
 * A wallet party's token actions through a CIP-0103 provider: the CIP-56 actions on any `TokenRegistry`'s instruments,
 * and DA's mint, burn and preapproval actions when the registry is DA's Utility Registry client. With another registry
 * those DA actions are refused with `unsupported-by-registry` (before anything is read or signed), and `loadState`
 * gives empty DA lists; `isDaUtilitiesClient` tells which registry a wallet has.
 *
 * One write action at a time: a write started while another is in progress (from its first read to its submission's
 * outcome) is refused at once with `busy`, so two writes never pick the same holdings. Reads and previews are not
 * limited.
 *
 * Reads: `loadState` and the `list*` methods all read one snapshot (one ledger-end call and one paged ACS stream with
 * every filter the wallet needs; a registry that declares no `pendingTransferFilters` costs one more ACS stream, read
 * at the same offset), and calls made while a snapshot is in flight share it instead of reading again, unless a write
 * settled since it started. Load a page with `loadState`; writes do their own fresh reads.
 */
export interface Wallet extends TransferActions {
  /**
   * Holdings, transfer offers, mint offers and burn requests from one snapshot: one ledger-end call and one paged ACS
   * stream for all four. Load a page with this rather than the `list*` calls (which share one snapshot when called
   * together, but each still filters it). The DA lists are `[]` when the registry is not DA's.
   */
  loadState(): Promise<WalletState>;
  /**
   * Mint offers to the wallet party, made under their instrument admin's registry service. Needs DA's Utility Registry
   * client (`network`, or `registry: createDaUtilitiesClient(...)`); refused with `unsupported-by-registry` otherwise.
   */
  listMintOffers(): Promise<MintOffer[]>;
  /**
   * Accept a DA mint offer. Needs DA's Utility Registry client (`network`, or `registry:
   * createDaUtilitiesClient(...)`); refused with `unsupported-by-registry` otherwise.
   */
  acceptMintOffer(mintOfferCid: string, options?: { expectedRegistrar?: string }): Promise<SubmitResult>;
  /**
   * File a burn (redemption) request; DA locks the amount until the registrar accepts or rejects it. Resolves with the
   * reference it was filed with, so a dApp can show it. If the submission fails, the `WalletSubmitError` carries that
   * reference too (`burnReference`, and in its message): after an `unknown` outcome, find the burn request by it before
   * filing another, or the amount may be locked twice. Needs DA's Utility Registry client (`network`, or `registry:
   * createDaUtilitiesClient(...)`); refused with `unsupported-by-registry` otherwise.
   */
  requestBurn(options: BurnRequestOptions): Promise<BurnRequestResult>;
  /**
   * Experimental: create the wallet party's DA transfer preapproval for an instrument admin (every instrument of the
   * admin when `instrumentIds` is empty or omitted, else up to 10). No live create has been observed yet. Needs DA's
   * Utility Registry client (`network`, or `registry: createDaUtilitiesClient(...)`); refused with
   * `unsupported-by-registry` otherwise.
   */
  createTransferPreapproval(options: {
    instrumentAdmin: string;
    instrumentIds?: readonly string[];
  }): Promise<SubmitResult>;
  /**
   * The wallet party's open burn requests (pending redemptions). Needs DA's Utility Registry client (`network`, or
   * `registry: createDaUtilitiesClient(...)`); refused with `unsupported-by-registry` otherwise.
   */
  listBurnRequests(): Promise<BurnRequest[]>;
}

/** The registry client of `options`: the given one, or DA's client for `options.network`. */
function registryOf(options: WalletOptions): TokenRegistry {
  if (options.registry !== undefined) return options.registry;
  const { network } = options as { network?: unknown };
  if (typeof network !== 'string' || !Object.prototype.hasOwnProperty.call(DA_UTILITIES_BASE_URLS, network)) {
    throw new TokenWalletError(
      'invalid-input',
      `Pass a registry, or a network (${Object.keys(DA_UTILITIES_BASE_URLS).join(' or ')})`
    );
  }
  return createDaUtilitiesClient({ network: network as DaNetwork });
}

/**
 * A `Wallet` over a CIP-0103 provider: the CIP-56 actions with any `TokenRegistry`, and DA's actions too with DA's
 * Utility Registry client (`network`, or `registry: createDaUtilitiesClient(...)`).
 */
export function createWallet(options: WalletOptions): Wallet {
  const registry = registryOf(options);
  // DA's actions need every DA client member; any other registry (even one with some of them) is a plain CIP-56 one.
  const da = isDaUtilitiesClient(registry) ? registry : null;
  const core = cip56Core({ ...options, registry }, da === null ? [] : [MINT_OFFER_FILTER, BURN_REQUEST_FILTER]);
  const { connect, exclusive, now } = core;

  /** DA's client, or `unsupported-by-registry` (thrown before any read, latch or signature). */
  function requireDa(action: string): DaUtilitiesClient {
    if (da === null) {
      throw new TokenWalletError(
        'unsupported-by-registry',
        `${action} needs DA's Utility Registry client: pass network, or registry: createDaUtilitiesClient(...)`
      );
    }
    return da;
  }

  function mintOffersIn(
    client: DaUtilitiesClient,
    party: string,
    contracts: readonly ActiveContract[],
    operator: string
  ): MintOffer[] {
    return contracts.flatMap((contract) => {
      const offer = parseMintOffer(contract);
      return offer !== null &&
        offer.holder === party &&
        isFromRegistry(offer, contract.signatories, operator, client.trustedProvidersOf)
        ? [offer]
        : [];
    });
  }

  function burnRequestsIn(
    client: DaUtilitiesClient,
    party: string,
    contracts: readonly ActiveContract[],
    operator: string
  ): BurnRequest[] {
    return contracts.flatMap((contract) => {
      const request = parseBurnRequest(contract);
      return request !== null &&
        request.holder === party &&
        isFromRegistry(request, contract.signatories, operator, client.trustedProvidersOf)
        ? [request]
        : [];
    });
  }

  async function listMintOffers(client: DaUtilitiesClient): Promise<MintOffer[]> {
    const taken = await core.snapshot();
    const [contracts, operator] = await Promise.all([taken.read(MINT_OFFER_FILTER), client.operatorParty()]);
    return mintOffersIn(client, taken.wallet.partyId, contracts, operator);
  }

  async function listBurnRequests(client: DaUtilitiesClient): Promise<BurnRequest[]> {
    const taken = await core.snapshot();
    const [contracts, operator] = await Promise.all([taken.read(BURN_REQUEST_FILTER), client.operatorParty()]);
    return burnRequestsIn(client, taken.wallet.partyId, contracts, operator);
  }

  async function stateOf(taken: StateSnapshot): Promise<WalletState> {
    if (da === null) return { ...(await core.stateOf(taken)), mintOffers: [], burnRequests: [] };
    const [base, mintContracts, burnContracts, operator] = await Promise.all([
      core.stateOf(taken),
      taken.read(MINT_OFFER_FILTER),
      taken.read(BURN_REQUEST_FILTER),
      da.operatorParty(),
    ]);
    return {
      ...base,
      mintOffers: mintOffersIn(da, taken.wallet.partyId, mintContracts, operator),
      burnRequests: burnRequestsIn(da, taken.wallet.partyId, burnContracts, operator),
    };
  }

  async function runAcceptMintOffer(
    client: DaUtilitiesClient,
    mintOfferCid: string,
    acceptOptions: { expectedRegistrar?: string } = {}
  ): Promise<SubmitResult> {
    const wallet = await connect();
    const contracts = await wallet.listActiveContracts(MINT_OFFER_FILTER);
    const contract = contracts.find((c) => c.contractId === mintOfferCid);
    const offer = contract ? parseMintOffer(contract) : null;
    if (contract === undefined || offer === null) {
      throw new TokenWalletError(
        'not-found',
        `Mint offer ${mintOfferCid} is not among the wallet's active mint offers`
      );
    }
    if (offer.holder !== wallet.partyId) {
      throw new TokenWalletError(
        'not-addressed-to-wallet',
        `Mint offer ${mintOfferCid} is for ${offer.holder}, not the wallet party`
      );
    }
    if (!isFromRegistry(offer, contract.signatories, await client.operatorParty(), client.trustedProvidersOf)) {
      throw new TokenWalletError(
        'unexpected-registrar',
        `Mint offer ${mintOfferCid} was not made under a trusted registry service of its instrument admin`
      );
    }
    if (acceptOptions.expectedRegistrar !== undefined && offer.instrumentId.admin !== acceptOptions.expectedRegistrar) {
      throw new TokenWalletError(
        'unexpected-registrar',
        `Mint offer ${mintOfferCid} is of ${offer.instrumentId.admin}, not the expected registrar`
      );
    }
    const context = await client.mintOfferAcceptContext(mintOfferCid);
    return wallet.submit({
      commands: [acceptMintOfferCommand(mintOfferCid, context.choiceContextData)],
      disclosedContracts: context.disclosedContracts,
    });
  }

  async function runRequestBurn(client: DaUtilitiesClient, burn: BurnRequestOptions): Promise<BurnRequestResult> {
    const instrumentId = requireInstrumentId(burn.instrumentId);
    const at = now();
    const reference = burn.reference ?? newBurnReference(new Date(at));
    if (typeof reference !== 'string' || !BURN_REFERENCE_PATTERN.test(reference)) {
      throw new TokenWalletError(
        'invalid-input',
        'reference must be 1-100 characters of letters, digits and . _ : - (starting with a letter or digit), with no personal data'
      );
    }
    const deadline =
      burn.executeBefore === undefined ? at + BURN_TTL_MS : requireTime(burn.executeBefore, 'executeBefore');
    if (deadline <= at) {
      throw new TokenWalletError('invalid-input', 'executeBefore must be in the future');
    }
    const requestedAt = isoTime(at - REQUESTED_AT_SKEW_MS, 'requestedAt');
    const executeBefore = isoTime(deadline, 'executeBefore');
    const wallet = await connect();
    const selection = selectHoldings(await core.holdingsOf(wallet), {
      owner: wallet.partyId,
      instrumentId,
      amount: burn.amount,
    });
    const factory = await client.burnRequestContext({
      holder: wallet.partyId,
      holdingContractIds: selection.inputHoldingCids,
      instrumentId,
    });
    const factoryError = factoryTemplateError(factory, DA_BURN_FACTORY_TEMPLATES);
    if (factoryError !== null) throw new RegistryResponseError(factoryError);
    const submitted = wallet.submit({
      commands: [
        requestBurnCommand({
          allocationFactoryCid: factory.factoryId,
          expectedAdmin: instrumentId.admin,
          burn: {
            instrumentId,
            amount: selection.amount,
            holder: wallet.partyId,
            reference,
            requestedAt,
            executeBefore,
          },
          holdingCids: selection.inputHoldingCids,
          context: factory.choiceContextData,
        }),
      ],
      disclosedContracts: factory.disclosedContracts,
    });
    let result: SubmitResult;
    try {
      result = await submitted;
    } catch (error) {
      // The reference may have been generated here: the caller needs it to look the burn request up before a retry,
      // above all after an unknown outcome, when the request may have been filed.
      if (error instanceof WalletSubmitError) {
        // Matched on the whole suffix, not the bare reference: a short reference ('wallet') can occur in any message.
        const suffix = `Burn reference: ${reference}.`;
        const message = error.message.endsWith(suffix) ? error.message : `${error.message} ${suffix}`;
        throw new WalletSubmitError(error.outcome, message, {
          ...(error.code !== undefined && { code: error.code }),
          ...(error.commandId !== undefined && { commandId: error.commandId }),
          burnReference: reference,
        });
      }
      throw error;
    }
    return { ...result, reference };
  }

  async function runCreateTransferPreapproval(
    client: DaUtilitiesClient,
    preapproval: {
      instrumentAdmin: string;
      instrumentIds?: readonly string[];
    }
  ): Promise<SubmitResult> {
    const instrumentAdmin = requireNonEmpty(preapproval.instrumentAdmin, 'instrumentAdmin');
    const instrumentIds = [...new Set(preapproval.instrumentIds ?? [])];
    if (instrumentIds.length > MAX_PREAPPROVAL_INSTRUMENTS) {
      throw new TokenWalletError(
        'invalid-input',
        `A preapproval allows at most ${MAX_PREAPPROVAL_INSTRUMENTS} instrument ids`
      );
    }
    instrumentIds.forEach((id) => requireNonEmpty(id, 'instrumentIds[]'));
    const wallet = await connect();
    return wallet.submit({
      commands: [
        createDaTransferPreapprovalCommand({
          operator: await client.operatorParty(),
          receiver: wallet.partyId,
          instrumentAdmin,
          instrumentIds,
        }),
      ],
    });
  }

  // Each DA action checks for DA's client first: a refusal reads nothing and never takes the write latch.
  return {
    ...core.api,
    loadState: async () => stateOf(await core.snapshot()),
    listMintOffers: async () => listMintOffers(requireDa('listMintOffers')),
    acceptMintOffer: async (mintOfferCid, acceptOptions) => {
      const client = requireDa('acceptMintOffer');
      return exclusive(async () => runAcceptMintOffer(client, mintOfferCid, acceptOptions));
    },
    requestBurn: async (burn) => {
      const client = requireDa('requestBurn');
      return exclusive(async () => runRequestBurn(client, burn));
    },
    createTransferPreapproval: async (preapproval) => {
      const client = requireDa('createTransferPreapproval');
      return exclusive(async () => runCreateTransferPreapproval(client, preapproval));
    },
    listBurnRequests: async () => listBurnRequests(requireDa('listBurnRequests')),
  };
}
