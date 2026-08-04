import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { CantonRuntime, LedgerJsonApiClient, type ClientConfig } from '../../../src';
import { NetworkError } from '../../../src/core/errors';

/** Auth server that accepts the connection and then behaves like a hung OAuth2 token endpoint. */
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

function createClientConfig(authUrl: string, timeoutMs: number): ClientConfig {
  return {
    network: 'localnet',
    authUrl,
    timeoutMs,
    apis: {
      LEDGER_JSON_API: {
        apiUrl: 'https://ledger.example',
        auth: {
          grantType: 'client_credentials',
          clientId: 'client',
          clientSecret: 'secret',
        },
      },
    },
  };
}

describe('BaseClient.authenticate() against a silent auth server', () => {
  it('rejects instead of awaiting forever when the auth server never responds', async () => {
    const server = await startServer(() => {
      // Accept the request and never write a response, like a hung auth server.
    });
    try {
      const client = new LedgerJsonApiClient(new CantonRuntime(createClientConfig(server.url, 250)));

      const startedAt = Date.now();
      await expect(client.authenticate()).rejects.toThrow(NetworkError);
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
      const client = new LedgerJsonApiClient(new CantonRuntime(createClientConfig(server.url, 300)));

      await expect(client.authenticate()).rejects.toThrow(/Authentication request timed out after 300ms/u);
    } finally {
      await server.close();
    }
  });

  it('bounds concurrent callers waiting on the same in-flight request', async () => {
    let requestCount = 0;
    const server = await startServer(() => {
      requestCount += 1;
      // Accept the request and never write a response.
    });
    try {
      const runtime = new CantonRuntime(createClientConfig(server.url, 250));
      const client = new LedgerJsonApiClient(runtime);
      const other = new LedgerJsonApiClient(runtime);

      const startedAt = Date.now();
      await expect(Promise.all([client.authenticate(), other.authenticate()])).rejects.toThrow(NetworkError);
      expect(Date.now() - startedAt).toBeLessThan(5000);

      // Both callers must have shared the same in-flight request instead of each triggering their own.
      expect(requestCount).toBe(1);
    } finally {
      await server.close();
    }
  });

  it('clears the internal auth timeout timer as soon as the caller aborts, instead of leaking it for the full timeout', async () => {
    const server = await startServer(() => {
      // Accept the request and never write a response, like a hung auth server.
    });
    try {
      jest.useFakeTimers();
      try {
        const client = new LedgerJsonApiClient(new CantonRuntime(createClientConfig(server.url, 600_000)));
        const controller = new AbortController();

        const request = client.authenticate(controller.signal);
        await Promise.resolve();
        // The internal `setTimeout` guarding the auth call (default 600_000ms) is now armed.
        expect(jest.getTimerCount()).toBeGreaterThan(0);

        controller.abort(new Error('stop waiting for auth'));
        await expect(request).rejects.toMatchObject({ name: 'AbortError', message: 'stop waiting for auth' });

        // Abort must clear the timer immediately rather than leaving a live handle for the full timeoutMs.
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        jest.useRealTimers();
      }
    } finally {
      await server.close();
    }
  });
});
