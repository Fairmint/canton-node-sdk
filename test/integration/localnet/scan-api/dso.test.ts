/**
 * ScanApiClient integration tests: DSO Information
 */

import { getClient } from './setup';

describe('ScanApiClient / DSO', () => {
  test('getDsoInfo returns DSO information', async () => {
    const client = getClient();
    const response = await client.getDsoInfo();

    expect(response).toBeDefined();
    expect(response.sv_user).toBeDefined();
    expect(response.sv_party_id).toBeDefined();
  });
});
