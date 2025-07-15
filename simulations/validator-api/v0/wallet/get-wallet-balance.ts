import ValidatorSimulationRunner from '../../../core/ValidatorSimulationRunner';
import { WalletBalanceResponseSchema } from '../../../../src/clients/validator-api/schemas/api';

const runner = new ValidatorSimulationRunner();

export async function runAllTests() {
  // Test: successful wallet balance fetch
  await runner.runSimulation(
    'get_wallet_balance',
    client => client.getWalletBalance(),
    WalletBalanceResponseSchema
  );
} 