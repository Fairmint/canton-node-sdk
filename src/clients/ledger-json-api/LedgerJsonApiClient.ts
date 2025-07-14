// AUTO-GENERATED OPERATION IMPORTS START
import { GetAuthenticatedUser } from './operations/v2/authenticated-user/get';
import { GetEventsByContractId } from './operations/v2/events/get-events-by-contract-id';
import { GetPackageStatus } from './operations/v2/packages/get-package-status';
import { GetPreferredPackageVersion } from './operations/v2/packages/get-preferred-package-version';
import { GetPreferredPackages } from './operations/v2/packages/get-preferred-packages';
import { ListPackages } from './operations/v2/packages/get';
import { UploadDarFile } from './operations/v2/packages/post';
import { GetUpdates } from './operations/v2/updates/get-flats';
import { GetTransactionById } from './operations/v2/updates/get-transaction-by-id';
import { GetTransactionByOffset } from './operations/v2/updates/get-transaction-by-offset';
import { GetTransactionTreeById } from './operations/v2/updates/get-transaction-tree-by-id';
import { GetTransactionTreeByOffset } from './operations/v2/updates/get-transaction-tree-by-offset';
import { GetUpdateTrees } from './operations/v2/updates/get-trees';
import { GetUpdateById } from './operations/v2/updates/get-update-by-id';
import { GetUpdateByOffset } from './operations/v2/updates/get-update-by-offset';
import { CreateUser } from './operations/v2/users/create-user';
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
import { 
  GetEventsByContractIdParams, 
  GetTransactionTreeByOffsetParams,
  GetUpdatesParams,
  GetUpdateTreesParams,
  GetTransactionByOffsetParams,
  GetUpdateByOffsetParams,
  GetTransactionByIdParams,
  GetUpdateByIdParams,
  GetTransactionTreeByIdParams,
  ListPackagesParams,
  UploadDarFileParams,
  GetPackageStatusParams,
  GetPreferredPackagesParams,
  GetPreferredPackageVersionParams,
  CreateUserParams,
  GetAuthenticatedUserParams,
  GetUserParams,
  GrantUserRightsParams,
  ListUserRightsParams,
  ListUsersParams,
  RevokeUserRightsParams,
  UpdateUserIdentityProviderParams,
  UpdateUserParams
} from './schemas/operations';
import { 
  EventsByContractIdResponse, 
  TransactionTreeByOffsetResponse,
  GetUpdatesResponse,
  GetUpdateTreesResponse,
  GetTransactionResponse,
  GetUpdateResponse,
  GetTransactionTreeResponse,
  GetLedgerApiVersionResponse,
  ListPackagesResponse,
  UploadDarFileResponse,
  GetPackageStatusResponse,
  GetPreferredPackagesResponse,
  GetPreferredPackageVersionResponse,
  CreateUserResponse,
  GetUserResponse,
  GrantUserRightsResponse,
  ListUserRightsResponse,
  ListUsersResponse,
  RevokeUserRightsResponse,
  UpdateUserIdentityProviderIdResponse,
  UpdateUserResponse
} from './schemas/api';

/** Client for interacting with Canton's Ledger JSON API */
export class LedgerJsonApiClient extends BaseClient {
  // AUTO-GENERATED METHODS START
  public getAuthenticatedUser!: (params: GetAuthenticatedUserParams) => Promise<GetUserResponse>;
  public getEventsByContractId!: (params: GetEventsByContractIdParams) => Promise<EventsByContractIdResponse>;
  public getPackageStatus!: (params: GetPackageStatusParams) => Promise<GetPackageStatusResponse>;
  public getPreferredPackageVersion!: (params: GetPreferredPackageVersionParams) => Promise<GetPreferredPackageVersionResponse>;
  public getPreferredPackages!: (params: GetPreferredPackagesParams) => Promise<GetPreferredPackagesResponse>;
  public listPackages!: (params: ListPackagesParams) => Promise<ListPackagesResponse>;
  public uploadDarFile!: (params: UploadDarFileParams) => Promise<UploadDarFileResponse>;
  public getUpdates!: (params: GetUpdatesParams) => Promise<GetUpdatesResponse>;
  public getTransactionById!: (params: GetTransactionByIdParams) => Promise<GetTransactionResponse>;
  public getTransactionByOffset!: (params: GetTransactionByOffsetParams) => Promise<GetTransactionResponse>;
  public getTransactionTreeById!: (params: GetTransactionTreeByIdParams) => Promise<GetTransactionTreeResponse>;
  public getTransactionTreeByOffset!: (params: GetTransactionTreeByOffsetParams) => Promise<TransactionTreeByOffsetResponse>;
  public getUpdateTrees!: (params: GetUpdateTreesParams) => Promise<GetUpdateTreesResponse>;
  public getUpdateById!: (params: GetUpdateByIdParams) => Promise<GetUpdateResponse>;
  public getUpdateByOffset!: (params: GetUpdateByOffsetParams) => Promise<GetUpdateResponse>;
  public createUser!: (params: CreateUserParams) => Promise<CreateUserResponse>;
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
    this.getEventsByContractId = (params) => new GetEventsByContractId(this).execute(params);
    this.getPackageStatus = (params) => new GetPackageStatus(this).execute(params);
    this.getPreferredPackageVersion = (params) => new GetPreferredPackageVersion(this).execute(params);
    this.getPreferredPackages = (params) => new GetPreferredPackages(this).execute(params);
    this.listPackages = (params) => new ListPackages(this).execute(params);
    this.uploadDarFile = (params) => new UploadDarFile(this).execute(params);
    this.getUpdates = (params) => new GetUpdates(this).execute(params);
    this.getTransactionById = (params) => new GetTransactionById(this).execute(params);
    this.getTransactionByOffset = (params) => new GetTransactionByOffset(this).execute(params);
    this.getTransactionTreeById = (params) => new GetTransactionTreeById(this).execute(params);
    this.getTransactionTreeByOffset = (params) => new GetTransactionTreeByOffset(this).execute(params);
    this.getUpdateTrees = (params) => new GetUpdateTrees(this).execute(params);
    this.getUpdateById = (params) => new GetUpdateById(this).execute(params);
    this.getUpdateByOffset = (params) => new GetUpdateByOffset(this).execute(params);
    this.createUser = (params) => new CreateUser(this).execute(params);
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