import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { AuthenticationManager as RestClientAuthenticationManager } from '@hardlydifficult/rest-client';
import { AuthenticationManager } from '../../../src/core/auth/AuthenticationManager';
import { TimeoutError } from '../../../src/core/errors';
import { abortableSleep, throwIfAborted } from '../../../src/core/http/abort';
import { DEFAULT_HTTP_RETRY_CONFIG } from '../../../src/core/http/HttpClient';
import { type AuthConfig } from '../../../src/core/types';

jest.mock('../../../src/core/http/abort', () => {
  const actual = jest.requireActual<typeof import('../../../src/core/http/abort')>('../../../src/core/http/abort');
  return {
    ...actual,
    abortableSleep: jest.fn(actual.abortableSleep),
  };
});

const mockedAbortableSleep = abortableSleep as jest.MockedFunction<typeof abortableSleep>;

async function startServer(
  onRequest: http.RequestListener
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(onRequest);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}

function createAuthConfig(): AuthConfig {
  return {
    grantType: 'client_credentials',
    clientId: 'client',
    clientSecret: 'secret',
  };
}

function writeOAuthToken(res: http.ServerResponse, accessToken = 'access-token'): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600 }));
}

function writeStatus(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('AuthenticationManager token-endpoint retry', () => {
  const expectedAttempts = DEFAULT_HTTP_RETRY_CONFIG.maxRetries + 1;

  beforeEach(() => {
    mockedAbortableSleep.mockImplementation(async (_ms: number, signal?: AbortSignal) => {
      throwIfAborted(signal);
    });
  });

  afterEach(() => {
    mockedAbortableSleep.mockReset();
  });

  it('retries a 502 token response and succeeds on the next attempt', async () => {
    let requestCount = 0;
    const server = await startServer((_req, res) => {
      requestCount += 1;
      if (requestCount === 1) {
        writeStatus(res, 502, 'failed to connect to authentik backend: EOF');
        return;
      }
      writeOAuthToken(res);
    });

    try {
      const manager = new AuthenticationManager(server.url, createAuthConfig());
      await expect(manager.authenticate(0)).resolves.toBe('access-token');
      expect(requestCount).toBeGreaterThan(1);
      expect(requestCount).toBe(2);
    } finally {
      await server.close();
    }
  });

  it('exhausts retries on a persistent 502 and still reports Authentication failed / 502', async () => {
    let requestCount = 0;
    const server = await startServer((_req, res) => {
      requestCount += 1;
      writeStatus(res, 502, 'failed to connect to authentik backend: EOF');
    });

    try {
      const manager = new AuthenticationManager(server.url, createAuthConfig());
      await expect(manager.authenticate(0)).rejects.toThrow(/Authentication failed[\s\S]*502/u);
      expect(requestCount).toBe(expectedAttempts);
    } finally {
      await server.close();
    }
  });

  it('does not retry a 401 invalid_grant token response', async () => {
    let requestCount = 0;
    const server = await startServer((_req, res) => {
      requestCount += 1;
      writeStatus(res, 401, { error: 'invalid_grant' });
    });

    try {
      const manager = new AuthenticationManager(server.url, createAuthConfig());
      await expect(manager.authenticate(0)).rejects.toThrow(/Authentication failed[\s\S]*401/u);
      expect(requestCount).toBe(1);
    } finally {
      await server.close();
    }
  });

  it('retries a dropped token connection (ECONNRESET) and succeeds', async () => {
    let requestCount = 0;
    const server = await startServer((req, res) => {
      requestCount += 1;
      if (requestCount === 1) {
        req.socket.destroy(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }));
        return;
      }
      writeOAuthToken(res, 'recovered-token');
    });

    try {
      const manager = new AuthenticationManager(server.url, createAuthConfig());
      await expect(manager.authenticate(0)).resolves.toBe('recovered-token');
      expect(requestCount).toBe(2);
    } finally {
      await server.close();
    }
  });

  it('does not retry TimeoutError from the token request', async () => {
    const authenticateSpy = jest
      .spyOn(RestClientAuthenticationManager.prototype, 'authenticate')
      .mockRejectedValue(new TimeoutError('Authentication request timed out after 250ms'));

    try {
      const manager = new AuthenticationManager('https://auth.example', createAuthConfig());
      await expect(manager.authenticate(0)).rejects.toThrow(TimeoutError);
      expect(authenticateSpy).toHaveBeenCalledTimes(1);
    } finally {
      authenticateSpy.mockRestore();
    }
  });

  it('shares one in-flight token request across concurrent callers, including retries', async () => {
    let requestCount = 0;
    const server = await startServer((_req, res) => {
      requestCount += 1;
      if (requestCount === 1) {
        writeStatus(res, 502, 'failed to connect to authentik backend: EOF');
        return;
      }
      writeOAuthToken(res, 'shared-token');
    });

    try {
      const manager = new AuthenticationManager(server.url, createAuthConfig());
      const [first, second] = await Promise.all([manager.authenticate(0), manager.authenticate(0)]);

      expect(first).toBe('shared-token');
      expect(second).toBe('shared-token');
      expect(requestCount).toBe(2);
    } finally {
      await server.close();
    }
  });

  it('rejects the aborted caller during retry backoff without cancelling shared retry or leaking wait timers', async () => {
    let requestCount = 0;
    let markSleepStarted: (() => void) | undefined;
    const sleepStarted = new Promise<void>((resolve) => {
      markSleepStarted = resolve;
    });
    let releaseSleep: (() => void) | undefined;
    const sleepHeld = new Promise<void>((resolve) => {
      releaseSleep = resolve;
    });

    mockedAbortableSleep.mockImplementation(async (_ms: number, signal?: AbortSignal) => {
      expect(signal).toBeUndefined();
      markSleepStarted?.();
      await sleepHeld;
    });

    const server = await startServer((_req, res) => {
      requestCount += 1;
      writeStatus(res, 502, 'failed to connect to authentik backend: EOF');
    });

    try {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      try {
        const manager = new AuthenticationManager(server.url, createAuthConfig());
        const controller = new AbortController();
        const request = manager.authenticate(60_000, controller.signal);

        await sleepStarted;
        expect(jest.getTimerCount()).toBeGreaterThan(0);

        controller.abort(new Error('stop waiting for token retry'));
        await expect(request).rejects.toMatchObject({
          name: 'AbortError',
          message: 'stop waiting for token retry',
        });

        // withAuthTimeout unblocks this caller and clears its wait timer. Shared backoff is independent of
        // the caller's signal, so abort must not reject abortableSleep.
        expect(jest.getTimerCount()).toBe(0);
        expect(requestCount).toBe(1);

        const followUp = manager.authenticate(0);
        mockedAbortableSleep.mockImplementation(async () => {});
        releaseSleep?.();
        await expect(followUp).rejects.toThrow(/Authentication failed[\s\S]*502/u);
        expect(requestCount).toBe(expectedAttempts);
      } finally {
        jest.useRealTimers();
      }
    } finally {
      await server.close();
    }
  });

  it('does not fail a joiner when the leader aborts during shared retry backoff', async () => {
    let requestCount = 0;
    let markSleepStarted: (() => void) | undefined;
    const sleepStarted = new Promise<void>((resolve) => {
      markSleepStarted = resolve;
    });
    let releaseSleep: (() => void) | undefined;
    const sleepHeld = new Promise<void>((resolve) => {
      releaseSleep = resolve;
    });

    mockedAbortableSleep.mockImplementation(async (_ms: number, signal?: AbortSignal) => {
      expect(signal).toBeUndefined();
      markSleepStarted?.();
      await sleepHeld;
    });

    const server = await startServer((_req, res) => {
      requestCount += 1;
      if (requestCount === 1) {
        writeStatus(res, 502, 'failed to connect to authentik backend: EOF');
        return;
      }
      writeOAuthToken(res, 'joiner-token');
    });

    try {
      const manager = new AuthenticationManager(server.url, createAuthConfig());
      const leaderController = new AbortController();
      const leader = manager.authenticate(0, leaderController.signal);
      const joiner = manager.authenticate(0);

      await sleepStarted;
      leaderController.abort(new Error('leader stopped waiting'));
      await expect(leader).rejects.toMatchObject({
        name: 'AbortError',
        message: 'leader stopped waiting',
      });

      releaseSleep?.();
      await expect(joiner).resolves.toBe('joiner-token');
      expect(requestCount).toBe(2);
    } finally {
      await server.close();
    }
  });
});
