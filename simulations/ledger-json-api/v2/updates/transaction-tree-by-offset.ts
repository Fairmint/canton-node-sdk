import SimulationRunner from '../../../core/SimulationRunner';
import type { paths } from '../../../../src/generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const runner = new SimulationRunner();

const TEST_OFFSETS = {
  VALID: '4086',
  INVALID_FORMAT: '0',
  NON_EXISTENT: '9999999',
} as const;

type TransactionTreeByOffsetResponse = paths['/v2/updates/transaction-tree-by-offset/{offset}']['get']['responses']['200']['content']['application/json'];

export async function runAllTests() {
  // Test with valid offset and parties
  await runner.runSimulation<TransactionTreeByOffsetResponse>(
    'valid',
    client => client.getTransactionTreeByOffset({
      offset: TEST_OFFSETS.VALID,
    }),
  );

  // Test with invalid offset format
  await runner.runSimulation(
    'invalid_format',
    client => client.getTransactionTreeByOffset({
      offset: TEST_OFFSETS.INVALID_FORMAT,
    }),
  );

  // Test with non-existent offset
  await runner.runSimulation(
    'non_existent',
    client => client.getTransactionTreeByOffset({
      offset: TEST_OFFSETS.NON_EXISTENT,
    }),
  );
} 