import { BaseClient, ClientConfig } from '../../core';
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
import { ListPackages } from './operations/v2/packages/get';
import { UploadDarFile } from './operations/v2/packages/post';
import type { UploadDarFileParams } from './operations/v2/packages/post';
import type { UploadDarFileResponse } from './schemas/api';


// Import types from individual operation files
import type { AsyncSubmitReassignmentParams } from './operations/v2/commands/async/submit-reassignment';
import type { AsyncSubmitReassignmentResponse } from './operations/v2/commands/async/submit-reassignment';
import type { AsyncSubmitParams } from './operations/v2/commands/async/submit';
import type { AsyncSubmitResponse } from './operations/v2/commands/async/submit';
import type { CompletionsParams } from './operations/v2/commands/completions';
import type { CompletionsResponse } from './operations/v2/commands/completions';
import type { SubmitAndWaitForTransactionTreeParams } from './operations/v2/commands/submit-and-wait-for-transaction-tree';
import type { SubmitAndWaitForTransactionTreeResponse } from './operations/v2/commands/submit-and-wait-for-transaction-tree';
import type { SubmitAndWaitForTransactionParams } from './operations/v2/commands/submit-and-wait-for-transaction';
import type { SubmitAndWaitForTransactionResponse } from './operations/v2/commands/submit-and-wait-for-transaction';
import type { SubmitAndWaitParams } from './operations/v2/commands/submit-and-wait';
import type { SubmitAndWaitResponse } from './operations/v2/commands/submit-and-wait';
import type { EventsByContractIdParams } from './operations/v2/events/get-events-by-contract-id';
import type { EventsByContractIdResponse } from './operations/v2/events/get-events-by-contract-id';
import type { GetPackageStatusParams } from './operations/v2/packages/get-package-status';
import type { UploadDarFileParams } from './operations/v2/packages/post';
import type { GetParticipantIdParams } from './operations/v2/parties/get-participant-id';
import type { GetParticipantIdResponse } from './operations/v2/parties/get-participant-id';
import type { GetPartiesParams } from './operations/v2/parties/get';
import type { GetPartiesResponse } from './operations/v2/parties/get';
import type { AllocatePartyParams } from './operations/v2/parties/post';
import type { UpdatePartyDetailsParams } from './operations/v2/parties/update-party-details';
import type { UpdatePartyDetailsResponse } from './operations/v2/parties/update-party-details';
import type { GetActiveContractsResponse } from './operations/v2/state/get-active-contracts';
import type { GetActiveContractsCustomParams } from './operations/v2/state/get-active-contracts';
import type { GetConnectedSynchronizersParams } from './operations/v2/state/get-connected-synchronizers';
import type { GetConnectedSynchronizersResponse } from './operations/v2/state/get-connected-synchronizers';
import type { GetLatestPrunedOffsetsParams } from './operations/v2/state/get-latest-pruned-offsets';
import type { GetLatestPrunedOffsetsResponse } from './operations/v2/state/get-latest-pruned-offsets';
import type { GetLedgerEndParams } from './operations/v2/state/get-ledger-end';
import type { GetLedgerEndResponse } from './operations/v2/state/get-ledger-end';
import type { GetTransactionByIdParams } from './operations/v2/updates/get-transaction-by-id';
import type { GetTransactionByIdResponse } from './operations/v2/updates/get-transaction-by-id';
import type { GetTransactionByOffsetParams } from './operations/v2/updates/get-transaction-by-offset';
import type { GetTransactionByOffsetResponse } from './operations/v2/updates/get-transaction-by-offset';
import type { GetTransactionTreeByIdParams } from './operations/v2/updates/get-transaction-tree-by-id';
import type { GetTransactionTreeByIdResponse } from './operations/v2/updates/get-transaction-tree-by-id';
import type { GetTransactionTreeByOffsetParams } from './operations/v2/updates/get-transaction-tree-by-offset';
import type { GetTransactionTreeByOffsetResponse } from './operations/v2/updates/get-transaction-tree-by-offset';
import type { GetUpdateByIdParams } from './operations/v2/updates/get-update-by-id';
import type { GetUpdateByIdResponse } from './operations/v2/updates/get-update-by-id';
import type { GetUpdateByOffsetParams } from './operations/v2/updates/get-update-by-offset';
import type { GetUpdateByOffsetResponse } from './operations/v2/updates/get-update-by-offset';
import type { CreateUserParams } from './operations/v2/users/create-user';
import type { CreateUserResponse } from './operations/v2/users/create-user';
import type { DeleteUserParams } from './operations/v2/users/delete-user';
import type { DeleteUserResponse } from './operations/v2/users/delete-user';
import type { GetUserParams } from './operations/v2/users/get-user';
import type { GetUserResponse } from './operations/v2/users/get-user';
import type { GrantUserRightsParams } from './operations/v2/users/grant-user-rights';
import type { GrantUserRightsResponse } from './operations/v2/users/grant-user-rights';
import type { ListUserRightsParams } from './operations/v2/users/list-user-rights';
import type { ListUserRightsResponse } from './operations/v2/users/list-user-rights';
import type { ListUsersParams } from './operations/v2/users/list-users';
import type { ListUsersResponse } from './operations/v2/users/list-users';
import type { RevokeUserRightsParams } from './operations/v2/users/revoke-user-rights';
import type { RevokeUserRightsResponse } from './operations/v2/users/revoke-user-rights';
import type { UpdateUserIdentityProviderParams } from './operations/v2/users/update-user-identity-provider';
import type { UpdateUserIdentityProviderResponse } from './operations/v2/users/update-user-identity-provider';
import type { UpdateUserParams } from './operations/v2/users/update-user';
import type { UpdateUserResponse } from './operations/v2/users/update-user';
import { CreateIdentityProviderConfigParams, DeleteIdentityProviderConfigParams, GetAuthenticatedUserParams, GetIdentityProviderConfigParams, GetUpdateTreesParams, GetUpdatesParams, InteractiveSubmissionAllocatePartyParams, InteractiveSubmissionCreateUserParams, InteractiveSubmissionGetPreferredPackageVersionParams, InteractiveSubmissionGetPreferredPackagesParams, InteractiveSubmissionUploadDarParams, ListIdentityProviderConfigsParams, SubmitAndWaitForReassignmentParams, UpdateIdentityProviderConfigParams } from './schemas/operations';
import { AllocatePartyResponse, CreateIdentityProviderConfigResponse, DeleteIdentityProviderConfigResponse, GetIdentityProviderConfigResponse, GetLedgerApiVersionResponse, GetPackageStatusResponse, GetPreferredPackageVersionResponse, GetPreferredPackagesResponse, GetUpdateTreesResponse, GetUpdatesResponse, GetUserResponse, InteractiveSubmissionAllocatePartyResponse, InteractiveSubmissionCreateUserResponse, InteractiveSubmissionUploadDarResponse, JsSubmitAndWaitForReassignmentResponse, ListIdentityProviderConfigsResponse, ListPackagesResponse, UpdateIdentityProviderConfigResponse, UploadDarFileResponse } from './schemas/api';

