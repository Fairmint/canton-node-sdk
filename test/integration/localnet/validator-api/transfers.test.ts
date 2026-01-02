/**
 * ValidatorApiClient integration tests: Transfer Operations
 */

import { getClient, TEST_TIMEOUT } from './setup';

describe('ValidatorApiClient / Transfers', () => {
  jest.setTimeout(TEST_TIMEOUT);

  test('listTransferOffers returns transfer offers list', async () => {
    const client = getClient();
    const response = await client.listTransferOffers();

    expect(response).toBeDefined();
    expect(Array.isArray(response.offers)).toBe(true);
  });
});
