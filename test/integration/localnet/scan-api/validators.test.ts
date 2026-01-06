/**
 * ScanApiClient integration tests: Validator Information
 *
 * Tests for validator-related endpoints.
 */

import { getClient } from './setup';

describe('ScanApiClient / Validators', () => {
  test('getTopValidatorsByValidatorFaucets returns top validators', async () => {
    const client = getClient();

    const response = await client.getTopValidatorsByValidatorFaucets();

    expect(response).toBeDefined();
  });

  test('getTopValidatorsByValidatorRewards returns top validators by rewards', async () => {
    const client = getClient();

    const response = await client.getTopValidatorsByValidatorRewards();

    expect(response).toBeDefined();
  });

  test('getTopValidatorsByPurchasedTraffic returns top validators by traffic', async () => {
    const client = getClient();

    const response = await client.getTopValidatorsByPurchasedTraffic();

    expect(response).toBeDefined();
  });

  test('getTopProvidersByAppRewards returns top providers', async () => {
    const client = getClient();

    const response = await client.getTopProvidersByAppRewards();

    expect(response).toBeDefined();
  });
});