/** Client for interacting with Canton's Ledger JSON API */
export class LedgerJsonApiClient extends BaseClient {
  // Commands
  public asyncSubmitReassignment!: (params: AsyncSubmitReassignmentParams) => Promise<AsyncSubmitReassignmentResponse>;
  public asyncSubmit!: (params: AsyncSubmitParams) => Promise<AsyncSubmitResponse>;
  public completions!: (params: CompletionsParams) => Promise<CompletionsResponse>;
  public submitAndWaitForReassignment!: (params: SubmitAndWaitForReassignmentParams) => Promise<JsSubmitAndWaitForReassignmentResponse>;
  public submitAndWaitForTransactionTree!: (params: SubmitAndWaitForTransactionTreeParams) => Promise<SubmitAndWaitForTransactionTreeResponse>;
  public submitAndWaitForTransaction!: (params: SubmitAndWaitForTransactionParams) => Promise<SubmitAndWaitForTransactionResponse>;
  public submitAndWait!: (params: SubmitAndWaitParams) => Promise<SubmitAndWaitResponse>;

  // Events
  public getEventsByContractId!: (params: EventsByContractIdParams) => Promise<EventsByContractIdResponse>;

  // Updates
  public getUpdates!: (params: GetUpdatesParams) => Promise<GetUpdatesResponse>;
  public getTransactionById!: (params: GetTransactionByIdParams) => Promise<GetTransactionByIdResponse>;
  public getTransactionByOffset!: (params: GetTransactionByOffsetParams) => Promise<GetTransactionByOffsetResponse>;
  public getTransactionTreeById!: (params: GetTransactionTreeByIdParams) => Promise<GetTransactionTreeByIdResponse>;
  public getTransactionTreeByOffset!: (params: GetTransactionTreeByOffsetParams) => Promise<GetTransactionTreeByOffsetResponse>;
  public getUpdateTrees!: (params: GetUpdateTreesParams) => Promise<GetUpdateTreesResponse>;
  public getUpdateById!: (params: GetUpdateByIdParams) => Promise<GetUpdateByIdResponse>;
  public getUpdateByOffset!: (params: GetUpdateByOffsetParams) => Promise<GetUpdateByOffsetResponse>;

