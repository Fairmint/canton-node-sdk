/**
 * Integration tests for ScanApiClient against LocalNet.
 *
 * These tests verify SDK operations against a running Canton LocalNet (cn-quickstart) environment.
 *
 * Prerequisites:
 * - LocalNet must be running: `npm run localnet:start` or via CI
 */

import { ScanApiClient } from '../../../src';
import { buildIntegrationTestClientConfig } from '../../utils/testConfig';

describe('ScanApiClient Integration', () => {
  jest.setTimeout(60_000);

  let client: ScanApiClient;

  beforeAll(() => {
    const config = buildIntegrationTestClientConfig();
    // ScanApiClient has its own config structure but accepts ClientConfig
    client = new ScanApiClient({
      ...config,
      scanApiUrls: [config.apis?.SCAN_API?.apiUrl ?? 'http://localhost:4000/api/scan'],
    });
  });

  describe('DSO Information', () => {
    test('getDsoInfo returns DSO information', async () => {
      const response = await client.getDsoInfo();

      expect(response).toBeDefined();
      expect(response.sv_user).toBeDefined();
      expect(response.sv_party_id).toBeDefined();
    });
  });

  describe('Mining Round Information', () => {
    test('getOpenAndIssuingMiningRounds returns mining rounds', async () => {
      const response = await client.getOpenAndIssuingMiningRounds({
        body: {
          cached_open_mining_round_contract_ids: [],
          cached_issuing_round_contract_ids: [],
        },
      });

      expect(response).toBeDefined();
      expect(response.open_mining_rounds).toBeDefined();
      expect(Array.isArray(response.open_mining_rounds)).toBe(true);
    });

    test('getRoundOfLatestData returns latest round info', async () => {
      const response = await client.getRoundOfLatestData();

      expect(response).toBeDefined();
      expect(response.round).toBeDefined();
    });
  });

  describe('Amulet Rules', () => {
    test('getAmuletRules returns amulet configuration', async () => {
      const response = await client.getAmuletRules({ body: {} });

      expect(response).toBeDefined();
      expect(response.amulet_rules_update).toBeDefined();
    });
  });

  describe('Total Amulet Balance', () => {
    test('getTotalAmuletBalance returns network balance', async () => {
      const response = await client.getTotalAmuletBalance();

      expect(response).toBeDefined();
      expect(response.total_balance).toBeDefined();
    });
  });
});
