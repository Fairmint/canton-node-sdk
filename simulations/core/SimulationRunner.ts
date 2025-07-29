import { BaseSimulationRunner } from './BaseSimulationRunner';
import { ClientConfig } from '../../src/core/types';
import { LedgerJsonApiClient } from '../../src/clients/ledger-json-api';

/** Manages simulation execution, result storage, and file handling for API testing */
export default class SimulationRunner extends BaseSimulationRunner<
  LedgerJsonApiClient,
  ClientConfig
> {
  constructor() {
    super(
      'LEDGER_JSON_API',
      (config: ClientConfig) => new LedgerJsonApiClient(config)
    );
  }
}
