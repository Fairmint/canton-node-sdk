// AUTO-GENERATED OPERATION IMPORTS START
import { CreateUser } from './operations/v0/admin/create-user';
import { GetExternalPartyBalance } from './operations/v0/admin/get-external-party-balance';
import { CreateAnsEntry } from './operations/v0/ans/create-entry';
import { GetAnsRules } from './operations/v0/ans/get-rules';
import { ListAnsEntriesProxy } from './operations/v0/ans/list-entries-proxy';
import { LookupAnsEntryByName } from './operations/v0/ans/lookup-by-name';
import { LookupAnsEntryByParty } from './operations/v0/ans/lookup-by-party';
import { RegisterNewUser } from './operations/v0/register';
import { GetAmuletRules } from './operations/v0/scan-proxy/get-amulet-rules';
import { GetDsoPartyId } from './operations/v0/scan-proxy/get-dso-party-id';
import { GetMiningRoundDetails } from './operations/v0/scan-proxy/get-mining-round-details';
import { GetOpenAndIssuingMiningRounds } from './operations/v0/scan-proxy/get-open-and-issuing-mining-rounds';
import { LookupFeaturedAppRight } from './operations/v0/scan-proxy/lookup-featured-app-right';
import { LookupTransferCommandCounterByParty } from './operations/v0/scan-proxy/lookup-transfer-command-counter-by-party';
import { LookupTransferCommandStatus } from './operations/v0/scan-proxy/lookup-transfer-command-status';
import { CreateBuyTrafficRequest } from './operations/v0/wallet/buy-traffic-requests/create';
import { GetAmulets } from './operations/v0/wallet/get-amulets';
import { GetWalletBalance } from './operations/v0/wallet/get-balance';
import { GetUserStatus } from './operations/v0/wallet/get-user-status';
import { CreateTokenStandardTransfer } from './operations/v0/wallet/token-standard/transfers/create';
import { ListTokenStandardTransfers } from './operations/v0/wallet/token-standard/transfers/list';
import { AcceptTransferOffer } from './operations/v0/wallet/transfer-offers/accept';
import { CreateTransferOffer } from './operations/v0/wallet/transfer-offers/create';
import { ListTransferOffers } from './operations/v0/wallet/transfer-offers/list';
import { RejectTransferOffer } from './operations/v0/wallet/transfer-offers/reject';
import { WithdrawTransferOffer } from './operations/v0/wallet/transfer-offers/withdraw';
import { GetTransferFactory } from './operations/v0/scan-proxy/registry/transfer-instruction/v1/get-transfer-factory';
import { GetTransferInstructionAcceptContext } from './operations/v0/scan-proxy/registry/transfer-instruction/v1/get-transfer-instruction-accept-context';
import { GetTransferInstructionRejectContext } from './operations/v0/scan-proxy/registry/transfer-instruction/v1/get-transfer-instruction-reject-context';
import { GetTransferInstructionWithdrawContext } from './operations/v0/scan-proxy/registry/transfer-instruction/v1/get-transfer-instruction-withdraw-context';
// AUTO-GENERATED OPERATION IMPORTS END

