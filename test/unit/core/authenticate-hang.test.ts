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
    const client = new LedgerJsonApiClient(new CantonRuntime(createClientConfig(server.url, 250)));

    const startedAt = Date.now();
    await expect(client.authenticate()).rejects.toThrow(NetworkError);
    expect(Date.now() - startedAt).toBeLessThan(5000);

    await server.close();
  });

  it('reports the configured timeout in the error message', async () => {
    const server = await startServer(() => {
      // Accept the request and never write a response.
    });
    const client = new LedgerJsonApiClient(new CantonRuntime(createClientConfig(server.url, 300)));

    await expect(client.authenticate()).rejects.toThrow(/Authentication request timed out after 300ms/u);

    await server.close();
  });

  it('bounds concurrent callers waiting on the same in-flight request', async () => {
    const server = await startServer(() => {
      // Accept the request and never write a response.
    });
    const runtime = new CantonRuntime(createClientConfig(server.url, 250));
    const client = new LedgerJsonApiClient(runtime);
    const other = new LedgerJsonApiClient(runtime);

    const startedAt = Date.now();
    await expect(Promise.all([client.authenticate(), other.authenticate()])).rejects.toThrow(NetworkError);
    expect(Date.now() - startedAt).toBeLessThan(5000);

    await server.close();
  });
});
