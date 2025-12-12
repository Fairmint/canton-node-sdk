import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { LedgerJsonApiClient } from '../../../src';

describe('LocalNet GetVersion', () => {
  it('getVersion', async () => {
    // This is an integration-style test (auth + HTTP), but it does not require a real LocalNet.
    // It spins up a local HTTP server to validate that the SDK can authenticate and call /v2/version.
    const expectedResponse = {
      version: '3.3.0-SNAPSHOT',
      features: {
        experimental: {
          staticTime: {
            supported: false,
          },
          commandInspectionService: {
            supported: true,
          },
        },
        userManagement: {
          supported: true,
          maxRightsPerUser: 1000,
          maxUsersPageSize: 1000,
        },
        partyManagement: {
          maxPartiesPageSize: 10000,
        },
        offsetCheckpoint: {
          maxOffsetCheckpointEmissionDelay: {
            seconds: 75,
            nanos: 0,
            unknownFields: {
              fields: {},
            },
          },
        },
      },
    } as const;

    const token = 'test-access-token';

    const server = http.createServer((req, res) => {
      if (!req.url) {
        res.statusCode = 400;
        res.end();
        return;
      }

      // AuthenticationManager posts to `${authUrl}/` and expects a JSON body with `access_token`.
      if (req.method === 'POST' && req.url === '/oauth/token/') {
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.end(JSON.stringify({ access_token: token, token_type: 'Bearer', expires_in: 3600 }));
        return;
      }

      if (req.method === 'GET' && req.url === '/v2/version') {
        const authHeader = req.headers.authorization ?? '';
        if (authHeader !== `Bearer ${token}`) {
          res.statusCode = 401;
          res.end();
          return;
        }

        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.end(JSON.stringify(expectedResponse));
        return;
      }

      res.statusCode = 404;
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;

    const client = new LedgerJsonApiClient({
      network: 'localnet',
      authUrl: `http://127.0.0.1:${address.port}/oauth/token`,
      apis: {
        LEDGER_JSON_API: {
          apiUrl: `http://127.0.0.1:${address.port}`,
          auth: {
            grantType: 'client_credentials',
            clientId: 'test-client',
            clientSecret: 'test-secret',
          },
        },
      },
    });

    try {
      const response = await client.getVersion();
      expect(response).toEqual(expectedResponse);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
