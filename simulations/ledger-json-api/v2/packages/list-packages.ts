import SimulationRunner from '../../../core/SimulationRunner';
import { 
  ListPackagesResponseSchema
} from '../../../../src/clients/ledger-json-api/schemas';

const runner = new SimulationRunner();

export async function runAllTests() {
  // Test: successful package listing
  await runner.runSimulation(
    'list_packages',
    client => client.listPackages(),
    ListPackagesResponseSchema
  );
} 