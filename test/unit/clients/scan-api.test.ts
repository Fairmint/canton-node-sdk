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

import {
  ScanApiClient,
  type GetDateOfFirstSnapshotAfterResponse,
  type ScanApiClientOptions,
} from '../../../src/clients/scan-api';
import { CantonRuntime, type ClientConfig } from '../../../src/core';

interface MockAxiosInstance {
  get: jest.Mock;
  post: jest.Mock;
  delete: jest.Mock;
  patch: jest.Mock;
}

function createClient(
  config: ClientConfig,
  options: ScanApiClientOptions = {}
): {
  client: ScanApiClient;
  mockAxiosInstance: MockAxiosInstance;
} {
  const client = new ScanApiClient(new CantonRuntime(config), options);
  // eslint-disable-next-line @typescript-eslint/unbound-method -- axios.create is a mocked function in this test module
  const mockResults = jest.mocked(axios.create).mock.results;
  const latestResultIndex = mockResults.length - 1;
  const latestResult = latestResultIndex >= 0 ? mockResults[latestResultIndex] : undefined;
  if (!latestResult) {
    throw new Error('Expected axios.create to be called');
  }

  return {
    client,
    mockAxiosInstance: latestResult.value as MockAxiosInstance,
  };
}

describe('ScanApiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws an actionable error when no public endpoints or runtime override are available', () => {
    expect(() => new ScanApiClient(new CantonRuntime({ network: 'staging' }))).toThrow(
      `No public scan endpoints configured for network 'staging'. Provide scanApiUrls explicitly.`
    );
  });

  it('falls back to the runtime SCAN_API config when the network has no built-in public endpoints', () => {
    const runtimeConfig: ClientConfig = {
      network: 'localnet',
      apis: {
        SCAN_API: {
          apiUrl: 'http://scan.localhost:4000/api/scan',
          auth: {
            grantType: 'client_credentials',
            clientId: 'unused-for-public-scan',
          },
        },
      },
    };

    const { client } = createClient(runtimeConfig);

    expect(client.getApiUrl()).toBe('http://scan.localhost:4000/api/scan');
  });

  it('rotates to the next scan endpoint after a transient failure and keeps the winner active', async () => {
    const { client, mockAxiosInstance } = createClient(
      { network: 'mainnet' },
      {
        scanApiUrls: ['https://scan-a.example/api/scan', 'https://scan-b.example/api/scan'],
      }
    );

    mockAxiosInstance.get
      .mockRejectedValueOnce(new Error('first endpoint unavailable'))
      .mockResolvedValueOnce({ data: { endpoint: 'scan-b' } })
      .mockResolvedValueOnce({ data: { endpoint: 'scan-b-again' } });

    await expect(
      client.makeGetRequest<{ endpoint: string }>('https://scan-a.example/api/scan/v0/scan/health')
    ).resolves.toEqual({ endpoint: 'scan-b' });

    await expect(
      client.makeGetRequest<{ endpoint: string }>('https://scan-a.example/api/scan/v0/scan/health')
    ).resolves.toEqual({ endpoint: 'scan-b-again' });

    const requestedUrls = mockAxiosInstance.get.mock.calls.map((call) => call[0] as string);
    expect(requestedUrls).toEqual([
      'https://scan-a.example/api/scan/v0/scan/health',
      'https://scan-b.example/api/scan/v0/scan/health',
      'https://scan-b.example/api/scan/v0/scan/health',
    ]);
  });

  it('gets token metadata instruments from the direct scan endpoint', async () => {
    const { client, mockAxiosInstance } = createClient(
      { network: 'mainnet' },
      {
        scanApiUrls: ['https://scan.example/api/scan'],
      }
    );

    mockAxiosInstance.get.mockResolvedValueOnce({
      data: {
        id: 'Amulet/USD',
        name: 'Amulet',
        symbol: 'AMT',
        decimals: 10,
        totalSupply: null,
        totalSupplyAsOf: null,
        supportedApis: {},
      },
    });

    const instrument = await client.getInstrument({ instrumentId: 'Amulet/USD' });

    expect(instrument).toMatchObject({
      id: 'Amulet/USD',
      symbol: 'AMT',
    });
    expect(instrument.totalSupply).toBeUndefined();
    expect(instrument.totalSupplyAsOf).toBeUndefined();

    expect(mockAxiosInstance.get.mock.calls[0]?.[0]).toBe(
      'https://scan.example/registry/metadata/v1/instruments/Amulet%2FUSD'
    );
  });

  it('gets the first snapshot after an exact boundary with the generated response envelope', async (): Promise<void> => {
    const { client, mockAxiosInstance } = createClient(
      { network: 'mainnet' },
      {
        scanApiUrls: ['https://scan.example/api/scan'],
      }
    );
    const response: GetDateOfFirstSnapshotAfterResponse = {
      record_time: '2026-07-10T12:00:01.123456Z',
    };
    mockAxiosInstance.get.mockResolvedValueOnce({ data: response });

    const result = await client.getDateOfFirstSnapshotAfter({
      after: '2026-07-10T12:00:00.000Z',
      migrationId: 7,
    });
    const typedResult: GetDateOfFirstSnapshotAfterResponse = result;

    expect(typedResult).toEqual(response);
    expect(mockAxiosInstance.get.mock.calls[0]?.[0]).toBe(
      'https://scan.example/api/scan/v0/state/acs/snapshot-timestamp-after?after=2026-07-10T12%3A00%3A00.000Z&migration_id=7'
    );
  });

  it('rejects invalid snapshot-after query parameters before sending a request', async (): Promise<void> => {
    const { client, mockAxiosInstance } = createClient(
      { network: 'mainnet' },
      {
        scanApiUrls: ['https://scan.example/api/scan'],
      }
    );

    await expect(
      client.getDateOfFirstSnapshotAfter({
        after: 'July 10, 2026',
        migrationId: 7,
      })
    ).rejects.toThrow('Parameter validation failed');
    await expect(
      client.getDateOfFirstSnapshotAfter({
        after: '2026-07-10T12:00:00Z',
        migrationId: Number.MAX_SAFE_INTEGER + 1,
      })
    ).rejects.toThrow('Parameter validation failed');

    expect(mockAxiosInstance.get).not.toHaveBeenCalled();
  });

  it('rejects an invalid snapshot timestamp response envelope', async (): Promise<void> => {
    const { client, mockAxiosInstance } = createClient(
      { network: 'mainnet' },
      {
        scanApiUrls: ['https://scan.example/api/scan'],
      }
    );
    mockAxiosInstance.get
      .mockResolvedValueOnce({
        data: { record_time: 'not-an-openapi-date-time' },
      })
      .mockResolvedValueOnce({
        data: { record_time: '2026-07-10T12:00:01Z', unexpected: true },
      });

    await expect(
      client.getDateOfFirstSnapshotAfter({
        after: '2026-07-10T12:00:00Z',
        migrationId: 7,
      })
    ).rejects.toThrow();
    await expect(
      client.getDateOfFirstSnapshotAfter({
        after: '2026-07-10T12:00:00Z',
        migrationId: 7,
      })
    ).rejects.toThrow();
  });

  it('rotates token metadata registry requests across scan endpoints', async () => {
    const { client, mockAxiosInstance } = createClient(
      { network: 'mainnet' },
      {
        scanApiUrls: ['https://scan-a.example/api/scan', 'https://scan-b.example/api/scan'],
      }
    );

    mockAxiosInstance.get.mockRejectedValueOnce(new Error('first endpoint unavailable')).mockResolvedValueOnce({
      data: {
        id: 'Amulet',
        name: 'Amulet',
        symbol: 'AMT',
        decimals: 10,
        supportedApis: {},
      },
    });

    await expect(client.getInstrument({ instrumentId: 'Amulet' })).resolves.toMatchObject({
      id: 'Amulet',
      symbol: 'AMT',
    });

    const requestedUrls = mockAxiosInstance.get.mock.calls.map((call) => call[0] as string);
    expect(requestedUrls).toEqual([
      'https://scan-a.example/registry/metadata/v1/instruments/Amulet',
      'https://scan-b.example/registry/metadata/v1/instruments/Amulet',
    ]);
    expect(client.getApiUrl()).toBe('https://scan-b.example/api/scan');
  });
});