import { BaseClient, ClientConfig } from '../../core';
import { AcceptTransferOfferParams, CreateAnsEntryParams, CreateBuyTrafficRequestParams, CreateTokenStandardTransferParams, CreateTransferOfferParams, CreateUserParams, GetAnsRulesParams, GetExternalPartyBalanceParams, GetFeaturedAppRightParams, GetMiningRoundDetailsParams, LookupAnsEntryByNameParams, LookupAnsEntryByPartyParams, LookupTransferCommandCounterByPartyParams, LookupTransferCommandStatusParams, RejectTransferOfferParams, WithdrawTransferOfferParams } from './schemas/operations';
import type { GetTransferFactoryParams, GetTransferFactoryResponse } from './operations/v0/scan-proxy/registry/transfer-instruction/v1/get-transfer-factory';
import type { GetTransferInstructionAcceptContextParams, GetTransferInstructionAcceptContextResponse } from './operations/v0/scan-proxy/registry/transfer-instruction/v1/get-transfer-instruction-accept-context';
import type { GetTransferInstructionRejectContextParams, GetTransferInstructionRejectContextResponse } from './operations/v0/scan-proxy/registry/transfer-instruction/v1/get-transfer-instruction-reject-context';
import type { GetTransferInstructionWithdrawContextParams, GetTransferInstructionWithdrawContextResponse } from './operations/v0/scan-proxy/registry/transfer-instruction/v1/get-transfer-instruction-withdraw-context';
import { AcceptTransferOfferResponse, CreateAnsEntryResponse, CreateBuyTrafficRequestResponse, CreateTransferOfferResponse, ExternalPartyBalanceResponse, GetAmuletRulesResponse, GetAnsRulesResponse, GetDsoPartyIdResponse, GetMiningRoundDetailsResponse, GetOpenAndIssuingMiningRoundsResponse, ListAnsEntriesProxyResponse, ListResponse, ListTokenStandardTransfersResponse, ListTransferOffersResponse, LookupAnsEntryByNameResponse, LookupAnsEntryByPartyResponse, LookupFeaturedAppRightResponse, LookupTransferCommandCounterByPartyResponse, LookupTransferCommandStatusResponse, OnboardUserResponse, RegisterResponse, RejectTransferOfferResponse, TransferInstructionResultResponse, UserStatusResponse, WalletBalanceResponse, WithdrawTransferOfferResponse } from './schemas/api';

/** Client for interacting with Canton's Validator API */
export class ValidatorApiClient extends BaseClient {
  // AUTO-GENERATED METHODS START
  public createUser!: (params: CreateUserParams) => Promise<OnboardUserResponse>;
  public getExternalPartyBalance!: (params: GetExternalPartyBalanceParams) => Promise<ExternalPartyBalanceResponse>;
  public createAnsEntry!: (params: CreateAnsEntryParams) => Promise<CreateAnsEntryResponse>;
  public getAnsRules!: (params: GetAnsRulesParams) => Promise<GetAnsRulesResponse>;
  public listAnsEntriesProxy!: (params: void) => Promise<ListAnsEntriesProxyResponse>;
  public lookupAnsEntryByName!: (params: LookupAnsEntryByNameParams) => Promise<LookupAnsEntryByNameResponse>;
  public lookupAnsEntryByParty!: (params: LookupAnsEntryByPartyParams) => Promise<LookupAnsEntryByPartyResponse>;
  public registerNewUser!: (params: void) => Promise<RegisterResponse>;
  public getAmuletRules!: (params: void) => Promise<GetAmuletRulesResponse>;
  public getDsoPartyId!: (params: void) => Promise<GetDsoPartyIdResponse>;
  public getMiningRoundDetails!: (params: GetMiningRoundDetailsParams) => Promise<GetMiningRoundDetailsResponse>;
  public getOpenAndIssuingMiningRounds!: (params: void) => Promise<GetOpenAndIssuingMiningRoundsResponse>;
  public lookupFeaturedAppRight!: (params: GetFeaturedAppRightParams) => Promise<LookupFeaturedAppRightResponse>;
  public lookupTransferCommandCounterByParty!: (params: LookupTransferCommandCounterByPartyParams) => Promise<LookupTransferCommandCounterByPartyResponse>;
  public lookupTransferCommandStatus!: (params: LookupTransferCommandStatusParams) => Promise<LookupTransferCommandStatusResponse>;
  public createBuyTrafficRequest!: (params: CreateBuyTrafficRequestParams) => Promise<CreateBuyTrafficRequestResponse>;
  public getAmulets!: (params: void) => Promise<ListResponse>;
  public getWalletBalance!: (params: void) => Promise<WalletBalanceResponse>;
  public getUserStatus!: (params: void) => Promise<UserStatusResponse>;
  public createTokenStandardTransfer!: (params: CreateTokenStandardTransferParams) => Promise<TransferInstructionResultResponse>;
  public listTokenStandardTransfers!: (params: void) => Promise<ListTokenStandardTransfersResponse>;
  public acceptTransferOffer!: (params: AcceptTransferOfferParams) => Promise<AcceptTransferOfferResponse>;
  public createTransferOffer!: (params: CreateTransferOfferParams) => Promise<CreateTransferOfferResponse>;
  public listTransferOffers!: (params: void) => Promise<ListTransferOffersResponse>;
  public rejectTransferOffer!: (params: RejectTransferOfferParams) => Promise<RejectTransferOfferResponse>;
  public withdrawTransferOffer!: (params: WithdrawTransferOfferParams) => Promise<WithdrawTransferOfferResponse>;
  public getTransferFactory!: (params: GetTransferFactoryParams) => Promise<GetTransferFactoryResponse>;
  public getTransferInstructionAcceptContext!: (params: GetTransferInstructionAcceptContextParams) => Promise<GetTransferInstructionAcceptContextResponse>;
  public getTransferInstructionRejectContext!: (params: GetTransferInstructionRejectContextParams) => Promise<GetTransferInstructionRejectContextResponse>;
  public getTransferInstructionWithdrawContext!: (params: GetTransferInstructionWithdrawContextParams) => Promise<GetTransferInstructionWithdrawContextResponse>;
  // AUTO-GENERATED METHODS END

