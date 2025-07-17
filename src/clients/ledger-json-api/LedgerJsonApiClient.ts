import { BaseClient, ClientConfig } from '../../core';

// AUTO-GENERATED OPERATION IMPORTS START
import { GetAuthenticatedUser } from './operations/v2/authenticated-user/get';
import { AsyncSubmitReassignment } from './operations/v2/commands/async/submit-reassignment';
import { AsyncSubmit } from './operations/v2/commands/async/submit';
import { Completions } from './operations/v2/commands/completions';
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
import { InteractiveSubmissionAllocateParty } from './operations/v2/interactive-submission/allocate-party';
import { InteractiveSubmissionCreateUser } from './operations/v2/interactive-submission/create-user';
import { InteractiveSubmissionGetPreferredPackageVersion } from './operations/v2/interactive-submission/get-preferred-package-version';
import { InteractiveSubmissionGetPreferredPackages } from './operations/v2/interactive-submission/get-preferred-packages';
import { InteractiveSubmissionUploadDar } from './operations/v2/interactive-submission/upload-dar';
import { GetPackageStatus } from './operations/v2/packages/get-package-status';
import { ListPackages } from './operations/v2/packages/get';
import { UploadDarFile } from './operations/v2/packages/post';
import { GetParticipantId } from './operations/v2/parties/get-participant-id';
import { GetParties } from './operations/v2/parties/get';
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

// Import types from individual operation files

// AUTO-GENERATED SCHEMA IMPORTS START
import { AllocatePartyParams, AsyncSubmitParams, AsyncSubmitReassignmentParams, CompletionsParams, CreateIdentityProviderConfigParams, CreateUserParams, DeleteIdentityProviderConfigParams, DeleteUserParams, EventsByContractIdParams, GetActiveContractsParams, GetAuthenticatedUserParams, GetConnectedSynchronizersParams, GetIdentityProviderConfigParams, GetLatestPrunedOffsetsParams, GetLedgerEndParams, GetPackageStatusParams, GetParticipantIdParams, GetPartiesParams, GetTransactionByIdParams, GetTransactionByOffsetParams, GetTransactionTreeByIdParams, GetTransactionTreeByOffsetParams, GetUpdateByIdParams, GetUpdateByOffsetParams, GetUpdateTreesParams, GetUpdatesParams, GetUserParams, GrantUserRightsParams, InteractiveSubmissionAllocatePartyParams, InteractiveSubmissionCreateUserParams, InteractiveSubmissionGetPreferredPackageVersionParams, InteractiveSubmissionGetPreferredPackagesParams, InteractiveSubmissionUploadDarParams, ListIdentityProviderConfigsParams, ListUserRightsParams, ListUsersParams, RevokeUserRightsParams, SubmitAndWaitForReassignmentParams, SubmitAndWaitForTransactionParams, SubmitAndWaitForTransactionTreeParams, SubmitAndWaitParams, UpdateIdentityProviderConfigParams, UpdatePartyDetailsParams, UpdateUserIdentityProviderParams, UpdateUserParams, UploadDarFileParams } from './schemas/operations';
import { AllocatePartyResponse, AsyncSubmitReassignmentResponse, AsyncSubmitResponse, CompletionsResponse, CreateIdentityProviderConfigResponse, CreateUserResponse, DeleteIdentityProviderConfigResponse, DeleteUserResponse, EventsByContractIdResponse, GetActiveContractsResponse, GetConnectedSynchronizersResponse, GetIdentityProviderConfigResponse, GetLatestPrunedOffsetsResponse, GetLedgerApiVersionResponse, GetLedgerEndResponse, GetPackageStatusResponse, GetParticipantIdResponse, GetPartiesResponse, GetPreferredPackageVersionResponse, GetPreferredPackagesResponse, GetTransactionByIdResponse, GetTransactionByOffsetResponse, GetTransactionTreeByIdResponse, GetTransactionTreeByOffsetResponse, GetUpdateByIdResponse, GetUpdateByOffsetResponse, GetUpdateTreesResponse, GetUpdatesResponse, GetUserResponse, GrantUserRightsResponse, InteractiveSubmissionAllocatePartyResponse, InteractiveSubmissionCreateUserResponse, InteractiveSubmissionUploadDarResponse, JsSubmitAndWaitForReassignmentResponse, ListIdentityProviderConfigsResponse, ListPackagesResponse, ListUserRightsResponse, ListUsersResponse, RevokeUserRightsResponse, SubmitAndWaitForTransactionResponse, SubmitAndWaitForTransactionTreeResponse, SubmitAndWaitResponse, UpdateIdentityProviderConfigResponse, UpdatePartyDetailsResponse, UpdateUserIdentityProviderResponse, UpdateUserResponse, UploadDarFileResponse } from './schemas/api';
// AUTO-GENERATED SCHEMA IMPORTS END

