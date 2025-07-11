import SimulationRunner from '../../core/SimulationRunner';
import { GetLedgerApiVersionResponseSchema } from '../../../src/clients/ledger-json-api/schemas/api';

const runner = new SimulationRunner();

export async function runAllTests() {
  // Test: successful version fetch
  await runner.runSimulation(
    'get_version',
    client => client.getVersion(),
    GetLedgerApiVersionResponseSchema
  );
} 