  constructor(clientConfig: ClientConfig) {
    super('VALIDATOR_API', clientConfig);
    this.initializeMethods();
  }

  /**
   * Initializes method implementations by binding them to operation classes.
   * This is required because TypeScript declarations (above) only provide type safety,
   * but don't create the actual runtime method implementations.
   * 
   * Auto-generation happens via `yarn generate-client-methods` which:
   * 1. Scans operation files for `createApiOperation` usage
   * 2. Generates imports, method declarations, and implementations
   * 3. Replaces content between codegen markers
   */
  private initializeMethods(): void {
    // AUTO-GENERATED METHOD IMPLEMENTATIONS START
    this.createUser = (params) => new CreateUser(this).execute(params);
    this.getExternalPartyBalance = (params) => new GetExternalPartyBalance(this).execute(params);
    this.createAnsEntry = (params) => new CreateAnsEntry(this).execute(params);
    this.getAnsRules = (params) => new GetAnsRules(this).execute(params);
    this.listAnsEntriesProxy = () => new ListAnsEntriesProxy(this).execute();
    this.lookupAnsEntryByName = (params) => new LookupAnsEntryByName(this).execute(params);
    this.lookupAnsEntryByParty = (params) => new LookupAnsEntryByParty(this).execute(params);
    this.registerNewUser = () => new RegisterNewUser(this).execute();
    this.getAmuletRules = () => new GetAmuletRules(this).execute();
    this.getDsoPartyId = () => new GetDsoPartyId(this).execute();
    this.getMiningRoundDetails = (params) => new GetMiningRoundDetails(this).execute(params);
    this.getOpenAndIssuingMiningRounds = () => new GetOpenAndIssuingMiningRounds(this).execute();
    this.lookupFeaturedAppRight = (params) => new LookupFeaturedAppRight(this).execute(params);
    this.lookupTransferCommandCounterByParty = (params) => new LookupTransferCommandCounterByParty(this).execute(params);
    this.lookupTransferCommandStatus = (params) => new LookupTransferCommandStatus(this).execute(params);
    this.createBuyTrafficRequest = (params) => new CreateBuyTrafficRequest(this).execute(params);
    this.getAmulets = () => new GetAmulets(this).execute();
    this.getWalletBalance = () => new GetWalletBalance(this).execute();
    this.getUserStatus = () => new GetUserStatus(this).execute();
    this.createTokenStandardTransfer = (params) => new CreateTokenStandardTransfer(this).execute(params);
    this.listTokenStandardTransfers = () => new ListTokenStandardTransfers(this).execute();
    this.acceptTransferOffer = (params) => new AcceptTransferOffer(this).execute(params);
    this.createTransferOffer = (params) => new CreateTransferOffer(this).execute(params);
    this.listTransferOffers = () => new ListTransferOffers(this).execute();
    this.rejectTransferOffer = (params) => new RejectTransferOffer(this).execute(params);
    this.withdrawTransferOffer = (params) => new WithdrawTransferOffer(this).execute(params);
    this.getTransferFactory = (params) => new GetTransferFactory(this).execute(params);
    this.getTransferInstructionAcceptContext = (params) => new GetTransferInstructionAcceptContext(this).execute(params);
    this.getTransferInstructionRejectContext = (params) => new GetTransferInstructionRejectContext(this).execute(params);
    this.getTransferInstructionWithdrawContext = (params) => new GetTransferInstructionWithdrawContext(this).execute(params);
    // AUTO-GENERATED METHOD IMPLEMENTATIONS END
  }
} 