  // State
  public getActiveContracts!: (params: GetActiveContractsCustomParams) => Promise<GetActiveContractsResponse>;
  public getConnectedSynchronizers!: (params: GetConnectedSynchronizersParams) => Promise<GetConnectedSynchronizersResponse>;
  public getLatestPrunedOffsets!: (params: GetLatestPrunedOffsetsParams) => Promise<GetLatestPrunedOffsetsResponse>;
  public getLedgerEnd!: (params: GetLedgerEndParams) => Promise<GetLedgerEndResponse>;

  // Users
  public createUser!: (params: CreateUserParams) => Promise<CreateUserResponse>;
  public deleteUser!: (params: DeleteUserParams) => Promise<DeleteUserResponse>;
  public getUser!: (params: GetUserParams) => Promise<GetUserResponse>;
  public grantUserRights!: (params: GrantUserRightsParams) => Promise<GrantUserRightsResponse>;
  public listUserRights!: (params: ListUserRightsParams) => Promise<ListUserRightsResponse>;
  public listUsers!: (params: ListUsersParams) => Promise<ListUsersResponse>;
  public revokeUserRights!: (params: RevokeUserRightsParams) => Promise<RevokeUserRightsResponse>;
  public updateUserIdentityProvider!: (params: UpdateUserIdentityProviderParams) => Promise<UpdateUserIdentityProviderResponse>;
  public updateUser!: (params: UpdateUserParams) => Promise<UpdateUserResponse>;

  // Parties
  public getParticipantId!: (params: GetParticipantIdParams) => Promise<GetParticipantIdResponse>;
  public getParties!: (params: GetPartiesParams) => Promise<GetPartiesResponse>;
  public allocateParty!: (params: AllocatePartyParams) => Promise<AllocatePartyResponse>;
  public updatePartyDetails!: (params: UpdatePartyDetailsParams) => Promise<UpdatePartyDetailsResponse>;

  /**
   * List all packages uploaded on the participant node
   * @description List all packages uploaded on the participant node
   * @returns The list of package IDs available on the participant node.
   * @example
   * ```typescript
   * const packages = await client.listPackages();
   * console.log(`Available packages: ${packages.packageIds.join(', ')}`);
   * ```
   */
  public listPackages!: () => Promise<import('../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi').paths['/v2/packages']['get']['responses']['200']['content']['application/json']>;

  /**
   * Upload a DAR file to the participant node
   * @description Upload a DAR file to the participant node
   * @returns The upload result.
   * @example
   * ```typescript
   * const result = await client.uploadDarFile({
   *   darFile: fs.readFileSync('my-package.dar'),
   *   submissionId: 'unique-submission-id'
   * });
   * ```
   */
  public uploadDarFile!: (params: UploadDarFileParams) => Promise<UploadDarFileResponse>;

  /**
   * Get the version details of the participant node
   * @description Get the version details of the participant node
   * @returns The version information of the participant node.
   * @example
   * ```typescript
   * const version = await client.getVersion();
   * console.log(`Participant version: ${version.version}`);
   * ```
   */
  public getVersion!: () => Promise<import('../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi').paths['/v2/version']['get']['responses']['200']['content']['application/json']>;

  // Interactive Submission
  public interactiveSubmissionAllocateParty!: (params: InteractiveSubmissionAllocatePartyParams) => Promise<InteractiveSubmissionAllocatePartyResponse>;
  public interactiveSubmissionCreateUser!: (params: InteractiveSubmissionCreateUserParams) => Promise<InteractiveSubmissionCreateUserResponse>;
  public interactiveSubmissionGetPreferredPackageVersion!: (params: InteractiveSubmissionGetPreferredPackageVersionParams) => Promise<GetPreferredPackageVersionResponse>;
  public interactiveSubmissionGetPreferredPackages!: (params: InteractiveSubmissionGetPreferredPackagesParams) => Promise<GetPreferredPackagesResponse>;
  public interactiveSubmissionUploadDar!: (params: InteractiveSubmissionUploadDarParams) => Promise<InteractiveSubmissionUploadDarResponse>;

