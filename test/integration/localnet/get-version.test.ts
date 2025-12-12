import { testClients } from '../../setup';

const shouldRunIntegrationTests = process.env['CI'] === 'true' || process.env['RUN_INTEGRATION_TESTS'] === 'true';
const describeIntegration = shouldRunIntegrationTests ? describe : describe.skip;

async function isLocalnetReady(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch('http://localhost:8082/realms/AppProvider', { signal: controller.signal });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

describeIntegration('LocalNet GetVersion', () => {
  let localnetReady = false;

  beforeAll(async () => {
    localnetReady = await isLocalnetReady();

    // In CI we expect LocalNet to be started by the workflow; fail fast if it isn't.
    if (!localnetReady && process.env['CI'] === 'true') {
      throw new Error('LocalNet is not ready (expected Keycloak at http://localhost:8082/realms/AppProvider)');
    }
  });

  it('getVersion', async () => {
    if (!localnetReady) {
      throw new Error('LocalNet is not ready (set RUN_INTEGRATION_TESTS=true to run integration tests locally)');
    }

    const response = await testClients.ledgerJsonApi.getVersion();

    expect(response).toEqual({
      version: '3.3.0-SNAPSHOT',
      features: {
        experimental: {
          staticTime: {
            supported: false,
          },
          commandInspectionService: {
            supported: true,
          },
        },
        userManagement: {
          supported: true,
          maxRightsPerUser: 1000,
          maxUsersPageSize: 1000,
        },
        partyManagement: {
          maxPartiesPageSize: 10000,
        },
        offsetCheckpoint: {
          maxOffsetCheckpointEmissionDelay: {
            seconds: 75,
            nanos: 0,
            unknownFields: {
              fields: {},
            },
          },
        },
      },
    });
  });
});
