// AUTO-GENERATED OPERATION IMPORTS START
import { GetEventsByContractId } from './operations/v2/events/events-by-contract-id';
import { GetUpdates } from './operations/v2/updates/flats';
import { GetTransactionById } from './operations/v2/updates/transaction-by-id';
import { GetTransactionByOffset } from './operations/v2/updates/transaction-by-offset';
import { GetTransactionTreeById } from './operations/v2/updates/transaction-tree-by-id';
import { GetTransactionTreeByOffset } from './operations/v2/updates/transaction-tree-by-offset';
import { GetUpdateTrees } from './operations/v2/updates/trees';
import { GetUpdateById } from './operations/v2/updates/update-by-id';
import { GetUpdateByOffset } from './operations/v2/updates/update-by-offset';
import { GetVersion } from './operations/v2/version/get-version';
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
  GetTransactionTreeByIdParams
} from './schemas/operations';
import { 
  EventsByContractIdResponse, 
  TransactionTreeByOffsetResponse,
  GetUpdatesResponse,
  GetUpdateTreesResponse,
  GetTransactionResponse,
  GetUpdateResponse,
  GetTransactionTreeResponse,
  GetLedgerApiVersionResponse
} from './schemas/api';

/** Client for interacting with Canton's Ledger JSON API */
export class LedgerJsonApiClient extends BaseClient {
  // AUTO-GENERATED METHODS START
  public getEventsByContractId!: (params: GetEventsByContractIdParams) => Promise<EventsByContractIdResponse>;
  public getUpdates!: (params: GetUpdatesParams) => Promise<GetUpdatesResponse>;
  public getTransactionById!: (params: GetTransactionByIdParams) => Promise<GetTransactionResponse>;
  public getTransactionByOffset!: (params: GetTransactionByOffsetParams) => Promise<GetTransactionResponse>;
  public getTransactionTreeById!: (params: GetTransactionTreeByIdParams) => Promise<GetTransactionTreeResponse>;
  public getTransactionTreeByOffset!: (params: GetTransactionTreeByOffsetParams) => Promise<TransactionTreeByOffsetResponse>;
  public getUpdateTrees!: (params: GetUpdateTreesParams) => Promise<GetUpdateTreesResponse>;
  public getUpdateById!: (params: GetUpdateByIdParams) => Promise<GetUpdateResponse>;
  public getUpdateByOffset!: (params: GetUpdateByOffsetParams) => Promise<GetUpdateResponse>;
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
    this.getEventsByContractId = (params) => new GetEventsByContractId(this).execute(params);
    this.getUpdates = (params) => new GetUpdates(this).execute(params);
    this.getTransactionById = (params) => new GetTransactionById(this).execute(params);
    this.getTransactionByOffset = (params) => new GetTransactionByOffset(this).execute(params);
    this.getTransactionTreeById = (params) => new GetTransactionTreeById(this).execute(params);
    this.getTransactionTreeByOffset = (params) => new GetTransactionTreeByOffset(this).execute(params);
    this.getUpdateTrees = (params) => new GetUpdateTrees(this).execute(params);
    this.getUpdateById = (params) => new GetUpdateById(this).execute(params);
    this.getUpdateByOffset = (params) => new GetUpdateByOffset(this).execute(params);
    this.getVersion = (params) => new GetVersion(this).execute(params);
    // AUTO-GENERATED METHOD IMPLEMENTATIONS END
  }
} 