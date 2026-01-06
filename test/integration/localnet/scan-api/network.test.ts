/**
 * ScanApiClient integration tests: Network Information
 *
 * Tests for network-wide information endpoints.
 */

import { getClient } from './setup';

describe('ScanApiClient / Network', () => {
  test('getDsoPartyId returns DSO party identifier', async () => {
    const client = getClient();

    const response = await client.getDsoPartyId();

    expect(response).toBeDefined();
    expect(typeof response.dso_party_id).toBe('string');
    expect(response.dso_party_id.length).toBeGreaterThan(0);
  });

  test('listDsoScans returns DSO scan list', async () => {
    const client = getClient();

    const response = await client.listDsoScans();

    expect(response).toBeDefined();
  });

  test('listValidatorLicenses returns validator licenses', async () => {
    const client = getClient();

    const response = await client.listValidatorLicenses({});

    expect(response).toBeDefined();
  });

  test('listDsoSequencers returns sequencer list', async () => {
    const client = getClient();

    const response = await client.listDsoSequencers();

    expect(response).toBeDefined();
  });

  test('getSpliceInstanceNames returns instance names', async () => {
    const client = getClient();

    const response = await client.getSpliceInstanceNames();

    expect(response).toBeDefined();
  });

  test('listFeaturedAppRights returns featured app rights', async () => {
    const client = getClient();

    const response = await client.listFeaturedAppRights();

    expect(response).toBeDefined();
    expect(response.featured_apps).toBeDefined();
  });

  test('getClosedRounds returns closed rounds info', async () => {
    const client = getClient();

    const response = await client.getClosedRounds();

    expect(response).toBeDefined();
  });

  test('getAnsRules returns ANS rules', async () => {
    const client = getClient();

    const response = await client.getAnsRules({
      body: {},
    });

    expect(response).toBeDefined();
  });
});
