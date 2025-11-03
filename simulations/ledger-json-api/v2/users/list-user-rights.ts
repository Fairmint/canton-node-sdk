import SimulationRunner from '../../../core/SimulationRunner';

const runner = new SimulationRunner();

const TEST_USER_IDS = {
  VALID: '5',
  INVALID_FORMAT: '',
  NON_EXISTENT: 'non_existent_user_12345',
} as const;

export async function runAllTests() {
  await runner.runSimulation('valid', async (client) =>
    client.listUserRights({
      userId: TEST_USER_IDS.VALID,
    })
  );

  await runner.runSimulation('invalid_format', async (client) =>
    client.listUserRights({
      userId: TEST_USER_IDS.INVALID_FORMAT,
    })
  );

  await runner.runSimulation('non_existent', async (client) =>
    client.listUserRights({
      userId: TEST_USER_IDS.NON_EXISTENT,
    })
  );

  await runner.runSimulation('valid_user_default_provider', async (client) =>
    client.listUserRights({
      userId: TEST_USER_IDS.VALID,
    })
  );
}
