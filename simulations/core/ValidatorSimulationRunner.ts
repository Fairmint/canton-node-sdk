import { ValidatorApiClient } from '../../src/clients/validator-api/ValidatorApiClient';
import { BaseSimulationRunner } from './BaseSimulationRunner';
import { ClientConfig } from '../../src/core/types';

/** Manages simulation execution, result storage, and file handling for Validator API testing */
export default class ValidatorSimulationRunner extends BaseSimulationRunner<
  ValidatorApiClient,
  ClientConfig
> {
  constructor() {
    super(
      'VALIDATOR_API',
      (config: ClientConfig) => new ValidatorApiClient(config)
    );
  }
}
