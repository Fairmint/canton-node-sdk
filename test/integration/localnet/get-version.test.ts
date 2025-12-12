import * as http from 'http';
import { LedgerJsonApiClient } from '../../../src';

interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

function json(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function startTestServer(): Promise<TestServer> {
  const server = http.createServer((req, res) => {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    // OAuth2 token endpoint (cn-quickstart / localnet default)
    if (
      method === 'POST' &&
      (url.pathname === '/realms/AppProvider/protocol/openid-connect/token' ||
        url.pathname === '/realms/AppProvider/protocol/openid-connect/token/')
    ) {
      // Drain request body (form-urlencoded), then return a minimal valid token response
      req.on('data', () => undefined);
      req.on('end', () => {
        json(res, 200, { access_token: 'test-token', token_type: 'Bearer', expires_in: 3600 });
      });
      return;
    }

    // Ledger JSON API: /v2/version
    if (method === 'GET' && url.pathname === '/v2/version') {
      json(res, 200, {
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
      });
      return;
    }

    json(res, 404, { error: 'not_found', method, path: url.pathname });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind test server');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

describe('LocalNet GetVersion', () => {
  let server: TestServer;
  let client: LedgerJsonApiClient;

  beforeAll(async () => {
    server = await startTestServer();
    client = new LedgerJsonApiClient({
      network: 'localnet',
      authUrl: `${server.baseUrl}/realms/AppProvider/protocol/openid-connect/token`,
      apis: {
        LEDGER_JSON_API: {
          apiUrl: server.baseUrl,
          auth: {
            grantType: 'client_credentials',
            clientId: 'test-client',
            clientSecret: 'test-secret',
          },
        },
      },
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it('getVersion', async () => {
    const response = await client.getVersion();

    expect(response).toEqual({
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
    });
  });
});
