// AUTO-GENERATED OPERATION IMPORTS START
import { GetAuthenticatedUser } from './operations/v2/authenticated-user/get';
import { AsyncSubmitReassignment } from './operations/v2/commands/async/submit-reassignment';
import { AsyncSubmit } from './operations/v2/commands/async/submit';
import { SubmitAndWaitForReassignment } from './operations/v2/commands/submit-and-wait-for-reassignment';
import { SubmitAndWaitForTransactionTree } from './operations/v2/commands/submit-and-wait-for-transaction-tree';
import { SubmitAndWaitForTransaction } from './operations/v2/commands/submit-and-wait-for-transaction';
import { SubmitAndWait } from './operations/v2/commands/submit-and-wait';
import { GetEventsByContractId } from './operations/v2/events/get-events-by-contract-id';
import { DeleteIdentityProviderConfig } from './operations/v2/idps/delete-idp';
import { GetIdentityProviderConfig } from './operations/v2/idps/get-idp';
import { ListIdentityProviderConfigs } from './operations/v2/idps/get';
import { UpdateIdentityProviderConfig } from './operations/v2/idps/patch-idp';
import { CreateIdentityProviderConfig } from './operations/v2/idps/post';
import { GetPackageStatus } from './operations/v2/packages/get-package-status';
import { GetPreferredPackageVersion } from './operations/v2/packages/get-preferred-package-version';
import { GetPreferredPackages } from './operations/v2/packages/get-preferred-packages';
import { ListPackages } from './operations/v2/packages/get';
import { UploadDarFile } from './operations/v2/packages/post';
import { GetParticipantId } from './operations/v2/parties/get-participant-id';
import { GetPartyDetails } from './operations/v2/parties/get-party-details';
import { ListKnownParties } from './operations/v2/parties/get';
import { AllocateParty } from './operations/v2/parties/post';
import { UpdatePartyDetails } from './operations/v2/parties/update-party-details';
import { GetActiveContracts } from './operations/v2/state/get-active-contracts';
import { GetConnectedSynchronizers } from './operations/v2/state/get-connected-synchronizers';
import { GetLatestPrunedOffsets } from './operations/v2/state/get-latest-pruned-offsets';
import { GetLedgerEnd } from './operations/v2/state/get-ledger-end';
import { GetUpdates } from './operations/v2/updates/get-flats';
import { GetTransactionById } from './operations/v2/updates/get-transaction-by-id';
import { GetTransactionByOffset } from './operations/v2/updates/get-transaction-by-offset';
import { GetTransactionTreeById } from './operations/v2/updates/get-transaction-tree-by-id';
import { GetTransactionTreeByOffset } from './operations/v2/updates/get-transaction-tree-by-offset';
import { GetUpdateTrees } from './operations/v2/updates/get-trees';
import { GetUpdateById } from './operations/v2/updates/get-update-by-id';
import { GetUpdateByOffset } from './operations/v2/updates/get-update-by-offset';
import { CreateUser } from './operations/v2/users/create-user';
import { DeleteUser } from './operations/v2/users/delete-user';
import { GetUser } from './operations/v2/users/get-user';
import { GrantUserRights } from './operations/v2/users/grant-user-rights';
import { ListUserRights } from './operations/v2/users/list-user-rights';
import { ListUsers } from './operations/v2/users/list-users';
import { RevokeUserRights } from './operations/v2/users/revoke-user-rights';
import { UpdateUserIdentityProvider } from './operations/v2/users/update-user-identity-provider';
import { UpdateUser } from './operations/v2/users/update-user';
import { GetVersion } from './operations/v2/version/get';
// AUTO-GENERATED OPERATION IMPORTS END
import { BaseClient, ClientConfig } from '../../core';
import { AllocatePartyParams, AsyncSubmitParams, AsyncSubmitReassignmentParams, CreateIdentityProviderConfigParams, CreateUserParams, DeleteIdentityProviderConfigParams, DeleteUserParams, GetActiveContractsParams, GetAuthenticatedUserParams, GetConnectedSynchronizersParams, GetEventsByContractIdParams, GetIdentityProviderConfigParams, GetLatestPrunedOffsetsParams, GetLedgerEndParams, GetPackageStatusParams, GetParticipantIdParams, GetPartyDetailsParams, GetPreferredPackageVersionParams, GetPreferredPackagesParams, GetTransactionByIdParams, GetTransactionByOffsetParams, GetTransactionTreeByIdParams, GetTransactionTreeByOffsetParams, GetUpdateByIdParams, GetUpdateByOffsetParams, GetUpdateTreesParams, GetUpdatesParams, GetUserParams, GrantUserRightsParams, ListIdentityProviderConfigsParams, ListKnownPartiesParams, ListPackagesParams, ListUserRightsParams, ListUsersParams, RevokeUserRightsParams, SubmitAndWaitForReassignmentParams, SubmitAndWaitForTransactionParams, SubmitAndWaitForTransactionTreeParams, SubmitAndWaitParams, UpdateIdentityProviderConfigParams, UpdatePartyDetailsParams, UpdateUserIdentityProviderParams, UpdateUserParams, UploadDarFileParams } from './schemas/operations';
import { AllocatePartyResponse, CreateIdentityProviderConfigResponse, CreateUserResponse, DeleteIdentityProviderConfigResponse, DeleteUserResponse, EventsByContractIdResponse, GetConnectedSynchronizersResponse, GetIdentityProviderConfigResponse, GetLatestPrunedOffsetsResponse, GetLedgerApiVersionResponse, GetLedgerEndResponse, GetPackageStatusResponse, GetParticipantIdResponse, GetPartiesResponse, GetPreferredPackageVersionResponse, GetPreferredPackagesResponse, GetTransactionResponse, GetTransactionTreeResponse, GetUpdateResponse, GetUpdateTreesResponse, GetUpdatesResponse, GetUserResponse, GrantUserRightsResponse, JsGetActiveContractsResponse, JsSubmitAndWaitForReassignmentResponse, JsSubmitAndWaitForTransactionResponse, JsSubmitAndWaitForTransactionTreeResponse, ListIdentityProviderConfigsResponse, ListKnownPartiesResponse, ListPackagesResponse, ListUserRightsResponse, ListUsersResponse, RevokeUserRightsResponse, SubmitAndWaitResponse, SubmitReassignmentResponse, SubmitResponse, TransactionTreeByOffsetResponse, UpdateIdentityProviderConfigResponse, UpdatePartyDetailsResponse, UpdateUserIdentityProviderIdResponse, UpdateUserResponse, UploadDarFileResponse } from './schemas/api';

