import { GetMiningRoundDetails } from './operations/v0/scan-proxy/get-mining-round-details';
import { GetOpenAndIssuingMiningRounds } from './operations/v0/scan-proxy/get-open-and-issuing-mining-rounds';
import { LookupFeaturedAppRight } from './operations/v0/scan-proxy/lookup-featured-app-right';
import { LookupTransferCommandCounterByParty } from './operations/v0/scan-proxy/lookup-transfer-command-counter-by-party';
import { LookupTransferCommandStatus } from './operations/v0/scan-proxy/lookup-transfer-command-status';
import { GetAllocationFactory } from './operations/v0/scan-proxy/registry/allocation-instruction/v1/get-allocation-factory';
import { GetAllocationCancelContext } from './operations/v0/scan-proxy/registry/allocations/v1/get-allocation-cancel-context';
import { GetAllocationTransferContext } from './operations/v0/scan-proxy/registry/allocations/v1/get-allocation-transfer-context';
import { GetAllocationWithdrawContext } from './operations/v0/scan-proxy/registry/allocations/v1/get-allocation-withdraw-context';
import { GetInstrument } from './operations/v0/scan-proxy/registry/metadata/v1/get-instrument';
import { GetRegistryInfo } from './operations/v0/scan-proxy/registry/metadata/v1/get-registry-info';
import { ListInstruments } from './operations/v0/scan-proxy/registry/metadata/v1/list-instruments';
import { GetTransferFactory } from './operations/v0/scan-proxy/registry/transfer-instruction/v1/get-transfer-factory';
import { GetTransferInstructionAcceptContext } from './operations/v0/scan-proxy/registry/transfer-instruction/v1/get-transfer-instruction-accept-context';
import { GetTransferInstructionRejectContext } from './operations/v0/scan-proxy/registry/transfer-instruction/v1/get-transfer-instruction-reject-context';
import { GetTransferInstructionWithdrawContext } from './operations/v0/scan-proxy/registry/transfer-instruction/v1/get-transfer-instruction-withdraw-context';
import { CreateBuyTrafficRequest } from './operations/v0/wallet/buy-traffic-requests/create';
import { AcceptTransferOffer } from './operations/v0/wallet/transfer-offers/accept';
import { CreateTransferOffer } from './operations/v0/wallet/transfer-offers/create';
import { ListTransferOffers } from './operations/v0/wallet/transfer-offers/list';
import { RejectTransferOffer } from './operations/v0/wallet/transfer-offers/reject';
import { WithdrawTransferOffer } from './operations/v0/wallet/transfer-offers/withdraw';