  constructor(clientConfig: ClientConfig) {
    super('LEDGER_JSON_API', clientConfig);
    
    // Commands
    this.asyncSubmitReassignment = (params) => new AsyncSubmitReassignment(this).execute(params);
    this.asyncSubmit = (params) => new AsyncSubmit(this).execute(params);
    this.completions = (params) => new Completions(this).execute(params);
    this.submitAndWaitForReassignment = (params) => new SubmitAndWaitForReassignment(this).execute(params);
    this.submitAndWaitForTransactionTree = (params) => new SubmitAndWaitForTransactionTree(this).execute(params);
    this.submitAndWaitForTransaction = (params) => new SubmitAndWaitForTransaction(this).execute(params);
    this.submitAndWait = (params) => new SubmitAndWait(this).execute(params);

    // Events
    this.getEventsByContractId = (params) => new GetEventsByContractId(this).execute(params);

    // Updates
    this.getUpdates = (params) => new GetUpdates(this).execute(params);
    this.getTransactionById = (params) => new GetTransactionById(this).execute(params);
    this.getTransactionByOffset = (params) => new GetTransactionByOffset(this).execute(params);
    this.getTransactionTreeById = (params) => new GetTransactionTreeById(this).execute(params);
    this.getTransactionTreeByOffset = (params) => new GetTransactionTreeByOffset(this).execute(params);
    this.getUpdateTrees = (params) => new GetUpdateTrees(this).execute(params);
    this.getUpdateById = (params) => new GetUpdateById(this).execute(params);
    this.getUpdateByOffset = (params) => new GetUpdateByOffset(this).execute(params);

    // State
    this.getActiveContracts = (params) => new GetActiveContracts(this).execute(params);
    this.getConnectedSynchronizers = (params) => new GetConnectedSynchronizers(this).execute(params);
    this.getLatestPrunedOffsets = (params) => new GetLatestPrunedOffsets(this).execute(params);
    this.getLedgerEnd = (params) => new GetLedgerEnd(this).execute(params);

    // Users
    this.createUser = (params) => new CreateUser(this).execute(params);
    this.deleteUser = (params) => new DeleteUser(this).execute(params);
    this.getUser = (params) => new GetUser(this).execute(params);
    this.grantUserRights = (params) => new GrantUserRights(this).execute(params);
    this.listUserRights = (params) => new ListUserRights(this).execute(params);
    this.listUsers = (params) => new ListUsers(this).execute(params);
    this.revokeUserRights = (params) => new RevokeUserRights(this).execute(params);
    this.updateUserIdentityProvider = (params) => new UpdateUserIdentityProvider(this).execute(params);
    this.updateUser = (params) => new UpdateUser(this).execute(params);

    // Parties
    this.getParticipantId = (params) => new GetParticipantId(this).execute(params);
    this.getParties = (params) => new GetParties(this).execute(params);
    this.allocateParty = (params) => new AllocateParty(this).execute(params);
    this.updatePartyDetails = (params) => new UpdatePartyDetails(this).execute(params);

    this.listPackages = () => new ListPackages(this).execute();
    this.uploadDarFile = (params) => new UploadDarFile(this).execute(params);
    this.getVersion = () => new (require('./operations/v2/version/get').GetVersion)(this).execute();

    // Interactive Submission
    this.interactiveSubmissionAllocateParty = (params) => new InteractiveSubmissionAllocateParty(this).execute(params);
    this.interactiveSubmissionCreateUser = (params) => new InteractiveSubmissionCreateUser(this).execute(params);
    this.interactiveSubmissionGetPreferredPackageVersion = (params) => new InteractiveSubmissionGetPreferredPackageVersion(this).execute(params);
    this.interactiveSubmissionGetPreferredPackages = (params) => new InteractiveSubmissionGetPreferredPackages(this).execute(params);
    this.interactiveSubmissionUploadDar = (params) => new InteractiveSubmissionUploadDar(this).execute(params);
  }
}