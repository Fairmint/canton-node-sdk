import axios from 'axios';

jest.mock('axios', () => {
  const actual = jest.requireActual<typeof import('axios')>('axios');
  return {
    ...actual,
    create: jest.fn(() => ({
      get: jest.fn(),
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

function createClientConfig(overrides: Partial<ClientConfig> = {}, apiTimeoutMs?: number): ClientConfig {
  return {
    network: 'localnet',
    authUrl: 'https://auth.example',
    ...overrides,
    apis: {
      LEDGER_JSON_API: {
        apiUrl: 'https://ledger.example',
        auth,
        ...(apiTimeoutMs === undefined ? {} : { timeoutMs: apiTimeoutMs }),
      },
    },
  };
}

function createdTimeouts(): number[] {
  return (axios.create as jest.Mock).mock.calls.map(([config]) => (config as { timeout: number }).timeout);
}

describe('client timeout configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the default timeout when none is configured', () => {
    new LedgerJsonApiClient(new CantonRuntime(createClientConfig()));

    expect(createdTimeouts()).toEqual([DEFAULT_HTTP_TIMEOUT_MS]);
  });

  it('applies a client-wide timeout', () => {
    new LedgerJsonApiClient(new CantonRuntime(createClientConfig({ timeoutMs: 30_000 })));

    expect(createdTimeouts()).toEqual([30_000]);
  });

  it('prefers a per-API timeout over the client-wide timeout', () => {
    new LedgerJsonApiClient(new CantonRuntime(createClientConfig({ timeoutMs: 30_000 }, 5_000)));

    expect(createdTimeouts()).toEqual([5_000]);
  });

  it('propagates the Canton-level timeout to every service client', () => {
    new Canton({
      network: 'localnet',
      authUrl: 'https://auth.example',
      timeoutMs: 45_000,
      apis: {
        LEDGER_JSON_API: { apiUrl: 'https://ledger.example', auth },
        VALIDATOR_API: { apiUrl: 'https://validator.example', auth },
        SCAN_API: { apiUrl: 'https://scan.example', auth },
      },
    });

    expect(createdTimeouts()).toEqual([45_000, 45_000, 45_000]);
  });
});
