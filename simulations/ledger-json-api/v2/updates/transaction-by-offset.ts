import type { TransactionFormat } from '../../../../src/clients/ledger-json-api/schemas/operations/updates';
import SimulationRunner from '../../../core/SimulationRunner';

const runner = new SimulationRunner();

const TEST_OFFSETS = {
  VALID: 4086,
  INVALID_FORMAT: 0,
  NON_EXISTENT: 9999999,
} as const;

export async function runAllTests() {
  const DEFAULT_TRANSACTION_FORMAT: TransactionFormat = {
    eventFormat: {
      filtersByParty: {
        'TransferAgent-devnet-1::1220ea70ea2cbfe6be431f34c7323e249c624a02fb2209d2b73fabd7eea1fe84df34': {
          cumulative: [
            {
              identifierFilter: { Empty: {} as Record<string, never> },
            },
          ],
        },
      },
      verbose: true,
    },
    transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
  };
  // Test with valid offset and transaction format
  await runner.runSimulation('valid', async (client) =>
    client.getTransactionByOffset({
      offset: TEST_OFFSETS.VALID,
      transactionFormat: DEFAULT_TRANSACTION_FORMAT,
    })
  );

  // Test with invalid offset format
  await runner.runSimulation('invalid_format', async (client) =>
    client.getTransactionByOffset({
      offset: TEST_OFFSETS.INVALID_FORMAT,
      transactionFormat: DEFAULT_TRANSACTION_FORMAT,
    })
  );

  // Test with non-existent offset
  await runner.runSimulation('non_existent', async (client) =>
    client.getTransactionByOffset({
      offset: TEST_OFFSETS.NON_EXISTENT,
      transactionFormat: DEFAULT_TRANSACTION_FORMAT,
    })
  );
}
