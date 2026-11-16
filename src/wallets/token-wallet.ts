/**
 * Holder actions on DA Utility Registry instruments through any CIP-0103 wallet provider: the generic CIP-56 actions
 * (`token-standard-wallet.ts`: holdings, transfers, pending transfers) plus DA's own: accept a mint offer, request a
 * burn, create a transfer preapproval, list burn requests. Every write fetches its choice context from the registry,
 * refuses anything that does not check out, and submits as the wallet party only.
 *
 * Scope: DA registry instruments. By default a registrar must be its own registry provider; a registrar served by
 * another provider is trusted only through the registry client's `trustedProviders` option (see `isFromRegistry`).
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
  type DaNetwork,
  type DaUtilitiesClient,
} from './da-utilities/client';
import { RegistryResponseError, TokenWalletError } from './errors';
import { selectHoldings } from './holdings';
import { DA_REGISTRY_TEMPLATES } from '../da-registry/templates';
import { factoryTemplateError } from './token-registry';
import {
  isoTime,
  REQUESTED_AT_SKEW_MS,
  requireInstrumentId,
  requireNonEmpty,
  requireTime,
  tokenStandardCore,
  type StateSnapshot,
  type TokenStandardState,
  type TokenStandardWallet,
  type TokenStandardWalletOptions,
} from './token-standard-wallet';
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
 * Like `TokenStandardWalletOptions`, with DA's registry client: pass `registry`, or `network` to get
 * `createDaUtilitiesClient({ network })` with the global `fetch` and no trusted providers.
 */
