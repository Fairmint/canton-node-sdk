import { Canton, type CantonServiceHealthStatus } from '../../src';

describe('Canton.checkHealth', () => {
  it('aggregates selected service health without throwing on partial failure', async () => {
    const canton = new Canton({
      network: 'localnet',
      apis: {
        LEDGER_JSON_API: {
          apiUrl: 'https://ledger.example',
          auth: { grantType: 'client_credentials', clientId: 'ledger', clientSecret: 'secret' },
        },
        VALIDATOR_API: {
          apiUrl: 'https://validator.example',
          auth: { grantType: 'client_credentials', clientId: 'validator', clientSecret: 'secret' },
        },
        SCAN_API: {
          apiUrl: 'https://scan.example/api/scan',
          auth: { grantType: 'client_credentials', clientId: '' },
        },
      },
    });

    jest.spyOn(canton.ledger, 'getVersion').mockResolvedValue({ version: '3.4.0' });
    jest.spyOn(canton.validator, 'isReady').mockResolvedValue(undefined);
    jest.spyOn(canton.validator, 'isLive').mockRejectedValue(new Error('validator unavailable'));

    const health = await canton.checkHealth({ services: ['ledger', 'validator'] });

    expect(health.ok).toBe(false);
    expect(health.services.ledger).toMatchObject({
      ok: true,
      version: { version: '3.4.0' },
    } satisfies Partial<CantonServiceHealthStatus>);
    expect(health.services.validator).toMatchObject({
      ok: false,
      ready: true,
      live: false,
      error: 'validator unavailable',
    } satisfies Partial<CantonServiceHealthStatus>);
    expect(health.services.scan).toBeUndefined();
  });

  it('rejects unknown service values supplied by runtime JavaScript callers', async () => {
    const canton = new Canton({
      network: 'localnet',
      apis: {
        LEDGER_JSON_API: {
          apiUrl: 'https://ledger.example',
          auth: { grantType: 'client_credentials', clientId: 'ledger', clientSecret: 'secret' },
        },
        VALIDATOR_API: {
          apiUrl: 'https://validator.example',
          auth: { grantType: 'client_credentials', clientId: 'validator', clientSecret: 'secret' },
        },
        SCAN_API: {
          apiUrl: 'https://scan.example/api/scan',
          auth: { grantType: 'client_credentials', clientId: '' },
        },
      },
    });

    await expect(
      canton.checkHealth({
        services: ['validatorr'] as unknown as readonly ['validator'],
      })
    ).rejects.toThrow('Unknown Canton health service: validatorr');
  });
});
