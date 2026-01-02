/**
 * Integration tests for LedgerJsonApiClient against LocalNet.
 *
 * These tests verify SDK operations against a running Canton LocalNet (cn-quickstart) environment.
 *
 * Prerequisites:
 * - LocalNet must be running: `npm run localnet:start` or via CI
 *
 * @example
 *   Running with LocalNet defaults
 *   ```bash
 *   npm run test
 *   ```
 */

import { LedgerJsonApiClient } from '../../../src';
import { buildIntegrationTestClientConfig } from '../../utils/testConfig';

describe('LedgerJsonApiClient Integration', () => {
  jest.setTimeout(60_000);

  let client: LedgerJsonApiClient;

  beforeAll(() => {
    const config = buildIntegrationTestClientConfig();
    client = new LedgerJsonApiClient(config);
  });

  describe('Version API', () => {
    test('getVersion returns valid version info', async () => {
      const version = await client.getVersion();

      expect(typeof version.version).toBe('string');
      expect(version.version.length).toBeGreaterThan(0);
      expect(version.features).toBeDefined();
    });
  });

  describe('Party Management', () => {
    test('listParties returns party list', async () => {
      const response = await client.listParties({});

      expect(response).toBeDefined();
      expect(Array.isArray(response.partyDetails)).toBe(true);
    });

    test('getParticipantId returns participant identifier', async () => {
      // Cast to handle void parameter type
      const response = await (client.getParticipantId as () => Promise<{ participantId: string }>)();

      expect(response).toBeDefined();
      expect(typeof response.participantId).toBe('string');
      expect(response.participantId.length).toBeGreaterThan(0);
    });
  });

  describe('User Management', () => {
    test('listUsers returns user list', async () => {
      const response = await client.listUsers({ pageSize: 100 });

      expect(response).toBeDefined();
      expect(Array.isArray(response.users)).toBe(true);
    });
  });

  describe('State Queries', () => {
    test('getLedgerEnd returns ledger end offset', async () => {
      const response = await client.getLedgerEnd({});

      expect(response).toBeDefined();
      expect(response.offset).toBeDefined();
    });

    test('getConnectedSynchronizers returns synchronizer list', async () => {
      // Get parties first to use as the party filter
      const parties = await client.listParties({});
      const partyDetails = parties.partyDetails ?? [];

      if (partyDetails.length === 0) {
        console.warn('No parties available, skipping getConnectedSynchronizers test');
        return;
      }

      const firstParty = partyDetails[0];
      if (!firstParty) {
        console.warn('First party is undefined, skipping getConnectedSynchronizers test');
        return;
      }
      const response = await client.getConnectedSynchronizers({ party: firstParty.party });

      expect(response).toBeDefined();
      expect(Array.isArray(response.connectedSynchronizers)).toBe(true);
    });
  });

  describe('Package Management', () => {
    test('listPackages returns package list', async () => {
      const response = await client.listPackages();

      expect(response).toBeDefined();
      expect(Array.isArray(response.packageIds)).toBe(true);
    });
  });
});
