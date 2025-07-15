import SimulationRunner from '../../../core/SimulationRunner';
import { 
  JsGetActiveContractsResponseSchema
} from '../../../../src/clients/ledger-json-api/schemas';

const runner = new SimulationRunner();

export async function runAllTests() {
  // Disabled due to frequent changes
  // Test: successful active contracts query (happy case)
  await runner.runSimulation(
    'get_active_contracts',
    client => client.getActiveContracts({
      // Using default parameters - verbose will default to false
      // activeAtOffset will default to ledger-end
      // parties will default to current party
    }),
    JsGetActiveContractsResponseSchema
  );
} 