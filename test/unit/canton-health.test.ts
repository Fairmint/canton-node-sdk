import { Canton, type CantonHealthCheckOptions, type CantonServiceHealthStatus } from '../../src';

function createCanton(): Canton {
  return new Canton({
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
}

describe('Canton.checkHealth', () => {
  it('aggregates selected service health without throwing on partial failure', async (): Promise<void> => {
    const canton = createCanton();

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

  it('marks scan unhealthy when status body does not report success', async (): Promise<void> => {
    const canton = createCanton();

    jest.spyOn(canton.scan, 'isReady').mockResolvedValue(undefined);
    jest.spyOn(canton.scan, 'isLive').mockResolvedValue(undefined);
    jest.spyOn(canton.scan, 'getHealthStatus').mockResolvedValue({ not_initialized: { active: true } });

    const health = await canton.checkHealth({ services: ['scan', 'scan'] });

    expect(canton.scan.isReady).toHaveBeenCalledTimes(1);
    expect(canton.scan.isLive).toHaveBeenCalledTimes(1);
    expect(canton.scan.getHealthStatus).toHaveBeenCalledTimes(1);
    expect(health.ok).toBe(false);
    expect(health.services.scan).toMatchObject({
      ok: false,
      ready: true,
      live: true,
      status: { not_initialized: { active: true } },
      error: 'scan status not initialized',
    } satisfies Partial<CantonServiceHealthStatus>);
  });

  it('rejects unknown service values supplied by runtime JavaScript callers', async (): Promise<void> => {
    const canton = createCanton();
    const options = { services: ['validatorr'] } as unknown as CantonHealthCheckOptions;

    await expect(canton.checkHealth(options)).rejects.toThrow('Unknown Canton health service: validatorr');
  });
});
