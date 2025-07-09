// AUTO-GENERATED OPERATION IMPORTS START
import { GetEventsByContractId } from './operations/v2/events/events-by-contract-id';
import { GetTransactionTreeByOffset } from './operations/v2/updates/transaction-tree-by-offset';
// AUTO-GENERATED OPERATION IMPORTS END
import { BaseClient, ClientConfig } from '../../core';
import { GetEventsByContractIdParams, EventsByContractIdResponse, GetTransactionTreeByOffsetParams, TransactionTreeByOffsetResponse } from './schemas';

/** Client for interacting with Canton's Ledger JSON API */
export class LedgerJsonApiClient extends BaseClient {
  // AUTO-GENERATED METHODS START
  public getEventsByContractId!: (params: GetEventsByContractIdParams) => Promise<EventsByContractIdResponse>;
  public getTransactionTreeByOffset!: (params: GetTransactionTreeByOffsetParams) => Promise<TransactionTreeByOffsetResponse>;
  // AUTO-GENERATED METHODS END

  constructor(clientConfig?: Partial<ClientConfig>) {
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
    this.getTransactionTreeByOffset = (params) => new GetTransactionTreeByOffset(this).execute(params);
    // AUTO-GENERATED METHOD IMPLEMENTATIONS END
  }
} 