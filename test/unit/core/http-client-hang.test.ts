import { getEventListeners } from 'node:events';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { NetworkError } from '../../../src/core/errors';
import { HttpClient } from '../../../src/core/http/HttpClient';

/** Server that accepts the connection and then behaves like the Canton endpoint that caused the outage. */
async function startServer(onRequest: http.RequestListener): Promise<{ url: string; close: () => Promise<void> }> {
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

describe('HttpClient against a silent server', () => {
  it('rejects instead of awaiting forever when the server never responds', async () => {
    const server = await startServer(() => {
      // Accept the request and never write a response.
    });
    try {
      const client = new HttpClient(undefined, undefined, { timeoutMs: 250 });
      client.setRetryConfig({ maxRetries: 0, delayMs: 0 });

      const startedAt = Date.now();
      await expect(client.makeGetRequest(`${server.url}/v2/version`)).rejects.toThrow(NetworkError);
      expect(Date.now() - startedAt).toBeLessThan(5000);
    } finally {
      await server.close();
    }
  });

  it('reports the configured timeout in the error message', async () => {
    const server = await startServer(() => {
      // Accept the request and never write a response.
    });
    try {
      const client = new HttpClient(undefined, undefined, { timeoutMs: 10_000 });
      client.setRetryConfig({ maxRetries: 0, delayMs: 0 });

      await expect(client.makeGetRequest(`${server.url}/v2/version`, { timeoutMs: 250 })).rejects.toThrow(
        /Request timed out after 250ms without response data/u
      );
    } finally {
      await server.close();
    }
  });

  it('redacts sensitive query parameters from a timeout error message', async () => {
    const server = await startServer(() => {
      // Accept the request and never write a response.
    });
    try {
      const client = new HttpClient(undefined, undefined, { timeoutMs: 250 });
      client.setRetryConfig({ maxRetries: 0, delayMs: 0 });

      let caught: unknown;
      try {
        await client.makeGetRequest(`${server.url}/v2/version?token=super-secret-value`);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(NetworkError);
      expect((caught as Error).message).not.toContain('super-secret-value');
    } finally {
      await server.close();
    }
  });

  it('honors an AbortSignal deadline while the socket keeps trickling data', async () => {
    // The inactivity timer never fires here because bytes keep arriving; only a hard deadline can stop this request.
    const timers: Array<ReturnType<typeof setInterval>> = [];
    const server = await startServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.write('[');
      timers.push(
        setInterval(() => {
          response.write(' ');
        }, 20)
      );
    });
    try {
      const client = new HttpClient(undefined, undefined, { timeoutMs: 60_000 });
      client.setRetryConfig({ maxRetries: 0, delayMs: 0 });

      const startedAt = Date.now();
      await expect(
        client.makeGetRequest(`${server.url}/v2/state/active-contracts`, {}, { signal: AbortSignal.timeout(300) })
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(Date.now() - startedAt).toBeLessThan(5000);
    } finally {
      for (const timer of timers) clearInterval(timer);
      await server.close();
    }
  });

  it('does not retry a socket-timeout read across the full retry budget, bounding the total wait to roughly one timeoutMs', async () => {
    let requestCount = 0;
    const server = await startServer(() => {
      requestCount += 1;
      // Accept every connection and never write a response, like a consistently silent endpoint.
    });
    try {
      const timeoutMs = 250;
      const client = new HttpClient(undefined, undefined, { timeoutMs });
      // A generous retry budget: if timeouts were retried like other transient failures, this would multiply the
      // wait to roughly (maxRetries + 1) * timeoutMs instead of bounding it to roughly one timeoutMs.
      client.setRetryConfig({ maxRetries: 3, delayMs: 0 });

      const startedAt = Date.now();
      await expect(client.makeGetRequest(`${server.url}/v2/version`)).rejects.toThrow(NetworkError);
      const elapsedMs = Date.now() - startedAt;

      // A modest multiplier over the configured timeout is fine, but 4x (one attempt per retry budget slot) is not.
      expect(elapsedMs).toBeLessThan(timeoutMs * 2);
      expect(requestCount).toBe(1);
    } finally {
      await server.close();
    }
  });

  it('does not retry a bearer-token timeout across the full retry budget, bounding the total wait to roughly one timeoutMs', async () => {
    let tokenAttempts = 0;
    const timeoutMs = 250;
    const client = new HttpClient(
      undefined,
      async () => {
        tokenAttempts += 1;
        // A silent auth endpoint: never resolves, so fetchBearerToken's own timer is what fires.
        return new Promise<string>(() => undefined);
      },
      { timeoutMs }
    );
    // A generous retry budget: if the auth timeout were retried like other transient failures, this would
    // multiply the wait to roughly (maxRetries + 1) * timeoutMs instead of bounding it to roughly one timeoutMs.
    client.setRetryConfig({ maxRetries: 3, delayMs: 0 });

    const startedAt = Date.now();
    await expect(
      client.makeGetRequest('https://ledger.example/v2/version', { includeBearerToken: true })
    ).rejects.toThrow(NetworkError);
    const elapsedMs = Date.now() - startedAt;

    expect(elapsedMs).toBeLessThan(timeoutMs * 2);
    expect(tokenAttempts).toBe(1);
  });

  it('does not leak abort listeners on repeated successful bearer-token fetches', async () => {
    const server = await startServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{}');
    });
    try {
      const client = new HttpClient(undefined, async () => 'token', { timeoutMs: 5000 });
      client.setRetryConfig({ maxRetries: 0, delayMs: 0 });
      const { signal } = new AbortController();

      for (let i = 0; i < 5; i += 1) {
        await client.makeGetRequest(`${server.url}/v2/version`, { includeBearerToken: true }, { signal });
      }

      expect(getEventListeners(signal, 'abort')).toHaveLength(0);
    } finally {
      await server.close();
    }
  });
});
