import axios from 'axios';

jest.mock('axios', () => {
  const actual = jest.requireActual('axios');
  return {
    ...actual,
    create: jest.fn(() => ({
      get: jest.fn(),
      post: jest.fn(),
      delete: jest.fn(),
      patch: jest.fn(),
      defaults: { headers: { common: {} } },
    })),
    isAxiosError: actual.isAxiosError,
  };
});

import { ValidatorApiClient } from '../../../src';
import { CantonRuntime, type ClientConfig } from '../../../src/core';

interface MockAxiosInstance {
  get: jest.Mock;
}

function createClient(): { client: ValidatorApiClient; mockAxiosInstance: MockAxiosInstance } {
  const config: ClientConfig = {
    network: 'localnet',
    authUrl: 'https://auth.example',
    apis: {
      VALIDATOR_API: {
        apiUrl: 'http://localhost:3903',
        auth: {
          grantType: 'client_credentials',
          clientId: 'validator-client',
          clientSecret: 'secret',
        },
      },
    },
  };

  const client = new ValidatorApiClient(new CantonRuntime(config));
  // eslint-disable-next-line @typescript-eslint/unbound-method -- axios.create is a mocked function in this test module
  const mockResults = jest.mocked(axios.create).mock.results;
  const latestResult = mockResults[mockResults.length - 1];
  if (!latestResult) {
    throw new Error('Expected axios.create to be called');
  }

  return {
    client,
    mockAxiosInstance: latestResult.value as MockAxiosInstance,
  };
}

describe('ValidatorApiClient health checks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls validator readyz without bearer auth', async () => {
    const { client, mockAxiosInstance } = createClient();
    mockAxiosInstance.get.mockResolvedValueOnce({ data: undefined });

    await expect(client.isReady()).resolves.toBeUndefined();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith('http://localhost:3903/api/validator/readyz', {
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('calls validator livez without bearer auth', async () => {
    const { client, mockAxiosInstance } = createClient();
    mockAxiosInstance.get.mockResolvedValueOnce({ data: undefined });

    await expect(client.isLive()).resolves.toBeUndefined();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith('http://localhost:3903/api/validator/livez', {
      headers: { 'Content-Type': 'application/json' },
    });
  });
});
