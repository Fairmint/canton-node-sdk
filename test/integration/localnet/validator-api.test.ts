/**
 * Integration tests for ValidatorApiClient against LocalNet.
 *
 * These tests verify SDK operations against a running Canton LocalNet (cn-quickstart) environment.
 *
 * Prerequisites:
 * - LocalNet must be running: `npm run localnet:start` or via CI
 */

import { ValidatorApiClient } from '../../../src';
import { buildIntegrationTestClientConfig } from '../../utils/testConfig';

describe('ValidatorApiClient Integration', () => {
  jest.setTimeout(60_000);

  let client: ValidatorApiClient;

  beforeAll(() => {
    const config = buildIntegrationTestClientConfig();
    client = new ValidatorApiClient(config);
  });

  describe('DSO Information', () => {
    test('getDsoPartyId returns DSO party identifier', async () => {
      const response = await client.getDsoPartyId();

      expect(response).toBeDefined();
      expect(typeof response.dso_party_id).toBe('string');
      expect(response.dso_party_id.length).toBeGreaterThan(0);
    });

    test('getAmuletRules returns amulet rules configuration', async () => {
      const response = await client.getAmuletRules();

      expect(response).toBeDefined();
      expect(response.amulet_rules).toBeDefined();
      expect(response.amulet_rules.domain_id).toBeDefined();
    });
  });

  describe('Mining Rounds', () => {
    test('getOpenAndIssuingMiningRounds returns mining round info', async () => {
      const response = await client.getOpenAndIssuingMiningRounds();

      expect(response).toBeDefined();
      expect(response.open_mining_rounds).toBeDefined();
      expect(Array.isArray(response.open_mining_rounds)).toBe(true);
    });
  });

  describe('Wallet Operations', () => {
    test('getWalletBalance returns balance information', async () => {
      const response = await client.getWalletBalance();

      expect(response).toBeDefined();
      // Balance might be 0 for new/empty wallets
      expect(response.effective_unlocked_qty).toBeDefined();
    });

    test('getUserStatus returns user status', async () => {
      const response = await client.getUserStatus();

      expect(response).toBeDefined();
      expect(response.party_id).toBeDefined();
    });
  });

  describe('Admin Operations', () => {
    test('dumpParticipantIdentities returns identities', async () => {
      const response = await client.dumpParticipantIdentities();

      expect(response).toBeDefined();
      expect(response.id).toBeDefined();
    });

    test('listUsers returns user list', async () => {
      const response = await client.listUsers();

      expect(response).toBeDefined();
      expect(Array.isArray(response.usernames)).toBe(true);
    });
  });

  describe('ANS Operations', () => {
    test('listAnsEntries returns ANS entries', async () => {
      const response = await client.listAnsEntries();

      expect(response).toBeDefined();
      expect(Array.isArray(response.entries)).toBe(true);
    });
  });

  describe('Transfer Operations', () => {
    test('listTransferOffers returns transfer offers list', async () => {
      const response = await client.listTransferOffers();

      expect(response).toBeDefined();
      expect(Array.isArray(response.offers)).toBe(true);
    });
  });
});
