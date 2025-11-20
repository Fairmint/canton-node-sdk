import type { GetLedgerApiVersionResponse } from '../../../src/clients/ledger-json-api/schemas/api';
import { createLocalnetTestContext, defineEndpointTest } from './framework';

const context = createLocalnetTestContext();
const { ledgerClient, apiBaseUrl, network, provider } = context;

describe('Ledger JSON API v2 – version endpoint', () => {
  beforeAll(() => {
    console.info(
      `Running version endpoint tests against ${network}/${provider} ledger at ${apiBaseUrl || 'unknown URL'}`
    );
  });

  defineEndpointTest<GetLedgerApiVersionResponse>({
    name: 'returns participant build metadata',
    method: 'GET',
    path: '/v2/version',
    requestExample: {
      url: `${apiBaseUrl}/v2/version`,
    },
    call: () => ledgerClient.getVersion(),
    expectResponse: (version) => {
      expect(version).toBeDefined();
      expect(version.version).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+/);

      const { features } = version;
      expect(features).toBeDefined();
      if (!features) {
        return;
      }

      expect(features).toEqual(
        expect.objectContaining({
          userManagement: expect.objectContaining({
            supported: expect.any(Boolean),
          }),
        })
      );

      expect(features.userManagement.maxRightsPerUser).toBeGreaterThan(0);
      expect(features.userManagement.maxUsersPageSize).toBeGreaterThan(0);
      expect(typeof features.experimental.commandInspectionService.supported).toBe('boolean');
    },
    captureResponse: (version) => ({
      version: version.version,
      advertisedFeatures: {
        experimental: Object.keys(version.features?.experimental ?? {}),
        userManagement: version.features?.userManagement,
        partyManagement: version.features?.partyManagement,
      },
    }),
    timeoutMs: 20000,
  });
});
