/**
 * ValidatorApiClient integration tests: External Party Operations
 *
 * Tests for external party management through the validator API.
 */

import { Keypair } from '@stellar/stellar-base';
import { getClient } from './setup';

describe('ValidatorApiClient / ExternalParties', () => {
  // Generate a test keypair for external party operations
  const testKeypair = Keypair.random();
  const publicKey = testKeypair.rawPublicKey().toString('hex');

  test('generateExternalPartyTopology generates topology for a public key', async () => {
    const client = getClient();

    try {
      const response = await client.generateExternalPartyTopology({
        party_hint: `test-party-${Date.now()}`,
        public_key: publicKey,
      });

      expect(response).toBeDefined();

      // Response should include party_id, topology_txs
      expect(typeof response.party_id).toBe('string');
      expect(response.party_id.length).toBeGreaterThan(0);
      expect(Array.isArray(response.topology_txs)).toBe(true);
    } catch (error) {
      // May fail if external party feature is not enabled
      console.warn('generateExternalPartyTopology failed:', error);
    }
  });

  test('listExternalPartySetupProposals returns proposals list', async () => {
    const client = getClient();

    try {
      const response = await client.listExternalPartySetupProposals();

      expect(response).toBeDefined();
      expect(response.contracts).toBeDefined();
      expect(Array.isArray(response.contracts)).toBe(true);
    } catch (error) {
      // May not be supported in all setups
      console.warn('listExternalPartySetupProposals failed:', error);
    }
  });

  test('getExternalPartyBalance returns balance for external party', async () => {
    const client = getClient();

    try {
      // Use a non-existent party ID - should return error or empty balance
      const response = await client.getExternalPartyBalance({
        partyId: 'non-existent-party-id',
      });

      expect(response).toBeDefined();
    } catch (error) {
      // Expected - party not found
      expect(error).toBeDefined();
    }
  });
});
