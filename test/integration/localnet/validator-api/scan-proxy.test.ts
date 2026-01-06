/**
 * ValidatorApiClient integration tests: Scan Proxy Operations
 *
 * Tests for the scan proxy endpoints exposed through the validator API.
 */

import { getClient } from './setup';

describe('ValidatorApiClient / ScanProxy', () => {
  test('getDsoPartyId returns DSO party ID', async () => {
    const client = getClient();

    const dsoResponse = await client.getDsoPartyId();

    expect(dsoResponse.dso_party_id).toBeDefined();
    expect(typeof dsoResponse.dso_party_id).toBe('string');
  });

  test('lookupTransferPreapprovalByParty returns error for non-existent party', async () => {
    const client = getClient();

    await expect(
      client.lookupTransferPreapprovalByParty({
        partyId: 'non-existent-party-id',
      })
    ).rejects.toThrow();
  });

  test('lookupTransferCommandCounterByParty returns error for non-existent party', async () => {
    const client = getClient();

    await expect(
      client.lookupTransferCommandCounterByParty({
        party: 'non-existent-party-id',
      })
    ).rejects.toThrow();
  });

  test('lookupTransferCommandStatus returns error for non-existent command', async () => {
    const client = getClient();

    await expect(
      client.lookupTransferCommandStatus({
        sender: 'non-existent-sender',
        nonce: 0,
      })
    ).rejects.toThrow();
  });

  test('getOpenAndIssuingMiningRounds returns mining rounds', async () => {
    const client = getClient();

    const rounds = await client.getOpenAndIssuingMiningRounds();

    expect(rounds.open_mining_rounds).toBeDefined();
    expect(Array.isArray(rounds.open_mining_rounds)).toBe(true);
  });

  test('lookupFeaturedAppRight returns error for non-existent provider', async () => {
    const client = getClient();

    await expect(
      client.lookupFeaturedAppRight({
        partyId: 'non-existent-provider',
      })
    ).rejects.toThrow();
  });
});
