import { BaseClient, ClientConfig } from '../../core';
import { AsyncSubmit } from './operations/v2/commands/async/submit';
import { AsyncSubmitReassignment } from './operations/v2/commands/async/submit-reassignment';
import { Completions } from './operations/v2/commands/completions';
import { SubmitAndWait } from './operations/v2/commands/submit-and-wait';
import { SubmitAndWaitForTransaction } from './operations/v2/commands/submit-and-wait-for-transaction';
import { SubmitAndWaitForTransactionTree } from './operations/v2/commands/submit-and-wait-for-transaction-tree';
import { GetEventsByContractId } from './operations/v2/events/get-events-by-contract-id';
import { GetTransactionByOffset } from './operations/v2/updates/get-transaction-by-offset';
import { GetTransactionTreeByOffset } from './operations/v2/updates/get-transaction-tree-by-offset';
import { GetUpdateByOffset } from './operations/v2/updates/get-update-by-offset';
import { GetUpdateById } from './operations/v2/updates/get-update-by-id';
import { GetTransactionById } from './operations/v2/updates/get-transaction-by-id';
import { GetTransactionTreeById } from './operations/v2/updates/get-transaction-tree-by-id';
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
import { InteractiveSubmissionAllocateParty } from './operations/v2/interactive-submission/allocate-party';
import { InteractiveSubmissionCreateUser } from './operations/v2/interactive-submission/create-user';
import { InteractiveSubmissionUploadDar } from './operations/v2/interactive-submission/upload-dar';
import { InteractiveSubmissionGetPreferredPackageVersion } from './operations/v2/interactive-submission/get-preferred-package-version';
import { InteractiveSubmissionGetPreferredPackages } from './operations/v2/interactive-submission/get-preferred-packages';
import { GetParties } from './operations/v2/parties/get';
import { GetParticipantId } from './operations/v2/parties/get-participant-id';
import { GetPartyDetails } from './operations/v2/parties/get-party-details';
import { AllocateParty } from './operations/v2/parties/post';
import { UpdatePartyDetails } from './operations/v2/parties/update-party-details';

// Import types from individual operation files
import type { AsyncSubmitParams, AsyncSubmitResponse } from './operations/v2/commands/async/submit';
import type { AsyncSubmitReassignmentParams, AsyncSubmitReassignmentResponse } from './operations/v2/commands/async/submit-reassignment';
import type { CompletionsParams, CompletionsResponse } from './operations/v2/commands/completions';
import type { SubmitAndWaitParams } from './operations/v2/commands/submit-and-wait';
import type { SubmitAndWaitForTransactionParams, SubmitAndWaitForTransactionResponse } from './operations/v2/commands/submit-and-wait-for-transaction';
import type { SubmitAndWaitForTransactionTreeParams, SubmitAndWaitForTransactionTreeResponse } from './operations/v2/commands/submit-and-wait-for-transaction-tree';
import type { EventsByContractIdParams, EventsByContractIdResponse } from './operations/v2/events/get-events-by-contract-id';
import type { GetTransactionByOffsetParams, GetTransactionByOffsetResponse } from './operations/v2/updates/get-transaction-by-offset';
import type { GetTransactionTreeByOffsetParams, GetTransactionTreeByOffsetResponse } from './operations/v2/updates/get-transaction-tree-by-offset';
import type { GetUpdateByOffsetParams, GetUpdateByOffsetResponse } from './operations/v2/updates/get-update-by-offset';
import type { GetUpdateByIdParams, GetUpdateByIdResponse } from './operations/v2/updates/get-update-by-id';
import type { GetTransactionByIdParams, GetTransactionByIdResponse } from './operations/v2/updates/get-transaction-by-id';
import type { GetTransactionTreeByIdParams, GetTransactionTreeByIdResponse } from './operations/v2/updates/get-transaction-tree-by-id';
import type { CreateUserParams } from './operations/v2/users/create-user';
import type { DeleteUserParams, DeleteUserResponse } from './operations/v2/users/delete-user';
import type { GetUserParams, GetUserResponse } from './operations/v2/users/get-user';
import type { GrantUserRightsParams, GrantUserRightsResponse } from './operations/v2/users/grant-user-rights';
import type { ListUserRightsParams, ListUserRightsResponse } from './operations/v2/users/list-user-rights';
import type { ListUsersParams, ListUsersResponse } from './operations/v2/users/list-users';
import type { RevokeUserRightsParams, RevokeUserRightsResponse } from './operations/v2/users/revoke-user-rights';
import type { UpdateUserIdentityProviderParams, UpdateUserIdentityProviderResponse } from './operations/v2/users/update-user-identity-provider';
import type { UpdateUserParams, UpdateUserResponse } from './operations/v2/users/update-user';
import type { InteractiveSubmissionAllocatePartyParams } from './schemas/operations';
import type { InteractiveSubmissionCreateUserParams } from './schemas/operations';
import type { InteractiveSubmissionUploadDarParams } from './schemas/operations';
import type { InteractiveSubmissionGetPreferredPackageVersionParams } from './schemas/operations';
import type { InteractiveSubmissionGetPreferredPackagesParams } from './schemas/operations';
import type { InteractiveSubmissionAllocatePartyResponse, InteractiveSubmissionCreateUserResponse, InteractiveSubmissionUploadDarResponse } from './schemas/api';
import type { GetPreferredPackageVersionResponse, GetPreferredPackagesResponse } from './schemas/api';
import type { GetPartiesParams, GetPartiesResponse } from './operations/v2/parties/get';
import type { GetParticipantIdParams, GetParticipantIdResponse } from './operations/v2/parties/get-participant-id';
import type { GetPartyDetailsParams } from './schemas/operations';
import type { AllocatePartyParams } from './operations/v2/parties/post';
import type { AllocatePartyResponse, UpdatePartyDetailsResponse } from './schemas/api';
import type { UpdatePartyDetailsParams } from './operations/v2/parties/update-party-details';

