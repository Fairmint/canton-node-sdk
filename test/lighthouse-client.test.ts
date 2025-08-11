import { LighthouseApiClient } from '../src/clients/lighthouse-api';
import { ClientConfig } from '../src/core';

describe('LighthouseApiClient', () => {
  it('should create a client with simplified configuration', () => {
    const config: ClientConfig = {
      network: 'mainnet' as const,
      apis: {
        LIGHTHOUSE_API: {
          apiUrl: 'https://lighthouse.fivenorth.io/api',
        },
      },
    };

    const client = new LighthouseApiClient(config);

    expect(client).toBeInstanceOf(LighthouseApiClient);
    expect(client.getApiUrl()).toBe('https://lighthouse.fivenorth.io/api');
    expect(client.getNetwork()).toBe('mainnet');
  });

  it('should create a client without provider configuration', () => {
    const config: ClientConfig = {
      network: 'mainnet' as const,
      apis: {
        LIGHTHOUSE_API: {
          apiUrl: 'https://lighthouse.fivenorth.io/api',
        },
      },
    };

    const client = new LighthouseApiClient(config);

    expect(client).toBeInstanceOf(LighthouseApiClient);
    expect(client.getApiUrl()).toBe('https://lighthouse.fivenorth.io/api');
  });

  it('should have the getTransferAgent method', () => {
    const config: ClientConfig = {
      network: 'mainnet' as const,
      apis: {
        LIGHTHOUSE_API: {
          apiUrl: 'https://lighthouse.fivenorth.io/api',
        },
      },
    };

    const client = new LighthouseApiClient(config);

    expect(typeof client.getTransferAgent).toBe('function');
  });
});
