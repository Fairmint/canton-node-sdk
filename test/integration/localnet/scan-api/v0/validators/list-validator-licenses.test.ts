import { testClients } from '../../../../../setup';

describe('Scan API: listValidatorLicenses', () => {
  it('returns validator licenses', async () => {
    const response = await testClients.scanApi.listValidatorLicenses({});
    expect(response).toHaveProperty('validator_licenses');
  });
});
