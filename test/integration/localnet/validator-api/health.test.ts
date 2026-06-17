/** ValidatorApiClient integration tests: Health and Status */

import { getClient } from './setup';

describe('ValidatorApiClient / Health', () => {
  test('isReady completes without error', async () => {
    const client = getClient();
    await client.isReady();
  });

  test('isLive completes without error', async () => {
    const client = getClient();
    await client.isLive();
  });
});