/** Client for interacting with Canton's Ledger JSON API */
export class LedgerJsonApiClient extends BaseClient {
  // AUTO-GENERATED METHODS START
  public getAuthenticatedUser!: (params: GetAuthenticatedUserParams) => Promise<GetUserResponse>;
  public asyncSubmitReassignment!: (params: AsyncSubmitReassignmentParams) => Promise<AsyncSubmitReassignmentResponse>;
  public asyncSubmit!: (params: AsyncSubmitParams) => Promise<AsyncSubmitResponse>;
  public completions!: (params: CompletionsParams) => Promise<CompletionsResponse>;
  public submitAndWaitForReassignment!: (params: SubmitAndWaitForReassignmentParams) => Promise<JsSubmitAndWaitForReassignmentResponse>;
  public submitAndWaitForTransactionTree!: (params: SubmitAndWaitForTransactionTreeParams) => Promise<SubmitAndWaitForTransactionTreeResponse>;
  public submitAndWaitForTransaction!: (params: SubmitAndWaitForTransactionParams) => Promise<SubmitAndWaitForTransactionResponse>;
  public submitAndWait!: (params: SubmitAndWaitParams) => Promise<SubmitAndWaitResponse>;
  public getEventsByContractId!: (params: EventsByContractIdParams) => Promise<EventsByContractIdResponse>;
  public deleteIdentityProviderConfig!: (params: DeleteIdentityProviderConfigParams) => Promise<DeleteIdentityProviderConfigResponse>;
  public getIdentityProviderConfig!: (params: GetIdentityProviderConfigParams) => Promise<GetIdentityProviderConfigResponse>;
  public listIdentityProviderConfigs!: (params: ListIdentityProviderConfigsParams) => Promise<ListIdentityProviderConfigsResponse>;
  public updateIdentityProviderConfig!: (params: UpdateIdentityProviderConfigParams) => Promise<UpdateIdentityProviderConfigResponse>;
  public createIdentityProviderConfig!: (params: CreateIdentityProviderConfigParams) => Promise<CreateIdentityProviderConfigResponse>;
  public interactiveSubmissionAllocateParty!: (params: InteractiveSubmissionAllocatePartyParams) => Promise<InteractiveSubmissionAllocatePartyResponse>;
  public interactiveSubmissionCreateUser!: (params: InteractiveSubmissionCreateUserParams) => Promise<InteractiveSubmissionCreateUserResponse>;
  public interactiveSubmissionGetPreferredPackageVersion!: (params: InteractiveSubmissionGetPreferredPackageVersionParams) => Promise<GetPreferredPackageVersionResponse>;
  public interactiveSubmissionGetPreferredPackages!: (params: InteractiveSubmissionGetPreferredPackagesParams) => Promise<GetPreferredPackagesResponse>;
  public interactiveSubmissionUploadDar!: (params: InteractiveSubmissionUploadDarParams) => Promise<InteractiveSubmissionUploadDarResponse>;
  public getPackageStatus!: (params: GetPackageStatusParams) => Promise<GetPackageStatusResponse>;
  public listPackages!: (params: void) => Promise<ListPackagesResponse>;
  public uploadDarFile!: (params: UploadDarFileParams) => Promise<UploadDarFileResponse>;
  public getParticipantId!: (params: GetParticipantIdParams) => Promise<GetParticipantIdResponse>;
  public getParties!: (params: GetPartiesParams) => Promise<GetPartiesResponse>;
  public allocateParty!: (params: AllocatePartyParams) => Promise<AllocatePartyResponse>;
  public updatePartyDetails!: (params: UpdatePartyDetailsParams) => Promise<UpdatePartyDetailsResponse>;
  public getActiveContracts!: (params: GetActiveContractsParams) => Promise<GetActiveContractsResponse>;
  public getConnectedSynchronizers!: (params: GetConnectedSynchronizersParams) => Promise<GetConnectedSynchronizersResponse>;
  public getLatestPrunedOffsets!: (params: GetLatestPrunedOffsetsParams) => Promise<GetLatestPrunedOffsetsResponse>;
  public getLedgerEnd!: (params: GetLedgerEndParams) => Promise<GetLedgerEndResponse>;
  public getUpdates!: (params: GetUpdatesParams) => Promise<GetUpdatesResponse>;
  public getTransactionById!: (params: GetTransactionByIdParams) => Promise<GetTransactionByIdResponse>;
  public getTransactionByOffset!: (params: GetTransactionByOffsetParams) => Promise<GetTransactionByOffsetResponse>;
  public getTransactionTreeById!: (params: GetTransactionTreeByIdParams) => Promise<GetTransactionTreeByIdResponse>;
  public getTransactionTreeByOffset!: (params: GetTransactionTreeByOffsetParams) => Promise<GetTransactionTreeByOffsetResponse>;
  public getUpdateTrees!: (params: GetUpdateTreesParams) => Promise<GetUpdateTreesResponse>;
  public getUpdateById!: (params: GetUpdateByIdParams) => Promise<GetUpdateByIdResponse>;
  public getUpdateByOffset!: (params: GetUpdateByOffsetParams) => Promise<GetUpdateByOffsetResponse>;
  public createUser!: (params: CreateUserParams) => Promise<CreateUserResponse>;
  public deleteUser!: (params: DeleteUserParams) => Promise<DeleteUserResponse>;
  public getUser!: (params: GetUserParams) => Promise<GetUserResponse>;
  public grantUserRights!: (params: GrantUserRightsParams) => Promise<GrantUserRightsResponse>;
  public listUserRights!: (params: ListUserRightsParams) => Promise<ListUserRightsResponse>;
  public listUsers!: (params: ListUsersParams) => Promise<ListUsersResponse>;
  public revokeUserRights!: (params: RevokeUserRightsParams) => Promise<RevokeUserRightsResponse>;
  public updateUserIdentityProvider!: (params: UpdateUserIdentityProviderParams) => Promise<UpdateUserIdentityProviderResponse>;
  public updateUser!: (params: UpdateUserParams) => Promise<UpdateUserResponse>;
  public getVersion!: (params: void) => Promise<GetLedgerApiVersionResponse>;
  // AUTO-GENERATED METHODS END

