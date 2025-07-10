import SimulationRunner from '../../../core/SimulationRunner';
import { 
  TransactionTreeByOffsetResponseSchema,
  BadRequestErrorSchema,
  NotFoundErrorSchema
} from '../../../../src/clients/ledger-json-api/schemas';

const runner = new SimulationRunner();

const TEST_OFFSETS = {
  VALID: '4086',
  INVALID_FORMAT: '0',
  NON_EXISTENT: '9999999',
} as const;

export async function runAllTests() {
  // Test with valid offset and parties
  await runner.runSimulation(
    'valid',
    client => client.getTransactionTreeByOffset({
      offset: TEST_OFFSETS.VALID,
    }),
    TransactionTreeByOffsetResponseSchema
  );

  // Test with invalid offset format
  await runner.runSimulation(
    'invalid_format',
    client => client.getTransactionTreeByOffset({
      offset: TEST_OFFSETS.INVALID_FORMAT,
    }),
    BadRequestErrorSchema
  );

  // Test with non-existent offset
  await runner.runSimulation(
    'non_existent',
    client => client.getTransactionTreeByOffset({
      offset: TEST_OFFSETS.NON_EXISTENT,
    }),
    NotFoundErrorSchema
  );
} 