/** Client for interacting with Canton's Ledger JSON API */
export class LedgerJsonApiClient extends BaseClient {
  // Commands
  public asyncSubmit!: (params: AsyncSubmitParams) => Promise<AsyncSubmitResponse>;
  public asyncSubmitReassignment!: (params: AsyncSubmitReassignmentParams) => Promise<AsyncSubmitReassignmentResponse>;
  public completions!: (params: CompletionsParams) => Promise<CompletionsResponse>;
  public submitAndWait!: (params: SubmitAndWaitParams) => Promise<any>;
  public submitAndWaitForTransactionTree!: (params: SubmitAndWaitForTransactionTreeParams) => Promise<SubmitAndWaitForTransactionTreeResponse>;
  public submitAndWaitForTransaction!: (params: SubmitAndWaitForTransactionParams) => Promise<SubmitAndWaitForTransactionResponse>;

  // Events
  public getEventsByContractId!: (params: EventsByContractIdParams) => Promise<EventsByContractIdResponse>;

  // Updates
  public getTransactionByOffset!: (params: GetTransactionByOffsetParams) => Promise<GetTransactionByOffsetResponse>;
  public getTransactionTreeByOffset!: (params: GetTransactionTreeByOffsetParams) => Promise<GetTransactionTreeByOffsetResponse>;
  public getUpdateByOffset!: (params: GetUpdateByOffsetParams) => Promise<GetUpdateByOffsetResponse>;
  public getUpdateById!: (params: GetUpdateByIdParams) => Promise<GetUpdateByIdResponse>;
  public getTransactionById!: (params: GetTransactionByIdParams) => Promise<GetTransactionByIdResponse>;
  public getTransactionTreeById!: (params: GetTransactionTreeByIdParams) => Promise<GetTransactionTreeByIdResponse>;

  // Users
  public createUser!: (params: CreateUserParams) => Promise<any>;
  public deleteUser!: (params: DeleteUserParams) => Promise<DeleteUserResponse>;
  public getUser!: (params: GetUserParams) => Promise<GetUserResponse>;
  public grantUserRights!: (params: GrantUserRightsParams) => Promise<GrantUserRightsResponse>;
  public listUserRights!: (params: ListUserRightsParams) => Promise<ListUserRightsResponse>;
  public listUsers!: (params: ListUsersParams) => Promise<ListUsersResponse>;
  public revokeUserRights!: (params: RevokeUserRightsParams) => Promise<RevokeUserRightsResponse>;
  public updateUserIdentityProvider!: (params: UpdateUserIdentityProviderParams) => Promise<UpdateUserIdentityProviderResponse>;
  public updateUser!: (params: UpdateUserParams) => Promise<UpdateUserResponse>;

