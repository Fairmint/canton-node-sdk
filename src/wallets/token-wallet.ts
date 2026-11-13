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
import { DA_BURN_FACTORY_TEMPLATES, type DaUtilitiesClient } from './da-utilities/client';
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
  type TokenStandardWallet,
  type TokenStandardWalletOptions,
} from './token-standard-wallet';
import type { InstrumentId, SubmitResult } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Burn requests: `executeBefore` defaults to now + 7 days, giving the registrar a week to accept or reject. */
export const BURN_TTL_MS = 7 * DAY_MS;
/** A burn reference: no personal data (DA's operator and the registrar see it). */
export const BURN_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;

export type TokenWalletOptions = TokenStandardWalletOptions<DaUtilitiesClient>;

export interface BurnRequestOptions {
  readonly instrumentId: InstrumentId;
  readonly amount: string;
  /** Matches {@link BURN_REFERENCE_PATTERN}; never personal data. */
  readonly reference: string;
  /** Defaults to now + 7 days. */
  readonly executeBefore?: Date;
}

export interface TokenWallet extends TokenStandardWallet {
  /** Mint offers to the wallet party, made under their instrument admin's registry service. */
  listMintOffers(): Promise<MintOffer[]>;
  acceptMintOffer(mintOfferCid: string, options?: { expectedRegistrar?: string }): Promise<SubmitResult>;
  /** File a burn (redemption) request; DA locks the amount until the registrar accepts or rejects it. */
  requestBurn(options: BurnRequestOptions): Promise<SubmitResult>;
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

/** A `TokenWallet` over a CIP-0103 provider, using DA's Utilities API for choice contexts. */
export function createTokenWallet(options: TokenWalletOptions): TokenWallet {
  const { registry } = options;
  const core = tokenStandardCore(options);
  const { connect, exclusive, now } = core;

  async function listMintOffers(): Promise<MintOffer[]> {
    const wallet = await connect();
    const [contracts, operator] = await Promise.all([
      wallet.listActiveContracts({
        templateId: DA_REGISTRY_TEMPLATES.mintOffer,
      }),
      registry.operatorParty(),
    ]);
    return contracts.flatMap((contract) => {
      const offer = parseMintOffer(contract);
      return offer !== null &&
        offer.holder === wallet.partyId &&
        isFromRegistry(offer, contract.signatories, operator, registry.trustedProvidersOf(offer.instrumentId.admin))
        ? [offer]
        : [];
    });
  }

  async function runAcceptMintOffer(
    mintOfferCid: string,
    acceptOptions: { expectedRegistrar?: string } = {}
  ): Promise<SubmitResult> {
    const wallet = await connect();
    const contracts = await wallet.listActiveContracts({
      templateId: DA_REGISTRY_TEMPLATES.mintOffer,
    });
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
    if (
      !isFromRegistry(
        offer,
        contract.signatories,
        await registry.operatorParty(),
        registry.trustedProvidersOf(offer.instrumentId.admin)
      )
    ) {
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

  async function runRequestBurn(burn: BurnRequestOptions): Promise<SubmitResult> {
    const instrumentId = requireInstrumentId(burn.instrumentId);
    if (!BURN_REFERENCE_PATTERN.test(burn.reference)) {
      throw new TokenWalletError(
        'invalid-input',
        'reference must be 1-100 characters of letters, digits and . _ : - (starting with a letter or digit), with no personal data'
      );
    }
    const at = now();
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
    return wallet.submit({
      commands: [
        requestBurnCommand({
          allocationFactoryCid: factory.factoryId,
          expectedAdmin: instrumentId.admin,
          burn: {
            instrumentId,
            amount: selection.amount,
            holder: wallet.partyId,
            reference: burn.reference,
            requestedAt,
            executeBefore,
          },
          holdingCids: selection.inputHoldingCids,
          context: factory.choiceContextData,
        }),
      ],
      disclosedContracts: factory.disclosedContracts,
    });
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

  async function listBurnRequests(): Promise<BurnRequest[]> {
    const wallet = await connect();
    const [contracts, operator] = await Promise.all([
      wallet.listActiveContracts({
        templateId: DA_REGISTRY_TEMPLATES.burnRequest,
      }),
      registry.operatorParty(),
    ]);
    return contracts.flatMap((contract) => {
      const request = parseBurnRequest(contract);
      return request !== null &&
        request.holder === wallet.partyId &&
        isFromRegistry(request, contract.signatories, operator, registry.trustedProvidersOf(request.instrumentId.admin))
        ? [request]
        : [];
    });
  }

  return {
    ...core.api,
    listMintOffers,
    acceptMintOffer: async (mintOfferCid, acceptOptions) =>
      exclusive(async () => runAcceptMintOffer(mintOfferCid, acceptOptions)),
    requestBurn: async (burn) => exclusive(async () => runRequestBurn(burn)),
    createTransferPreapproval: async (preapproval) => exclusive(async () => runCreateTransferPreapproval(preapproval)),
    listBurnRequests,
  };
}
