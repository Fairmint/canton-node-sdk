import type { ListPackagesResponse } from '../../../src/clients/ledger-json-api/schemas/api';
import { createLocalnetTestContext, defineEndpointTest } from './framework';

const context = createLocalnetTestContext();
const { ledgerClient, apiBaseUrl, network, provider } = context;

const hexPattern = /^[0-9a-f]{64}$/i;

describe('Ledger JSON API v2 – packages endpoint', () => {
  beforeAll(() => {
    console.info(
      `Running package endpoint tests against ${network}/${provider} ledger at ${apiBaseUrl || 'unknown URL'}`
    );
  });

  defineEndpointTest<ListPackagesResponse>({
    name: 'lists DAR package identifiers on the participant',
    method: 'GET',
    path: '/v2/packages',
    requestExample: {
      url: `${apiBaseUrl}/v2/packages`,
      query: {},
    },
    call: () => ledgerClient.listPackages(),
    expectResponse: (response) => {
      expect(Array.isArray(response.packageIds)).toBe(true);
      expect(response.packageIds.length).toBeGreaterThan(0);
      response.packageIds.forEach((packageId) => {
        expect(typeof packageId).toBe('string');
        expect(packageId).toMatch(hexPattern);
      });
      const uniqueIds = new Set(response.packageIds);
      expect(uniqueIds.size).toBe(response.packageIds.length);
    },
    captureResponse: (response) => ({
      packageCount: response.packageIds.length,
      samplePackageIds: response.packageIds.slice(0, 5),
    }),
    timeoutMs: 20000,
  });
});