  constructor(clientConfig: ClientConfig) {
    super('LEDGER_JSON_API', clientConfig);

    // AUTO-GENERATED METHOD IMPLEMENTATIONS START
    this.getAuthenticatedUser = (params) => new GetAuthenticatedUser(this).execute(params);
    this.asyncSubmitReassignment = (params) => new AsyncSubmitReassignment(this).execute(params);
    this.asyncSubmit = (params) => new AsyncSubmit(this).execute(params);
    this.completions = (params) => new Completions(this).execute(params);
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
    this.interactiveSubmissionAllocateParty = (params) => new InteractiveSubmissionAllocateParty(this).execute(params);
    this.interactiveSubmissionCreateUser = (params) => new InteractiveSubmissionCreateUser(this).execute(params);
    this.interactiveSubmissionGetPreferredPackageVersion = (params) => new InteractiveSubmissionGetPreferredPackageVersion(this).execute(params);
    this.interactiveSubmissionGetPreferredPackages = (params) => new InteractiveSubmissionGetPreferredPackages(this).execute(params);
    this.interactiveSubmissionUploadDar = (params) => new InteractiveSubmissionUploadDar(this).execute(params);
    this.getPackageStatus = (params) => new GetPackageStatus(this).execute(params);
    this.listPackages = (params) => new ListPackages(this).execute(params);
    this.uploadDarFile = (params) => new UploadDarFile(this).execute(params);
    this.getParticipantId = (params) => new GetParticipantId(this).execute(params);
    this.getParties = (params) => new GetParties(this).execute(params);
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