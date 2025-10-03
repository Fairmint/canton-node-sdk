import SimulationRunner from '../../../core/SimulationRunner';
import type { paths } from '../../../../src/generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const runner = new SimulationRunner();

type ListPackagesResponse = paths['/v2/packages']['get']['responses']['200']['content']['application/json'];

export async function runAllTests() {
  // Test: successful package listing
  await runner.runSimulation<ListPackagesResponse>(
    'list_packages',
    async client => client.listPackages(),
  );
} 