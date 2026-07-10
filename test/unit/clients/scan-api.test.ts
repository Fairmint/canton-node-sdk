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
      after: '2026-07-10T12:00:00.123456Z',
      migrationId: 7,
    });
    const typedResult: GetDateOfFirstSnapshotAfterResponse = result;

    expect(typedResult).toEqual(response);
    expect(mockAxiosInstance.get.mock.calls[0]?.[0]).toBe(
      'https://scan.example/api/scan/v0/state/acs/snapshot-timestamp-after?after=2026-07-10T12%3A00%3A00.123456Z&migration_id=7'
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

  it('gets registry metadata information from the direct scan host root', async () => {
    const { client, mockAxiosInstance } = createClient(
      { network: 'mainnet' },
      {
        scanApiUrls: ['https://scan.example/api/scan'],
      }
    );

    mockAxiosInstance.get.mockResolvedValueOnce({
      data: {
        adminId: 'registry::1220',
        supportedApis: {
          'splice-api-token-metadata-v1': 1,
        },
      },
    });

    await expect(client.getRegistryInfo()).resolves.toEqual({
      adminId: 'registry::1220',
      supportedApis: {
        'splice-api-token-metadata-v1': 1,
      },
    });

    expect(mockAxiosInstance.get.mock.calls[0]?.[0]).toBe('https://scan.example/registry/metadata/v1/info');
  });

  it('lists instruments with encoded pagination and normalizes nullable optional fields', async () => {
    const { client, mockAxiosInstance } = createClient(
      { network: 'mainnet' },
      {
        scanApiUrls: ['https://scan.example/api/scan'],
      }
    );

    mockAxiosInstance.get.mockResolvedValueOnce({
      data: {
        instruments: [
          {
            id: 'Amulet',
            name: 'Amulet',
            symbol: 'AMT',
            decimals: 10,
            totalSupply: null,
            totalSupplyAsOf: null,
            supportedApis: {},
          },
          {
            id: 'Amulet/USD',
            name: 'Amulet USD',
            symbol: 'AMT/USD',
            decimals: 10,
            totalSupply: '42.0',
            totalSupplyAsOf: '2026-07-09T12:00:00Z',
            supportedApis: {},
          },
        ],
        nextPageToken: 'next/page + 2',
      },
    });

    const response = await client.listInstruments({
      pageSize: 25,
      pageToken: 'Amulet/USD + next',
    });

    expect(response.instruments[0]?.totalSupply).toBeUndefined();
    expect(response.instruments[0]?.totalSupplyAsOf).toBeUndefined();
    expect(response.instruments[1]?.totalSupply).toBe('42.0');
    expect(response.instruments[1]?.totalSupplyAsOf).toBe('2026-07-09T12:00:00Z');
    expect(response.nextPageToken).toBe('next/page + 2');
    expect(mockAxiosInstance.get.mock.calls[0]?.[0]).toBe(
      'https://scan.example/registry/metadata/v1/instruments?pageSize=25&pageToken=Amulet%2FUSD+%2B+next'
    );
  });

  it('preserves explicit zero and empty pagination values', async () => {
    const { client, mockAxiosInstance } = createClient(
      { network: 'mainnet' },
      {
        scanApiUrls: ['https://scan.example/api/scan'],
      }
    );

    mockAxiosInstance.get.mockResolvedValueOnce({
      data: {
        instruments: [],
        nextPageToken: null,
      },
    });

    await expect(client.listInstruments({ pageSize: 0, pageToken: '' })).resolves.toEqual({ instruments: [] });
    expect(mockAxiosInstance.get.mock.calls[0]?.[0]).toBe(
      'https://scan.example/registry/metadata/v1/instruments?pageSize=0&pageToken='
    );
  });

  it('rejects non-integer and negative instrument page sizes before making a request', async () => {
    const { client, mockAxiosInstance } = createClient(
      { network: 'mainnet' },
      {
        scanApiUrls: ['https://scan.example/api/scan'],
      }
    );

    await expect(client.listInstruments({ pageSize: 1.5 })).rejects.toThrow('Parameter validation failed');
    await expect(client.listInstruments({ pageSize: -1 })).rejects.toThrow('Parameter validation failed');
    expect(mockAxiosInstance.get).not.toHaveBeenCalled();
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

  it('rotates list-instruments requests across scan endpoints', async () => {
    const { client, mockAxiosInstance } = createClient(
      { network: 'mainnet' },
      {
        scanApiUrls: ['https://scan-a.example/api/scan', 'https://scan-b.example/api/scan'],
      }
    );

    mockAxiosInstance.get
      .mockRejectedValueOnce(new Error('first endpoint unavailable'))
      .mockResolvedValueOnce({ data: { instruments: [] } });

    await expect(client.listInstruments({})).resolves.toEqual({ instruments: [] });

    const requestedUrls = mockAxiosInstance.get.mock.calls.map((call) => call[0] as string);
    expect(requestedUrls).toEqual([
      'https://scan-a.example/registry/metadata/v1/instruments',
      'https://scan-b.example/registry/metadata/v1/instruments',
    ]);
    expect(client.getApiUrl()).toBe('https://scan-b.example/api/scan');
  });

  it('gets an allocation factory from an arbitrary Token Standard registry without auth', async () => {
    const { client, mockAxiosInstance } = createClient(
      { network: 'mainnet' },
      {
        scanApiUrls: ['https://scan.example/api/scan'],
      }
    );
    const choiceArguments = {
      settlement: { id: 'settlement-3' },
      extraArgs: { context: { values: {} }, meta: { values: {} } },
    };
    const response = {
      factoryId: '#allocation-factory',
      choiceContext: {
        choiceContextData: { values: {} },
        disclosedContracts: [],
      },
    };
    mockAxiosInstance.post.mockResolvedValueOnce({ data: response });

    await expect(
      client.getAllocationFactoryFromRegistry({
        registryUrl: 'https://cash-token.example/token-registry/',
        choiceArguments,
      })
    ).resolves.toEqual(response);

    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      'https://cash-token.example/token-registry/registry/allocation-instruction/v1/allocation-factory',
      {
        choiceArguments,
        excludeDebugFields: false,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    const requestHeaders = mockAxiosInstance.post.mock.calls[0]?.[2]?.headers;
    expect(requestHeaders).not.toHaveProperty('Authorization');
  });

  it('gets a V2 allocation factory from its dedicated registry endpoint without auth', async () => {
    const { client, mockAxiosInstance } = createClient(
      { network: 'mainnet' },
      {
        scanApiUrls: ['https://scan.example/api/scan'],
      }
    );
    const choiceArguments = {
      settlement: { id: 'settlement-3' },
      extraArgs: { context: { values: {} }, meta: { values: {} } },
    };
    const response = {
      factoryId: '#allocation-factory-v2',
      choiceContext: {
        choiceContextData: { values: {} },
        disclosedContracts: [],
      },
    };
    mockAxiosInstance.post.mockResolvedValueOnce({ data: response });

    await expect(
      client.getAllocationFactoryV2FromRegistry({
        registryUrl: 'https://cash-token.example/token-registry/',
        choiceArguments,
      })
    ).resolves.toEqual(response);

    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      'https://cash-token.example/token-registry/registry/allocation-instruction/v2/allocation-factory',
      {
        choiceArguments,
        excludeDebugFields: false,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    const requestHeaders = mockAxiosInstance.post.mock.calls[0]?.[2]?.headers;
    expect(requestHeaders).not.toHaveProperty('Authorization');
  });

  it('gets a V2 settlement factory from a canonical arbitrary registry URL without auth', async () => {
    const { client, mockAxiosInstance } = createClient(
      { network: 'mainnet' },
      {
        scanApiUrls: ['https://scan.example/api/scan'],
      }
    );
    const choiceArguments = {
      settlement: {
        executors: ['VenueOperator::1220venue'],
        id: 'settlement-42',
        cid: null,
        meta: { values: {} },
      },
      transferLegs: [],
      allocations: [],
      actors: ['VenueOperator::1220venue'],
      extraArgs: { context: { values: {} }, meta: { values: {} } },
    };
    const response = {
      factoryId: '#settlement-factory',
      choiceContext: {
        choiceContextData: { values: {} },
        disclosedContracts: [],
      },
    };
    mockAxiosInstance.post.mockResolvedValueOnce({ data: response });

    await expect(
      client.getSettlementFactoryFromRegistry({
        registryUrl: 'https://registry-user:registry-password@asset.example/token-registry///?source=scan#registry',
        choiceArguments,
      })
    ).resolves.toEqual(response);

    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      'https://asset.example/token-registry/registry/allocation/v2/settlement-factory',
      {
        choiceArguments,
        excludeDebugFields: false,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    const requestHeaders = mockAxiosInstance.post.mock.calls[0]?.[2]?.headers;
    expect(requestHeaders).not.toHaveProperty('Authorization');
  });

  it('strips embedded credentials and normalizes trailing slashes from registry URLs', async () => {
    const { client, mockAxiosInstance } = createClient(
      { network: 'mainnet' },
      {
        scanApiUrls: ['https://scan.example/api/scan'],
      }
    );
    mockAxiosInstance.post.mockResolvedValueOnce({
      data: {
        factoryId: '#allocation-factory',
        choiceContext: {
          choiceContextData: { values: {} },
          disclosedContracts: [],
        },
      },
    });

    await client.getAllocationFactoryFromRegistry({
      registryUrl: 'https://registry-user:registry-password@cash-token.example/token-registry///',
      choiceArguments: {},
    });

    expect(mockAxiosInstance.post.mock.calls[0]?.[0]).toBe(
      'https://cash-token.example/token-registry/registry/allocation-instruction/v1/allocation-factory'
    );
  });

  it('rejects a malformed or non-http registry URL before making a request', async () => {
    const { client, mockAxiosInstance } = createClient(
      { network: 'mainnet' },
      {
        scanApiUrls: ['https://scan.example/api/scan'],
      }
    );

    await expect(
      client.getAllocationFactoryFromRegistry({
        registryUrl: 'not-a-url',
        choiceArguments: {},
      })
    ).rejects.toThrow('Parameter validation failed');
    await expect(
      client.getAllocationFactoryFromRegistry({
        registryUrl: 'file:///tmp/token-registry',
        choiceArguments: {},
      })
    ).rejects.toThrow('registryUrl must use http or https');
    expect(mockAxiosInstance.post).not.toHaveBeenCalled();
  });
});
