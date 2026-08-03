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
    const client = new HttpClient(undefined, undefined, { timeoutMs: 250 });
    client.setRetryConfig({ maxRetries: 0, delayMs: 0 });

    const startedAt = Date.now();
    await expect(client.makeGetRequest(`${server.url}/v2/version`)).rejects.toThrow(NetworkError);
    expect(Date.now() - startedAt).toBeLessThan(5000);

    await server.close();
  });

  it('reports the configured timeout in the error message', async () => {
    const server = await startServer(() => {
      // Accept the request and never write a response.
    });
    const client = new HttpClient(undefined, undefined, { timeoutMs: 10_000 });
    client.setRetryConfig({ maxRetries: 0, delayMs: 0 });

    await expect(client.makeGetRequest(`${server.url}/v2/version`, { timeoutMs: 250 })).rejects.toThrow(
      /Request timed out after 250ms without response data/u
    );

    await server.close();
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
    const client = new HttpClient(undefined, undefined, { timeoutMs: 60_000 });
    client.setRetryConfig({ maxRetries: 0, delayMs: 0 });

    const startedAt = Date.now();
    await expect(
      client.makeGetRequest(`${server.url}/v2/state/active-contracts`, {}, { signal: AbortSignal.timeout(300) })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(Date.now() - startedAt).toBeLessThan(5000);

    for (const timer of timers) clearInterval(timer);
    await server.close();
  });
});
