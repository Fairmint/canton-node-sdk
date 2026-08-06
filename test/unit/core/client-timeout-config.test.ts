import axios from 'axios';

jest.mock('axios', () => {
  const actual = jest.requireActual<typeof import('axios')>('axios');
  return {
    ...actual,
    create: jest.fn(() => ({
      get: jest.fn().mockResolvedValue({ data: {} }),
      post: jest.fn(),
      delete: jest.fn(),
      patch: jest.fn(),
    })),
    isAxiosError: actual.isAxiosError,
    isCancel: actual.isCancel,
  };
});

import {
  Canton,
  CantonRuntime,
  DEFAULT_HTTP_TIMEOUT_MS,
  LedgerJsonApiClient,
  type ApiConfig,
  type ClientConfig,
} from '../../../src';

const auth: ApiConfig['auth'] = {
  grantType: 'client_credentials',
  clientId: 'client',
  clientSecret: 'secret',
};

function createClientConfig(overrides: Partial<ClientConfig> = {}): ClientConfig {
  return {
    network: 'localnet',
    authUrl: 'https://auth.example',
    ...overrides,
    apis: {
      LEDGER_JSON_API: {
        apiUrl: 'https://ledger.example',
        auth,
      },
    },
  };
}

interface MockAxiosInstance {
  readonly get: jest.Mock;
}

function lastAxiosInstance(): MockAxiosInstance {
  const { results } = (axios.create as jest.Mock).mock;
  const lastResult = results[results.length - 1] as { value?: MockAxiosInstance } | undefined;
  if (!lastResult?.value) throw new Error('Expected a client to create an axios instance.');
  return lastResult.value;
}

function timeoutOfLastGetCall(instance: MockAxiosInstance): number {
  const [, config] = instance.get.mock.calls[0] as [string, { timeout: number }];
  return config.timeout;
}

describe('client timeout configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the default timeout when none is configured', async () => {
    const client = new LedgerJsonApiClient(new CantonRuntime(createClientConfig()));
    await client.makeGetRequest('https://ledger.example/v2/version');

    expect(timeoutOfLastGetCall(lastAxiosInstance())).toBe(DEFAULT_HTTP_TIMEOUT_MS);
  });

  it('applies a client-wide timeout', async () => {
    const client = new LedgerJsonApiClient(new CantonRuntime(createClientConfig({ timeoutMs: 30_000 })));
    await client.makeGetRequest('https://ledger.example/v2/version');

    expect(timeoutOfLastGetCall(lastAxiosInstance())).toBe(30_000);
  });

  it('lets a per-request timeout override the client-wide timeout', async () => {
    const client = new LedgerJsonApiClient(new CantonRuntime(createClientConfig({ timeoutMs: 30_000 })));
    await client.makeGetRequest('https://ledger.example/v2/version', { timeoutMs: 5_000 });

    expect(timeoutOfLastGetCall(lastAxiosInstance())).toBe(5_000);
  });

  it('propagates the Canton-level timeout to every service client', async () => {
    const canton = new Canton({
      network: 'localnet',
      authUrl: 'https://auth.example',
      timeoutMs: 45_000,
      apis: {
        LEDGER_JSON_API: { apiUrl: 'https://ledger.example', auth },
        VALIDATOR_API: { apiUrl: 'https://validator.example', auth },
        SCAN_API: { apiUrl: 'https://scan.example', auth },
      },
    });

    await canton.ledger.makeGetRequest('https://ledger.example/v2/version');
    await canton.validator.makeGetRequest('https://validator.example/v2/version');
    await canton.scan.makeGetRequest('https://scan.example/v2/version');

    const timeouts = (axios.create as jest.Mock).mock.results.map((result) =>
      timeoutOfLastGetCall(result.value as MockAxiosInstance)
    );
    expect(timeouts).toEqual([45_000, 45_000, 45_000]);
  });
});
