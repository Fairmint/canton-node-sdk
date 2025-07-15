// AUTO-GENERATED OPERATION IMPORTS START
import { ListAnsEntriesProxy } from './operations/v0/ans/list-entries-proxy';
import { RegisterNewUser } from './operations/v0/register';
import { GetAmuletRules } from './operations/v0/scan-proxy/get-amulet-rules';
import { GetDsoPartyId } from './operations/v0/scan-proxy/get-dso-party-id';
import { GetOpenAndIssuingMiningRounds } from './operations/v0/scan-proxy/get-open-and-issuing-mining-rounds';
import { GetAmulets } from './operations/v0/wallet/get-amulets';
import { GetWalletBalance } from './operations/v0/wallet/get-balance';
import { GetUserStatus } from './operations/v0/wallet/get-user-status';
import { ListTokenStandardTransfers } from './operations/v0/wallet/token-standard/transfers/list';
import { ListTransferOffers } from './operations/v0/wallet/transfer-offers/list';
// AUTO-GENERATED OPERATION IMPORTS END

import { BaseClient, ClientConfig } from '../../core';
import {  } from './schemas/operations';
import { GetAmuletRulesResponse, GetDsoPartyIdResponse, GetOpenAndIssuingMiningRoundsResponse, ListAnsEntriesProxyResponse, ListResponse, ListTokenStandardTransfersResponse, ListTransferOffersResponse, RegisterResponse, UserStatusResponse, WalletBalanceResponse } from './schemas/api';

/** Client for interacting with Canton's Validator API */
export class ValidatorApiClient extends BaseClient {
  // AUTO-GENERATED METHODS START
  public listAnsEntriesProxy!: (params: void) => Promise<ListAnsEntriesProxyResponse>;
  public registerNewUser!: (params: void) => Promise<RegisterResponse>;
  public getAmuletRules!: (params: void) => Promise<GetAmuletRulesResponse>;
  public getDsoPartyId!: (params: void) => Promise<GetDsoPartyIdResponse>;
  public getOpenAndIssuingMiningRounds!: (params: void) => Promise<GetOpenAndIssuingMiningRoundsResponse>;
  public getAmulets!: (params: void) => Promise<ListResponse>;
  public getWalletBalance!: (params: void) => Promise<WalletBalanceResponse>;
  public getUserStatus!: (params: void) => Promise<UserStatusResponse>;
  public listTokenStandardTransfers!: (params: void) => Promise<ListTokenStandardTransfersResponse>;
  public listTransferOffers!: (params: void) => Promise<ListTransferOffersResponse>;
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
    this.listAnsEntriesProxy = () => new ListAnsEntriesProxy(this).execute();
    this.registerNewUser = () => new RegisterNewUser(this).execute();
    this.getAmuletRules = () => new GetAmuletRules(this).execute();
    this.getDsoPartyId = () => new GetDsoPartyId(this).execute();
    this.getOpenAndIssuingMiningRounds = () => new GetOpenAndIssuingMiningRounds(this).execute();
    this.getAmulets = () => new GetAmulets(this).execute();
    this.getWalletBalance = () => new GetWalletBalance(this).execute();
    this.getUserStatus = () => new GetUserStatus(this).execute();
    this.listTokenStandardTransfers = () => new ListTokenStandardTransfers(this).execute();
    this.listTransferOffers = () => new ListTransferOffers(this).execute();
    // AUTO-GENERATED METHOD IMPLEMENTATIONS END
  }
} 