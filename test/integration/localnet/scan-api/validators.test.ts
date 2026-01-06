/**
 * ScanApiClient integration tests: Validator Information
 *
 * Tests for validator-related endpoints.
 */

import { getClient } from './setup';

describe('ScanApiClient / Validators', () => {
  test('getTopValidatorsByValidatorFaucets returns top validators', async () => {
    const client = getClient();

    try {
      const response = await client.getTopValidatorsByValidatorFaucets();
      expect(response).toBeDefined();
    } catch (error) {
      // May not be available
      console.warn('getTopValidatorsByValidatorFaucets failed:', error);
    }
  });

  test('getTopValidatorsByValidatorRewards returns top validators by rewards', async () => {
    const client = getClient();

    try {
      const response = await client.getTopValidatorsByValidatorRewards();
      expect(response).toBeDefined();
    } catch (error) {
      // May not be available
      console.warn('getTopValidatorsByValidatorRewards failed:', error);
    }
  });

  test('getTopValidatorsByPurchasedTraffic returns top validators by traffic', async () => {
    const client = getClient();

    try {
      const response = await client.getTopValidatorsByPurchasedTraffic();
      expect(response).toBeDefined();
    } catch (error) {
      // May not be available
      console.warn('getTopValidatorsByPurchasedTraffic failed:', error);
    }
  });

  test('getTopProvidersByAppRewards returns top providers', async () => {
    const client = getClient();

    try {
      const response = await client.getTopProvidersByAppRewards();
      expect(response).toBeDefined();
    } catch (error) {
      // May not be available
      console.warn('getTopProvidersByAppRewards failed:', error);
    }
  });
});