import { BaseClient, ClientConfig } from '../../core';
import type { GetAllocationFactoryParams } from './operations/v0/scan-proxy/registry/allocation-instruction/v1/get-allocation-factory';
import type { GetAllocationFactoryResponse } from './operations/v0/scan-proxy/registry/allocation-instruction/v1/get-allocation-factory';
import type { GetAllocationCancelContextParams } from './operations/v0/scan-proxy/registry/allocations/v1/get-allocation-cancel-context';
import type { GetAllocationCancelContextResponse } from './operations/v0/scan-proxy/registry/allocations/v1/get-allocation-cancel-context';
import type { GetAllocationTransferContextParams } from './operations/v0/scan-proxy/registry/allocations/v1/get-allocation-transfer-context';
import type { GetAllocationTransferContextResponse } from './operations/v0/scan-proxy/registry/allocations/v1/get-allocation-transfer-context';
import type { GetAllocationWithdrawContextParams } from './operations/v0/scan-proxy/registry/allocations/v1/get-allocation-withdraw-context';
import type { GetAllocationWithdrawContextResponse } from './operations/v0/scan-proxy/registry/allocations/v1/get-allocation-withdraw-context';
import type { GetInstrumentParams } from './operations/v0/scan-proxy/registry/metadata/v1/get-instrument';
import type { GetInstrumentResponse } from './operations/v0/scan-proxy/registry/metadata/v1/get-instrument';
import type { GetRegistryInfoResponse } from './operations/v0/scan-proxy/registry/metadata/v1/get-registry-info';
import type { ListInstrumentsParams } from './operations/v0/scan-proxy/registry/metadata/v1/list-instruments';
import type { ListInstrumentsResponse } from './operations/v0/scan-proxy/registry/metadata/v1/list-instruments';
import type { GetTransferFactoryParams } from './operations/v0/scan-proxy/registry/transfer-instruction/v1/get-transfer-factory';
import type { GetTransferFactoryResponse } from './operations/v0/scan-proxy/registry/transfer-instruction/v1/get-transfer-factory';
import type { GetTransferInstructionAcceptContextParams } from './operations/v0/scan-proxy/registry/transfer-instruction/v1/get-transfer-instruction-accept-context';
import type { GetTransferInstructionAcceptContextResponse } from './operations/v0/scan-proxy/registry/transfer-instruction/v1/get-transfer-instruction-accept-context';
import type { GetTransferInstructionRejectContextParams } from './operations/v0/scan-proxy/registry/transfer-instruction/v1/get-transfer-instruction-reject-context';
import type { GetTransferInstructionRejectContextResponse } from './operations/v0/scan-proxy/registry/transfer-instruction/v1/get-transfer-instruction-reject-context';
import type { GetTransferInstructionWithdrawContextParams } from './operations/v0/scan-proxy/registry/transfer-instruction/v1/get-transfer-instruction-withdraw-context';
import type { GetTransferInstructionWithdrawContextResponse } from './operations/v0/scan-proxy/registry/transfer-instruction/v1/get-transfer-instruction-withdraw-context';
import { GetFeaturedAppRightParams, GetMiningRoundDetailsParams, LookupTransferCommandCounterByPartyParams, LookupTransferCommandStatusParams } from './schemas/operations';
import { GetMiningRoundDetailsResponse, GetOpenAndIssuingMiningRoundsResponse, LookupFeaturedAppRightResponse, LookupTransferCommandCounterByPartyResponse, LookupTransferCommandStatusResponse } from './schemas/api';
import { operations as ansOperations } from '../../generated/apps/validator/src/main/openapi/ans-external';
import { operations as scanProxyOperations } from '../../generated/apps/validator/src/main/openapi/scan-proxy';
import { operations as validatorOperations } from '../../generated/apps/validator/src/main/openapi/validator-internal';
import { operations as walletOperations } from '../../generated/apps/wallet/src/main/openapi/wallet-internal';

/** Client for interacting with Canton's Validator API */
export class ValidatorApiClient extends BaseClient {
  public getMiningRoundDetails!: (params: GetMiningRoundDetailsParams) => Promise<GetMiningRoundDetailsResponse>;
  public getOpenAndIssuingMiningRounds!: (params: void) => Promise<GetOpenAndIssuingMiningRoundsResponse>;
  public lookupFeaturedAppRight!: (params: GetFeaturedAppRightParams) => Promise<LookupFeaturedAppRightResponse>;
  public lookupTransferCommandCounterByParty!: (params: LookupTransferCommandCounterByPartyParams) => Promise<LookupTransferCommandCounterByPartyResponse>;
  public lookupTransferCommandStatus!: (params: LookupTransferCommandStatusParams) => Promise<LookupTransferCommandStatusResponse>;
  public getAllocationFactory!: (params: GetAllocationFactoryParams) => Promise<GetAllocationFactoryResponse>;
  public getAllocationCancelContext!: (params: GetAllocationCancelContextParams) => Promise<GetAllocationCancelContextResponse>;
  public getAllocationTransferContext!: (params: GetAllocationTransferContextParams) => Promise<GetAllocationTransferContextResponse>;
  public getAllocationWithdrawContext!: (params: GetAllocationWithdrawContextParams) => Promise<GetAllocationWithdrawContextResponse>;
  public getInstrument!: (params: GetInstrumentParams) => Promise<GetInstrumentResponse>;
  public getRegistryInfo!: (params: void) => Promise<GetRegistryInfoResponse>;
  public listInstruments!: (params: ListInstrumentsParams) => Promise<ListInstrumentsResponse>;
  public getTransferFactory!: (params: GetTransferFactoryParams) => Promise<GetTransferFactoryResponse>;
  public getTransferInstructionAcceptContext!: (params: GetTransferInstructionAcceptContextParams) => Promise<GetTransferInstructionAcceptContextResponse>;
  public getTransferInstructionRejectContext!: (params: GetTransferInstructionRejectContextParams) => Promise<GetTransferInstructionRejectContextResponse>;
  public getTransferInstructionWithdrawContext!: (params: GetTransferInstructionWithdrawContextParams) => Promise<GetTransferInstructionWithdrawContextResponse>;
  public createBuyTrafficRequest!: (params: CreateBuyTrafficRequestParams) => Promise<CreateBuyTrafficRequestResponse>;
  public acceptTransferOffer!: (params: AcceptTransferOfferParams) => Promise<AcceptTransferOfferResponse>;
  public createTransferOffer!: (params: CreateTransferOfferParams) => Promise<CreateTransferOfferResponse>;
  public listTransferOffers!: (params: void) => Promise<ListTransferOffersResponse>;
  public rejectTransferOffer!: (params: RejectTransferOfferParams) => Promise<RejectTransferOfferResponse>;
  public withdrawTransferOffer!: (params: WithdrawTransferOfferParams) => Promise<WithdrawTransferOfferResponse>;

