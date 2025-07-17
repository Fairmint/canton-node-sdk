import SimulationRunner from '../../../core/SimulationRunner';
import type { paths } from '../../../../src/generated/openapi-types';

const runner = new SimulationRunner();

type ListPackagesResponse = paths['/v2/packages']['get']['responses']['200']['content']['application/json'];

export async function runAllTests() {
  // Test: successful package listing
  await runner.runSimulation<ListPackagesResponse>(
    'list_packages',
    client => client.listPackages(),
  );
} 