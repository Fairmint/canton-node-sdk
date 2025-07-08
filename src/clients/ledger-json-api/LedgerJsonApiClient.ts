import {
  AbstractClient,
  ProviderConfig,
  NetworkType,
  ProviderType,
} from '../base';
import { GetEventsByContractId } from './getEventsByContractId';
import { GetTransactionTreeByOffset } from './getTransactionTreeByOffset';

export class LedgerJsonApiClient extends AbstractClient {
  public readonly getEventsByContractId: GetEventsByContractId;
  public readonly getTransactionTreeByOffset: GetTransactionTreeByOffset;

  constructor(
    config: ProviderConfig,
    network?: NetworkType,
    providerType?: ProviderType
  ) {
    super(config, 'JSON_API', network, providerType);

    this.getEventsByContractId = new GetEventsByContractId(this);
    this.getTransactionTreeByOffset = new GetTransactionTreeByOffset(this);
  }
}
