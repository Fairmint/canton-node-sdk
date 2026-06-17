import { waitForReady, type ServiceHealthStatus } from '../../../src';

function healthyStatus(): ServiceHealthStatus {
  return {
    ok: true,
    checkedAt: '2026-06-17T00:00:00.000Z',
    services: {
      validator: {
        ok: true,
        ready: true,
        live: true,
      },
    },
  };
}

describe('waitForReady', () => {
  it('returns once health checks are healthy', async () => {
    const ready = healthyStatus();
    const canton = {
      checkHealth: jest
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          checkedAt: '2026-06-17T00:00:00.000Z',
          services: {
            validator: {
              ok: false,
              ready: false,
              live: true,
              error: 'starting',
            },
          },
        } satisfies ServiceHealthStatus)
        .mockResolvedValueOnce(ready),
    };

    await expect(waitForReady(canton, { timeout: 1_000, interval: 1 })).resolves.toBe(ready);
    expect(canton.checkHealth).toHaveBeenCalledTimes(2);
  });

  it('uses a configurable timeout', async () => {
    const canton = {
      checkHealth: jest.fn().mockResolvedValue({
        ok: false,
        checkedAt: '2026-06-17T00:00:00.000Z',
        services: {
          validator: {
            ok: false,
            ready: false,
            live: false,
          },
        },
      } satisfies ServiceHealthStatus),
    };

    await expect(
      waitForReady(canton, {
        timeout: 20,
        interval: 5,
        timeoutMessage: 'Validator did not become ready',
      })
    ).rejects.toThrow('Validator did not become ready');
  });
});