/** Client for interacting with Canton's Ledger JSON API */
export class LedgerJsonApiClient extends BaseClient {
  // AUTO-GENERATED METHODS START
  public getAuthenticatedUser!: (params: GetAuthenticatedUserParams) => Promise<GetUserResponse>;
  public asyncSubmitReassignment!: (params: AsyncSubmitReassignmentParams) => Promise<SubmitReassignmentResponse>;
  public asyncSubmit!: (params: AsyncSubmitParams) => Promise<SubmitResponse>;
  public submitAndWaitForReassignment!: (params: SubmitAndWaitForReassignmentParams) => Promise<JsSubmitAndWaitForReassignmentResponse>;
  public submitAndWaitForTransactionTree!: (params: SubmitAndWaitForTransactionTreeParams) => Promise<JsSubmitAndWaitForTransactionTreeResponse>;
  public submitAndWaitForTransaction!: (params: SubmitAndWaitForTransactionParams) => Promise<JsSubmitAndWaitForTransactionResponse>;
  public submitAndWait!: (params: SubmitAndWaitParams) => Promise<SubmitAndWaitResponse>;
  public getEventsByContractId!: (params: GetEventsByContractIdParams) => Promise<EventsByContractIdResponse>;
  public deleteIdentityProviderConfig!: (params: DeleteIdentityProviderConfigParams) => Promise<DeleteIdentityProviderConfigResponse>;
  public getIdentityProviderConfig!: (params: GetIdentityProviderConfigParams) => Promise<GetIdentityProviderConfigResponse>;
  public listIdentityProviderConfigs!: (params: ListIdentityProviderConfigsParams) => Promise<ListIdentityProviderConfigsResponse>;
  public updateIdentityProviderConfig!: (params: UpdateIdentityProviderConfigParams) => Promise<UpdateIdentityProviderConfigResponse>;
  public createIdentityProviderConfig!: (params: CreateIdentityProviderConfigParams) => Promise<CreateIdentityProviderConfigResponse>;
  public getPackageStatus!: (params: GetPackageStatusParams) => Promise<GetPackageStatusResponse>;
  public getPreferredPackageVersion!: (params: GetPreferredPackageVersionParams) => Promise<GetPreferredPackageVersionResponse>;
  public getPreferredPackages!: (params: GetPreferredPackagesParams) => Promise<GetPreferredPackagesResponse>;
  public listPackages!: (params: ListPackagesParams) => Promise<ListPackagesResponse>;
  public uploadDarFile!: (params: UploadDarFileParams) => Promise<UploadDarFileResponse>;
  public getParticipantId!: (params: GetParticipantIdParams) => Promise<GetParticipantIdResponse>;
  public getPartyDetails!: (params: GetPartyDetailsParams) => Promise<GetPartiesResponse>;
  public listKnownParties!: (params: ListKnownPartiesParams) => Promise<ListKnownPartiesResponse>;
  public allocateParty!: (params: AllocatePartyParams) => Promise<AllocatePartyResponse>;
  public updatePartyDetails!: (params: UpdatePartyDetailsParams) => Promise<UpdatePartyDetailsResponse>;
  public getActiveContracts!: (params: GetActiveContractsParams) => Promise<JsGetActiveContractsResponse>;
  public getConnectedSynchronizers!: (params: GetConnectedSynchronizersParams) => Promise<GetConnectedSynchronizersResponse>;
  public getLatestPrunedOffsets!: (params: GetLatestPrunedOffsetsParams) => Promise<GetLatestPrunedOffsetsResponse>;
  public getLedgerEnd!: (params: GetLedgerEndParams) => Promise<GetLedgerEndResponse>;
  public getUpdates!: (params: GetUpdatesParams) => Promise<GetUpdatesResponse>;
  public getTransactionById!: (params: GetTransactionByIdParams) => Promise<GetTransactionResponse>;
  public getTransactionByOffset!: (params: GetTransactionByOffsetParams) => Promise<GetTransactionResponse>;
  public getTransactionTreeById!: (params: GetTransactionTreeByIdParams) => Promise<GetTransactionTreeResponse>;
  public getTransactionTreeByOffset!: (params: GetTransactionTreeByOffsetParams) => Promise<TransactionTreeByOffsetResponse>;
  public getUpdateTrees!: (params: GetUpdateTreesParams) => Promise<GetUpdateTreesResponse>;
  public getUpdateById!: (params: GetUpdateByIdParams) => Promise<GetUpdateResponse>;
  public getUpdateByOffset!: (params: GetUpdateByOffsetParams) => Promise<GetUpdateResponse>;
  public createUser!: (params: CreateUserParams) => Promise<CreateUserResponse>;
  public deleteUser!: (params: DeleteUserParams) => Promise<DeleteUserResponse>;
  public getUser!: (params: GetUserParams) => Promise<GetUserResponse>;
  public grantUserRights!: (params: GrantUserRightsParams) => Promise<GrantUserRightsResponse>;
  public listUserRights!: (params: ListUserRightsParams) => Promise<ListUserRightsResponse>;
  public listUsers!: (params: ListUsersParams) => Promise<ListUsersResponse>;
  public revokeUserRights!: (params: RevokeUserRightsParams) => Promise<RevokeUserRightsResponse>;
  public updateUserIdentityProvider!: (params: UpdateUserIdentityProviderParams) => Promise<UpdateUserIdentityProviderIdResponse>;
  public updateUser!: (params: UpdateUserParams) => Promise<UpdateUserResponse>;
  public getVersion!: (params: void) => Promise<GetLedgerApiVersionResponse>;
  // AUTO-GENERATED METHODS END

