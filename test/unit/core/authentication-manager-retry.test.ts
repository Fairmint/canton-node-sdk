import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  AuthenticationError as RestClientAuthenticationError,
  AuthenticationManager as RestClientAuthenticationManager,
  HttpError,
} from '@hardlydifficult/rest-client';
import { AuthenticationManager } from '../../../src/core/auth/AuthenticationManager';
import { TimeoutError } from '../../../src/core/errors';
import { abortableSleep, throwIfAborted } from '../../../src/core/http/abort';
import {
  DEFAULT_READ_RETRY_DELAYS_MS,
  DEFAULT_READ_RETRY_MAX_ATTEMPTS,
} from '../../../src/core/http/request-retry';
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
  const expectedAttempts = DEFAULT_READ_RETRY_MAX_ATTEMPTS;

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
      expect(mockedAbortableSleep.mock.calls.map(([delayMs]) => delayMs)).toEqual([...DEFAULT_READ_RETRY_DELAYS_MS]);
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

  it('does not clear a newer cached token when a stale retry wakes after clearToken', async () => {
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
      writeOAuthToken(res, 'newer-token');
    });

    const clearTokenSpy = jest.spyOn(RestClientAuthenticationManager.prototype, 'clearToken');

    try {
      const manager = new AuthenticationManager(server.url, createAuthConfig());
      const staleAuth = manager.authenticate(0);

      await sleepStarted;
      manager.clearToken();
      expect(clearTokenSpy).toHaveBeenCalledTimes(1);

      await expect(manager.authenticate(0)).resolves.toBe('newer-token');
      expect(requestCount).toBe(2);

      mockedAbortableSleep.mockImplementation(async () => {});
      releaseSleep?.();

      await expect(staleAuth).resolves.toBe('newer-token');
      expect(clearTokenSpy).toHaveBeenCalledTimes(1);

      await expect(manager.authenticate(0)).resolves.toBe('newer-token');
      expect(requestCount).toBe(2);
    } finally {
      clearTokenSpy.mockRestore();
      await server.close();
    }
  });

  it('does not call clearToken when a stale retry exhausts after clearToken', async () => {
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

    const clearTokenSpy = jest.spyOn(RestClientAuthenticationManager.prototype, 'clearToken');

    try {
      const manager = new AuthenticationManager(server.url, createAuthConfig());
      const staleAuth = manager.authenticate(0);

      await sleepStarted;
      manager.clearToken();
      expect(clearTokenSpy).toHaveBeenCalledTimes(1);

      mockedAbortableSleep.mockImplementation(async () => {});
      releaseSleep?.();

      await expect(staleAuth).rejects.toThrow(/Authentication failed[\s\S]*502/u);
      expect(clearTokenSpy).toHaveBeenCalledTimes(1);
      expect(requestCount).toBe(expectedAttempts);
    } finally {
      clearTokenSpy.mockRestore();
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

  it('retries a status-less HttpError when ECONNRESET is in the message', async () => {
    const authenticateSpy = jest
      .spyOn(RestClientAuthenticationManager.prototype, 'authenticate')
      .mockRejectedValueOnce(
        new HttpError('Authentication failed for https://auth.example/: undefined read ECONNRESET')
      )
      .mockResolvedValueOnce('recovered-token');

    try {
      const manager = new AuthenticationManager('https://auth.example', createAuthConfig());
      await expect(manager.authenticate(0)).resolves.toBe('recovered-token');
      expect(authenticateSpy).toHaveBeenCalledTimes(2);
    } finally {
      authenticateSpy.mockRestore();
    }
  });

  it('retries a status-less HttpError when ECONNRESET is only on cause.code', async () => {
    const cause = Object.assign(new Error('socket destroyed'), { code: 'ECONNRESET' });
    const wrapped = new HttpError('Authentication failed for https://auth.example/: undefined Request failed');
    Object.defineProperty(wrapped, 'cause', { value: cause });

    const authenticateSpy = jest
      .spyOn(RestClientAuthenticationManager.prototype, 'authenticate')
      .mockRejectedValueOnce(wrapped)
      .mockResolvedValueOnce('recovered-token');

    try {
      const manager = new AuthenticationManager('https://auth.example', createAuthConfig());
      await expect(manager.authenticate(0)).resolves.toBe('recovered-token');
      expect(authenticateSpy).toHaveBeenCalledTimes(2);
    } finally {
      authenticateSpy.mockRestore();
    }
  });

  it('does not retry a status-less generic Error without a transport signal', async () => {
    const authenticateSpy = jest
      .spyOn(RestClientAuthenticationManager.prototype, 'authenticate')
      .mockRejectedValue(new Error('unexpected token-endpoint failure'));

    try {
      const manager = new AuthenticationManager('https://auth.example', createAuthConfig());
      await expect(manager.authenticate(0)).rejects.toThrow('unexpected token-endpoint failure');
      expect(authenticateSpy).toHaveBeenCalledTimes(1);
    } finally {
      authenticateSpy.mockRestore();
    }
  });

  it('does not retry a status-less HttpError without a transport signal', async () => {
    const authenticateSpy = jest
      .spyOn(RestClientAuthenticationManager.prototype, 'authenticate')
      .mockRejectedValue(new HttpError('Authentication failed for https://auth.example/: undefined Request failed'));

    try {
      const manager = new AuthenticationManager('https://auth.example', createAuthConfig());
      await expect(manager.authenticate(0)).rejects.toThrow(/Authentication failed/u);
      expect(authenticateSpy).toHaveBeenCalledTimes(1);
    } finally {
      authenticateSpy.mockRestore();
    }
  });

  it('does not retry a rest-client AuthenticationError', async () => {
    const authenticateSpy = jest
      .spyOn(RestClientAuthenticationManager.prototype, 'authenticate')
      .mockRejectedValue(new RestClientAuthenticationError('Authentication response missing access_token'));

    try {
      const manager = new AuthenticationManager('https://auth.example', createAuthConfig());
      await expect(manager.authenticate(0)).rejects.toThrow('Authentication response missing access_token');
      expect(authenticateSpy).toHaveBeenCalledTimes(1);
    } finally {
      authenticateSpy.mockRestore();
    }
  });

  it('retries a 502 HttpError from the token request', async () => {
    const authenticateSpy = jest
      .spyOn(RestClientAuthenticationManager.prototype, 'authenticate')
      .mockRejectedValueOnce(
        new HttpError('Authentication failed for https://auth.example/: 502 Bad Gateway', 502, 'Bad Gateway')
      )
      .mockResolvedValueOnce('recovered-token');

    try {
      const manager = new AuthenticationManager('https://auth.example', createAuthConfig());
      await expect(manager.authenticate(0)).resolves.toBe('recovered-token');
      expect(authenticateSpy).toHaveBeenCalledTimes(2);
    } finally {
      authenticateSpy.mockRestore();
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

  it('does not retry AbortError from the token request', async () => {
    const abortError = new Error('token request aborted');
    abortError.name = 'AbortError';
    const authenticateSpy = jest
      .spyOn(RestClientAuthenticationManager.prototype, 'authenticate')
      .mockRejectedValue(abortError);

    try {
      const manager = new AuthenticationManager('https://auth.example', createAuthConfig());
      await expect(manager.authenticate(0)).rejects.toMatchObject({
        name: 'AbortError',
        message: 'token request aborted',
      });
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