  constructor(clientConfig: ClientConfig) {
    super('VALIDATOR_API', clientConfig);
    this.initializeMethods();
  }

  /**
   * Initializes method implementations by binding them to operation classes.
   * This is required because TypeScript declarations (above) only provide type safety,
   * but don't create the actual runtime method implementations.
   * 
   * Auto-generation happens via `yarn generate-clients` which:
   * 1. Scans operation files for `createApiOperation` usage
   * 2. Generates imports, method declarations, and implementations
   * 3. Creates the client file from the template
   */
  private initializeMethods(): void {
    this.getMiningRoundDetails = (params) => new GetMiningRoundDetails(this).execute(params);
    this.getOpenAndIssuingMiningRounds = () => new GetOpenAndIssuingMiningRounds(this).execute();
    this.lookupFeaturedAppRight = (params) => new LookupFeaturedAppRight(this).execute(params);
    this.lookupTransferCommandCounterByParty = (params) => new LookupTransferCommandCounterByParty(this).execute(params);
    this.lookupTransferCommandStatus = (params) => new LookupTransferCommandStatus(this).execute(params);
    this.getAllocationFactory = (params) => new GetAllocationFactory(this).execute(params);
    this.getAllocationCancelContext = (params) => new GetAllocationCancelContext(this).execute(params);
    this.getAllocationTransferContext = (params) => new GetAllocationTransferContext(this).execute(params);
    this.getAllocationWithdrawContext = (params) => new GetAllocationWithdrawContext(this).execute(params);
    this.getInstrument = (params) => new GetInstrument(this).execute(params);
    this.getRegistryInfo = () => new GetRegistryInfo(this).execute();
    this.listInstruments = (params) => new ListInstruments(this).execute(params);
    this.getTransferFactory = (params) => new GetTransferFactory(this).execute(params);
    this.getTransferInstructionAcceptContext = (params) => new GetTransferInstructionAcceptContext(this).execute(params);
    this.getTransferInstructionRejectContext = (params) => new GetTransferInstructionRejectContext(this).execute(params);
    this.getTransferInstructionWithdrawContext = (params) => new GetTransferInstructionWithdrawContext(this).execute(params);
    this.createBuyTrafficRequest = (params) => new CreateBuyTrafficRequest(this).execute(params);
    this.acceptTransferOffer = (params) => new AcceptTransferOffer(this).execute(params);
    this.createTransferOffer = (params) => new CreateTransferOffer(this).execute(params);
    this.listTransferOffers = () => new ListTransferOffers(this).execute();
    this.rejectTransferOffer = (params) => new RejectTransferOffer(this).execute(params);
    this.withdrawTransferOffer = (params) => new WithdrawTransferOffer(this).execute(params);
  }
}