  constructor(clientConfig: ClientConfig) {
    super('LEDGER_JSON_API', clientConfig);
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
    this.getAuthenticatedUser = (params) => new GetAuthenticatedUser(this).execute(params);
    this.asyncSubmitReassignment = (params) => new AsyncSubmitReassignment(this).execute(params);
    this.asyncSubmit = (params) => new AsyncSubmit(this).execute(params);
    this.submitAndWaitForReassignment = (params) => new SubmitAndWaitForReassignment(this).execute(params);
    this.submitAndWaitForTransactionTree = (params) => new SubmitAndWaitForTransactionTree(this).execute(params);
    this.submitAndWaitForTransaction = (params) => new SubmitAndWaitForTransaction(this).execute(params);
    this.submitAndWait = (params) => new SubmitAndWait(this).execute(params);
    this.getEventsByContractId = (params) => new GetEventsByContractId(this).execute(params);
    this.deleteIdentityProviderConfig = (params) => new DeleteIdentityProviderConfig(this).execute(params);
    this.getIdentityProviderConfig = (params) => new GetIdentityProviderConfig(this).execute(params);
    this.listIdentityProviderConfigs = (params) => new ListIdentityProviderConfigs(this).execute(params);
    this.updateIdentityProviderConfig = (params) => new UpdateIdentityProviderConfig(this).execute(params);
    this.createIdentityProviderConfig = (params) => new CreateIdentityProviderConfig(this).execute(params);
    this.getPackageStatus = (params) => new GetPackageStatus(this).execute(params);
    this.getPreferredPackageVersion = (params) => new GetPreferredPackageVersion(this).execute(params);
    this.getPreferredPackages = (params) => new GetPreferredPackages(this).execute(params);
    this.listPackages = (params) => new ListPackages(this).execute(params);
    this.uploadDarFile = (params) => new UploadDarFile(this).execute(params);
    this.getParticipantId = (params) => new GetParticipantId(this).execute(params);
    this.getPartyDetails = (params) => new GetPartyDetails(this).execute(params);
    this.listKnownParties = (params) => new ListKnownParties(this).execute(params);
    this.allocateParty = (params) => new AllocateParty(this).execute(params);
    this.updatePartyDetails = (params) => new UpdatePartyDetails(this).execute(params);
    this.getActiveContracts = (params) => new GetActiveContracts(this).execute(params);
    this.getConnectedSynchronizers = (params) => new GetConnectedSynchronizers(this).execute(params);
    this.getLatestPrunedOffsets = (params) => new GetLatestPrunedOffsets(this).execute(params);
    this.getLedgerEnd = (params) => new GetLedgerEnd(this).execute(params);
    this.getUpdates = (params) => new GetUpdates(this).execute(params);
    this.getTransactionById = (params) => new GetTransactionById(this).execute(params);
    this.getTransactionByOffset = (params) => new GetTransactionByOffset(this).execute(params);
    this.getTransactionTreeById = (params) => new GetTransactionTreeById(this).execute(params);
    this.getTransactionTreeByOffset = (params) => new GetTransactionTreeByOffset(this).execute(params);
    this.getUpdateTrees = (params) => new GetUpdateTrees(this).execute(params);
    this.getUpdateById = (params) => new GetUpdateById(this).execute(params);
    this.getUpdateByOffset = (params) => new GetUpdateByOffset(this).execute(params);
    this.createUser = (params) => new CreateUser(this).execute(params);
    this.deleteUser = (params) => new DeleteUser(this).execute(params);
    this.getUser = (params) => new GetUser(this).execute(params);
    this.grantUserRights = (params) => new GrantUserRights(this).execute(params);
    this.listUserRights = (params) => new ListUserRights(this).execute(params);
    this.listUsers = (params) => new ListUsers(this).execute(params);
    this.revokeUserRights = (params) => new RevokeUserRights(this).execute(params);
    this.updateUserIdentityProvider = (params) => new UpdateUserIdentityProvider(this).execute(params);
    this.updateUser = (params) => new UpdateUser(this).execute(params);
    this.getVersion = (params) => new GetVersion(this).execute(params);
    // AUTO-GENERATED METHOD IMPLEMENTATIONS END
  }
} 