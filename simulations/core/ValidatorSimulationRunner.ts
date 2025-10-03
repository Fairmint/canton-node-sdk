import { ValidatorApiClient } from '../../src/clients/validator-api';
import { type ClientConfig } from '../../src/core/types';
import { BaseSimulationRunner } from './BaseSimulationRunner';

/** Manages simulation execution, result storage, and file handling for Validator API testing */
export default class ValidatorSimulationRunner extends BaseSimulationRunner<ValidatorApiClient, ClientConfig> {
  constructor() {
    super('VALIDATOR_API', (config: ClientConfig) => new ValidatorApiClient(config));
  }
}
