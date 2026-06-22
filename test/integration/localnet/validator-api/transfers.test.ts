/** ValidatorApiClient integration tests: Transfer Operations. */

import { ensureValidatorUserOnboarded, getClient } from './setup';

describe('ValidatorApiClient / Transfers', () => {
  beforeAll(ensureValidatorUserOnboarded);

  test('listTransferOffers returns transfer offers list', async () => {
    const client = getClient();
    const response = await client.listTransferOffers();

    expect(response).toBeDefined();
    expect(Array.isArray(response.offers)).toBe(true);
  });
});