export type TokenWalletOptions = Omit<TokenStandardWalletOptions<DaUtilitiesClient>, 'registry'> &
  (
    | { readonly registry: DaUtilitiesClient; readonly network?: undefined }
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
export interface TokenWalletState extends TokenStandardState {
  readonly mintOffers: MintOffer[];
  readonly burnRequests: BurnRequest[];
}

const MINT_OFFER_FILTER: ContractFilter = { templateId: DA_REGISTRY_TEMPLATES.mintOffer };
const BURN_REQUEST_FILTER: ContractFilter = { templateId: DA_REGISTRY_TEMPLATES.burnRequest };

export interface TokenWallet extends TokenStandardWallet {
  /**
   * Holdings, transfer offers, mint offers and burn requests from one snapshot: one ledger-end call and one paged ACS
   * stream for all four. Load a page with this rather than the four `list*` calls (which share one snapshot when called
   * together, but each still filters it).
   */
  loadState(): Promise<TokenWalletState>;
  /** Mint offers to the wallet party, made under their instrument admin's registry service. */
  listMintOffers(): Promise<MintOffer[]>;
  acceptMintOffer(mintOfferCid: string, options?: { expectedRegistrar?: string }): Promise<SubmitResult>;
  /**
   * File a burn (redemption) request; DA locks the amount until the registrar accepts or rejects it. Resolves with the
   * reference it was filed with, so a dApp can show it.
   */
  requestBurn(options: BurnRequestOptions): Promise<BurnRequestResult>;
  /**
   * Experimental: create the wallet party's DA transfer preapproval for an instrument admin (every instrument of the
   * admin when `instrumentIds` is empty or omitted, else up to 10). No live create has been observed yet.
   */
  createTransferPreapproval(options: {
    instrumentAdmin: string;
    instrumentIds?: readonly string[];
  }): Promise<SubmitResult>;
  /** The wallet party's open burn requests (pending redemptions). */
  listBurnRequests(): Promise<BurnRequest[]>;
}

/** The registry client of `options`: the given one, or DA's client for `options.network`. */
function registryOf(options: TokenWalletOptions): DaUtilitiesClient {
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

/** A `TokenWallet` over a CIP-0103 provider, using DA's Utilities API for choice contexts. */
export function createTokenWallet(options: TokenWalletOptions): TokenWallet {
  const registry = registryOf(options);
  const core = tokenStandardCore({ ...options, registry }, [MINT_OFFER_FILTER, BURN_REQUEST_FILTER]);
  const { connect, exclusive, now } = core;

  function mintOffersIn(party: string, contracts: readonly ActiveContract[], operator: string): MintOffer[] {
    return contracts.flatMap((contract) => {
      const offer = parseMintOffer(contract);
      return offer !== null &&
        offer.holder === party &&
        isFromRegistry(offer, contract.signatories, operator, registry.trustedProvidersOf)
        ? [offer]
        : [];
    });
  }

  function burnRequestsIn(party: string, contracts: readonly ActiveContract[], operator: string): BurnRequest[] {
    return contracts.flatMap((contract) => {
      const request = parseBurnRequest(contract);
      return request !== null &&
        request.holder === party &&
        isFromRegistry(request, contract.signatories, operator, registry.trustedProvidersOf)
        ? [request]
        : [];
    });
  }

  async function listMintOffers(): Promise<MintOffer[]> {
    const taken = await core.snapshot();
    const [contracts, operator] = await Promise.all([taken.read(MINT_OFFER_FILTER), registry.operatorParty()]);
    return mintOffersIn(taken.wallet.partyId, contracts, operator);
  }

  async function listBurnRequests(): Promise<BurnRequest[]> {
    const taken = await core.snapshot();
    const [contracts, operator] = await Promise.all([taken.read(BURN_REQUEST_FILTER), registry.operatorParty()]);
    return burnRequestsIn(taken.wallet.partyId, contracts, operator);
  }

  async function stateOf(taken: StateSnapshot): Promise<TokenWalletState> {
    const [base, mintContracts, burnContracts, operator] = await Promise.all([
      core.stateOf(taken),
      taken.read(MINT_OFFER_FILTER),
      taken.read(BURN_REQUEST_FILTER),
      registry.operatorParty(),
    ]);
    return {
      ...base,
      mintOffers: mintOffersIn(taken.wallet.partyId, mintContracts, operator),
      burnRequests: burnRequestsIn(taken.wallet.partyId, burnContracts, operator),
    };
  }

  async function runAcceptMintOffer(
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
    if (!isFromRegistry(offer, contract.signatories, await registry.operatorParty(), registry.trustedProvidersOf)) {
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
    const context = await registry.mintOfferAcceptContext(mintOfferCid);
    return wallet.submit({
      commands: [acceptMintOfferCommand(mintOfferCid, context.choiceContextData)],
      disclosedContracts: context.disclosedContracts,
    });
  }

  async function runRequestBurn(burn: BurnRequestOptions): Promise<BurnRequestResult> {
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
    const factory = await registry.burnRequestContext({
      holder: wallet.partyId,
      holdingContractIds: selection.inputHoldingCids,
      instrumentId,
    });
    const factoryError = factoryTemplateError(factory, DA_BURN_FACTORY_TEMPLATES);
    if (factoryError !== null) throw new RegistryResponseError(factoryError);
    const result = await wallet.submit({
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
    return { ...result, reference };
  }

  async function runCreateTransferPreapproval(preapproval: {
    instrumentAdmin: string;
    instrumentIds?: readonly string[];
  }): Promise<SubmitResult> {
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
          operator: await registry.operatorParty(),
          receiver: wallet.partyId,
          instrumentAdmin,
          instrumentIds,
        }),
      ],
    });
  }

  return {
    ...core.api,
    loadState: async () => stateOf(await core.snapshot()),
    listMintOffers,
    acceptMintOffer: async (mintOfferCid, acceptOptions) =>
      exclusive(async () => runAcceptMintOffer(mintOfferCid, acceptOptions)),
    requestBurn: async (burn) => exclusive(async () => runRequestBurn(burn)),
    createTransferPreapproval: async (preapproval) => exclusive(async () => runCreateTransferPreapproval(preapproval)),
    listBurnRequests,
  };
}
