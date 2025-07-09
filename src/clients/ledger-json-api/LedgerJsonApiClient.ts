import { BaseClient } from '../../core/BaseClient';
import { ClientConfig } from '../../core/types';
import { GetEventsByContractId } from './operations/getEventsByContractId';
import { GetTransactionTreeByOffset } from './operations/getTransactionTreeByOffset';

/** Client for interacting with Canton's Ledger JSON API */
export class LedgerJsonApiClient extends BaseClient {
  public readonly getEventsByContractId: InstanceType<typeof GetEventsByContractId>;
  public readonly getTransactionTreeByOffset: InstanceType<typeof GetTransactionTreeByOffset>;

  constructor(clientConfig?: Partial<ClientConfig>) {
    super('LEDGER_JSON_API', clientConfig);

    this.getEventsByContractId = new GetEventsByContractId(this);
    this.getTransactionTreeByOffset = new GetTransactionTreeByOffset(this);
  }
} 