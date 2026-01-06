/**
 * LedgerJsonApiClient integration tests: External Party Management
 *
 * Tests for external party allocation and topology generation.
 * External parties are parties whose keys are managed outside the ledger.
 *
 * Note: These tests require the external party feature to be enabled in LocalNet.
 */

import { Keypair } from '@stellar/stellar-base';
import { getClient } from './setup';

describe('LedgerJsonApiClient / ExternalParties', () => {
  // Use a deterministic seed for reproducible test results
  const DETERMINISTIC_SEED = Buffer.from(
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    'hex'
  );
  const testKeypair = Keypair.fromRawEd25519Seed(DETERMINISTIC_SEED);
  const publicKeyHex = testKeypair.rawPublicKey().toString('hex');

  test('generateExternalPartyTopology generates topology for a public key', async () => {
    const client = getClient();

    const response = await client.generateExternalPartyTopology({
      synchronizer: 'global-synchronizer',
      partyHint: `test-external-${Date.now()}`,
      publicKey: {
        format: 'CRYPTO_KEY_FORMAT_DER_X509_SUBJECT_PUBLIC_KEY_INFO',
        keyData: publicKeyHex,
        keySpec: 'SIGNING_KEY_SPEC_EC_CURVE25519',
      },
    });

    expect(response).toBeDefined();

    // Response should include topology transactions and party ID
    if (response.partyId) {
      expect(typeof response.partyId).toBe('string');
      expect(response.partyId.length).toBeGreaterThan(0);
    }

    if (response.topologyTransactions) {
      expect(Array.isArray(response.topologyTransactions)).toBe(true);
    }
  });
});
