import SimulationRunner from '../../core/SimulationRunner';
import { ValidatorApiClient } from '../../../src/clients/validator-api/ValidatorApiClient';
import { FileLogger } from '../../../src/core/logging';
import { EnvLoader } from '../../../src/core';
import { transferToPreapproved } from '../../../src/utils/amulet/transfer-to-preapproved';

const runner = new SimulationRunner();

const TEST_DATA = {
  SENDER_PARTY_ID: '00000000000000000000000000000000aParty',
  TRANSFER_PREAPPROVAL_CONTRACT_ID: {
    VALID:
      '00528fab06fe8694392494a01925bae6cdb94c35c14a8bbffcebca23278521b2e4ca1112200794083bad5ae157d245234eaa24b5dff2a88b1d62caa8c70701fab4ba4f9bb0',
    INVALID_FORMAT:
      '00528fab06fe8694392494a01925bae6cdb94c35c14a8bbffcebca23278521b2e4ca1112200794083bad5ae157d245234eaa24b5dff2a88b1d62caa8c70701fab4ba4f9bbZ',
    NON_EXISTENT:
      '00528fab06fe8694392494a01925bae6cdb94c35c14a8bbffcebca23278521b2e4ca1112200794083bad5ae157d245234eaa24b5dff2a88b1d62caa8c70701fab4ba4f9bbb',
  },
  AMOUNT: '1000000',
  AMULET_VALUE: '9f412bea8b23456e9cfe1d99a7d2ba5d',
};

function createValidatorClient(): ValidatorApiClient {
  const config = {
    ...EnvLoader.getConfig('VALIDATOR_API'),
    logger: new FileLogger(),
  } as const;
  return new ValidatorApiClient(config);
}

export async function runAllTests() {
  // Valid transfer attempt (may still fail depending on network data)
  await runner.runSimulation(
    'valid',
    async ledgerClient =>
      transferToPreapproved(ledgerClient, createValidatorClient(), {
        senderPartyId: TEST_DATA.SENDER_PARTY_ID,
        transferPreapprovalContractId:
          TEST_DATA.TRANSFER_PREAPPROVAL_CONTRACT_ID.VALID,
        amount: TEST_DATA.AMOUNT,
        description: 'simulation_valid',
        inputs: [
          {
            tag: 'InputAmulet',
            value: TEST_DATA.AMULET_VALUE,
          },
        ],
      }),
  );

  // Invalid contract ID format
  await runner.runSimulation(
    'invalid_format',
    async ledgerClient =>
      transferToPreapproved(ledgerClient, createValidatorClient(), {
        senderPartyId: TEST_DATA.SENDER_PARTY_ID,
        transferPreapprovalContractId:
          TEST_DATA.TRANSFER_PREAPPROVAL_CONTRACT_ID.INVALID_FORMAT,
        amount: TEST_DATA.AMOUNT,
        description: 'simulation_invalid_format',
        inputs: [
          {
            tag: 'InputAmulet',
            value: TEST_DATA.AMULET_VALUE,
          },
        ],
      }),
  );

  // Non-existent contract ID
  await runner.runSimulation(
    'non_existent',
    async ledgerClient =>
      transferToPreapproved(ledgerClient, createValidatorClient(), {
        senderPartyId: TEST_DATA.SENDER_PARTY_ID,
        transferPreapprovalContractId:
          TEST_DATA.TRANSFER_PREAPPROVAL_CONTRACT_ID.NON_EXISTENT,
        amount: TEST_DATA.AMOUNT,
        description: 'simulation_non_existent',
        inputs: [
          {
            tag: 'InputAmulet',
            value: TEST_DATA.AMULET_VALUE,
          },
        ],
      }),
  );
} 