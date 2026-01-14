/**
 * ValidatorApiClient integration tests: External Party Operations
 *
 * Tests for external party management through the validator API.
 *
 * Note: These tests require the external party feature to be enabled in LocalNet.
 */

import { Keypair } from '@stellar/stellar-base';
import { getClient } from './setup';

describe('ValidatorApiClient / ExternalParties', () => {
  // Use a deterministic seed for reproducible test results
  const DETERMINISTIC_SEED = Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');
  const testKeypair = Keypair.fromRawEd25519Seed(DETERMINISTIC_SEED);
  const publicKey = testKeypair.rawPublicKey().toString('hex');

  test('generateExternalPartyTopology generates topology for a public key', async () => {
    const client = getClient();

    const response = await client.generateExternalPartyTopology({
      party_hint: `test-party-${Date.now()}`,
      public_key: publicKey,
    });

    expect(response).toBeDefined();
    expect(typeof response.party_id).toBe('string');
    expect(response.party_id.length).toBeGreaterThan(0);
    expect(Array.isArray(response.topology_txs)).toBe(true);
  });

  test('listExternalPartySetupProposals returns proposals list', async () => {
    const client = getClient();

    const response = await client.listExternalPartySetupProposals();

    expect(response).toBeDefined();
    expect(response.contracts).toBeDefined();
    expect(Array.isArray(response.contracts)).toBe(true);
  });

  test('getExternalPartyBalance returns error for non-existent party', async () => {
    const client = getClient();

    // Use a non-existent party ID - should return error
    await expect(
      client.getExternalPartyBalance({
        partyId: 'non-existent-party-id',
      })
    ).rejects.toThrow();
  });
});