  // Parties
  public getParties!: (params: GetPartiesParams) => Promise<import('../../generated/openapi-types').paths['/v2/parties']['get']['responses']['200']['content']['application/json']>;
  public getParticipantId!: (params: GetParticipantIdParams) => Promise<GetParticipantIdResponse>;
  public getPartyDetails!: (params: GetPartyDetailsParams) => Promise<import('../../generated/openapi-types').paths['/v2/parties/{party}']['get']['responses']['200']['content']['application/json']>;
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
  public listPackages!: () => Promise<import('../../generated/openapi-types').paths['/v2/packages']['get']['responses']['200']['content']['application/json']>;

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
  public getVersion!: () => Promise<import('../../generated/openapi-types').paths['/v2/version']['get']['responses']['200']['content']['application/json']>;

  // Interactive Submission
  public interactiveSubmissionAllocateParty!: (params: InteractiveSubmissionAllocatePartyParams) => Promise<InteractiveSubmissionAllocatePartyResponse>;
  public interactiveSubmissionCreateUser!: (params: InteractiveSubmissionCreateUserParams) => Promise<InteractiveSubmissionCreateUserResponse>;
  public interactiveSubmissionUploadDar!: (params: InteractiveSubmissionUploadDarParams) => Promise<InteractiveSubmissionUploadDarResponse>;
  public interactiveSubmissionGetPreferredPackageVersion!: (params: InteractiveSubmissionGetPreferredPackageVersionParams) => Promise<GetPreferredPackageVersionResponse>;
  public interactiveSubmissionGetPreferredPackages!: (params: InteractiveSubmissionGetPreferredPackagesParams) => Promise<GetPreferredPackagesResponse>;

  constructor(clientConfig: ClientConfig) {
    super('LEDGER_JSON_API', clientConfig);
    
    // Commands
    this.asyncSubmit = (params) => new AsyncSubmit(this).execute(params);
    this.asyncSubmitReassignment = (params) => new AsyncSubmitReassignment(this).execute(params);
    this.completions = (params) => new Completions(this).execute(params);
    this.submitAndWait = (params) => new SubmitAndWait(this).execute(params);
    this.submitAndWaitForTransactionTree = (params) => new SubmitAndWaitForTransactionTree(this).execute(params);
    this.submitAndWaitForTransaction = (params) => new SubmitAndWaitForTransaction(this).execute(params);

    // Events
    this.getEventsByContractId = (params) => new GetEventsByContractId(this).execute(params);

    // Updates
    this.getTransactionByOffset = (params) => new GetTransactionByOffset(this).execute(params);
    this.getTransactionTreeByOffset = (params) => new GetTransactionTreeByOffset(this).execute(params);
    this.getUpdateByOffset = (params) => new GetUpdateByOffset(this).execute(params);
    this.getUpdateById = (params) => new GetUpdateById(this).execute(params);
    this.getTransactionById = (params) => new GetTransactionById(this).execute(params);
    this.getTransactionTreeById = (params) => new GetTransactionTreeById(this).execute(params);

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
    this.getParties = (params) => new GetParties(this).execute(params);
    this.getParticipantId = (params) => new GetParticipantId(this).execute(params);
    this.getPartyDetails = (params) => new GetPartyDetails(this).execute(params);
    this.allocateParty = (params) => new AllocateParty(this).execute(params);
    this.updatePartyDetails = (params) => new UpdatePartyDetails(this).execute(params);
    this.listPackages = () => new ListPackages(this).execute();
    this.getVersion = () => new (require('./operations/v2/version/get').GetVersion)(this).execute();

    // Interactive Submission
    this.interactiveSubmissionAllocateParty = (params) => new InteractiveSubmissionAllocateParty(this).execute(params);
    this.interactiveSubmissionCreateUser = (params) => new InteractiveSubmissionCreateUser(this).execute(params);
    this.interactiveSubmissionUploadDar = (params) => new InteractiveSubmissionUploadDar(this).execute(params);
    this.interactiveSubmissionGetPreferredPackageVersion = (params) => new InteractiveSubmissionGetPreferredPackageVersion(this).execute(params);
    this.interactiveSubmissionGetPreferredPackages = (params) => new InteractiveSubmissionGetPreferredPackages(this).execute(params);
  }
} 