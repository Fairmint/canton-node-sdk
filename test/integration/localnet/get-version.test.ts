/**
 * LocalNet Integration Test for GetVersion API
 *
 * This test validates connectivity to a running LocalNet instance by calling the getVersion API and validating the full
 * response structure.
 *
 * Prerequisites:
 *
 * - LocalNet must be running (set up by CircleCI or manually via scripts)
 *
 * This test verifies:
 *
 * - SDK can connect to LocalNet JSON API
 * - GetVersion API returns the expected response
 */

import { testClients } from '../../setup';

describe('LocalNet GetVersion Integration Test', () => {
  it('should successfully call getVersion and validate full response', async () => {
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
  }, 30000);
});
