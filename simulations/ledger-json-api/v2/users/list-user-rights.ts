import SimulationRunner from '../../../core/SimulationRunner';

const runner = new SimulationRunner();

const TEST_USER_IDS = {
  VALID: '5',
  INVALID_FORMAT: '',
  NON_EXISTENT: 'non_existent_user_12345',
} as const;

const TEST_IDENTITY_PROVIDER_IDS = {
  DEFAULT: 'default',
  NON_EXISTENT: 'non_existent_provider',
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

  await runner.runSimulation('valid_with_identity_provider', async (client) =>
    client.listUserRights({
      userId: TEST_USER_IDS.VALID,
      identityProviderId: TEST_IDENTITY_PROVIDER_IDS.DEFAULT,
    })
  );

  await runner.runSimulation('non_existent_identity_provider', async (client) =>
    client.listUserRights({
      userId: TEST_USER_IDS.VALID,
      identityProviderId: TEST_IDENTITY_PROVIDER_IDS.NON_EXISTENT,
    })
  );
}
