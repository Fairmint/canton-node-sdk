import axios from 'axios';
import { ConfigurationError, NetworkError } from '../../../src/core/errors';
import { DEFAULT_HTTP_TIMEOUT_MS, HttpClient } from '../../../src/core/http/HttpClient';

jest.mock('axios', () => {
  const actual = jest.requireActual<typeof import('axios')>('axios');
  return {
    ...actual,
    create: jest.fn(() => ({
      get: jest.fn().mockResolvedValue({ data: {} }),
      post: jest.fn().mockResolvedValue({ data: {} }),
      delete: jest.fn().mockResolvedValue({ data: {} }),
      patch: jest.fn().mockResolvedValue({ data: {} }),
    })),
    isAxiosError: actual.isAxiosError,
    isCancel: actual.isCancel,
  };
});

interface MockAxiosInstance {
  readonly get: jest.Mock;
  readonly post: jest.Mock;
}

function lastAxiosInstance(): MockAxiosInstance {
  const { results } = (axios.create as jest.Mock).mock;
  const lastResult = results[results.length - 1] as { value?: MockAxiosInstance } | undefined;
  if (!lastResult?.value) throw new Error('Expected HttpClient to create an axios instance.');
  return lastResult.value;
}

function createClient(timeoutMs?: number): HttpClient {
  const client = new HttpClient(undefined, undefined, timeoutMs === undefined ? {} : { timeoutMs });
  client.setRetryConfig({ maxRetries: 0, delayMs: 0 });
  return client;
}

describe('HttpClient timeouts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies a client-level timeout override', async () => {
    const client = createClient(1234);

    await client.makeGetRequest('https://ledger.example/v2/version');

    const [, config] = lastAxiosInstance().get.mock.calls[0] as [string, { timeout: number }];
    expect(config.timeout).toBe(1234);
  });

  it('applies a per-request timeout override', async () => {
    const client = createClient(1234);

    await client.makeGetRequest('https://ledger.example/v2/version', { timeoutMs: 42 });

    const [, config] = lastAxiosInstance().get.mock.calls[0] as [string, { timeout: number }];
    expect(config.timeout).toBe(42);
  });

  it('falls back to the client timeout when a request does not override it', async () => {
    const client = createClient();

    await client.makePostRequest('https://ledger.example/v2/commands/submit', { commands: [] });

    const [, , config] = lastAxiosInstance().post.mock.calls[0] as [string, unknown, { timeout: number }];
    expect(config.timeout).toBe(DEFAULT_HTTP_TIMEOUT_MS);
  });

  it('allows a request to opt out of the timeout', async () => {
    const client = createClient();

    await client.makeGetRequest('https://ledger.example/v2/version', { timeoutMs: 0 });

    const [, config] = lastAxiosInstance().get.mock.calls[0] as [string, { timeout: number }];
    expect(config.timeout).toBe(0);
  });

  it('rejects invalid client timeouts', () => {
    expect(() => new HttpClient(undefined, undefined, { timeoutMs: -1 })).toThrow(ConfigurationError);
    expect(() => new HttpClient(undefined, undefined, { timeoutMs: Number.NaN })).toThrow(ConfigurationError);
  });

  it('rejects invalid per-request timeouts', async () => {
    const client = createClient();

    await expect(client.makeGetRequest('https://ledger.example/v2/version', { timeoutMs: -1 })).rejects.toThrow(
      ConfigurationError
    );
  });

  it('bounds a bearer token provider that never resolves', async () => {
    const client = new HttpClient(
      undefined,
      async () =>
        new Promise<string>(() => {
          // A silent auth endpoint would otherwise suspend the request before it is dispatched.
        }),
      { timeoutMs: 50 }
    );
    client.setRetryConfig({ maxRetries: 0, delayMs: 0 });

    await expect(
      client.makeGetRequest('https://ledger.example/v2/version', { includeBearerToken: true })
    ).rejects.toThrow(new NetworkError('Bearer token request timed out after 50ms'));
    expect(lastAxiosInstance().get).not.toHaveBeenCalled();
  });

  it('rejects a pre-aborted bearer-token request immediately even with timeoutMs: 0, without invoking the provider', async () => {
    const bearerTokenProvider = jest.fn(async (): Promise<string> => 'unused-token');
    const client = new HttpClient(undefined, bearerTokenProvider, { timeoutMs: 0 });
    client.setRetryConfig({ maxRetries: 0, delayMs: 0 });
    const controller = new AbortController();
    controller.abort(new Error('already stopped'));

    await expect(
      client.makeGetRequest(
        'https://ledger.example/v2/version',
        { includeBearerToken: true },
        { signal: controller.signal }
      )
    ).rejects.toMatchObject({ name: 'AbortError', message: 'already stopped' });
    expect(bearerTokenProvider).not.toHaveBeenCalled();
    expect(lastAxiosInstance().get).not.toHaveBeenCalled();
  });

  it('still cancels a hung bearer-token fetch when the signal aborts mid-call, even with timeoutMs: 0', async () => {
    const tokenGate = new Promise<string>(() => undefined);
    const client = new HttpClient(undefined, async () => tokenGate, { timeoutMs: 0 });
    client.setRetryConfig({ maxRetries: 0, delayMs: 0 });
    const controller = new AbortController();

    const request = client.makeGetRequest(
      'https://ledger.example/v2/version',
      { includeBearerToken: true },
      { signal: controller.signal }
    );
    await Promise.resolve();
    controller.abort(new Error('stop waiting for token'));

    // With timeoutMs: 0, only the abort listener bounds the wait; without the fix this would hang forever.
    await expect(request).rejects.toMatchObject({ name: 'AbortError', message: 'stop waiting for token' });
    expect(lastAxiosInstance().get).not.toHaveBeenCalled();
  });
});
