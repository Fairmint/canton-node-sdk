import { BaseClient } from '../../core/BaseClient';
import { ClientConfig } from '../../core/types';
import { GetEventsByContractId } from './operations/getEventsByContractId';
import { GetTransactionTreeByOffset } from './operations/getTransactionTreeByOffset';
import { GetEventsByContractIdParams } from './schemas/params';
import { EventsByContractIdResponse } from './schemas/events';
import { GetTransactionTreeByOffsetParams } from './schemas/params';
import { TransactionTreeByOffsetResponse } from './schemas/transactions';

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