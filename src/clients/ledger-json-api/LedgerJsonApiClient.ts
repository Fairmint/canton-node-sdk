import { BaseClient, ClientConfig } from '../../core';
import { GetEventsByContractId, GetTransactionTreeByOffset } from './operations';
import { GetEventsByContractIdParams, EventsByContractIdResponse, GetTransactionTreeByOffsetParams, TransactionTreeByOffsetResponse } from './schemas';

/** Client for interacting with Canton's Ledger JSON API */
export class LedgerJsonApiClient extends BaseClient {
  public readonly getEventsByContractId: (params: GetEventsByContractIdParams) => Promise<EventsByContractIdResponse>;
  public readonly getTransactionTreeByOffset: (params: GetTransactionTreeByOffsetParams) => Promise<TransactionTreeByOffsetResponse>;

  constructor(clientConfig?: Partial<ClientConfig>) {
    super('LEDGER_JSON_API', clientConfig);

    this.getEventsByContractId = (params) => new GetEventsByContractId(this).execute(params);
    this.getTransactionTreeByOffset = (params) => new GetTransactionTreeByOffset(this).execute(params);
  }
} 