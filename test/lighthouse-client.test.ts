import { ClientFactory } from '../src';
import { LighthouseApiClient } from '../src/clients/lighthouse-api';

describe('LighthouseApiClient', () => {
  it('should create a client with simplified configuration', () => {
    const config = {
      network: 'mainnet' as const,
      apis: {
        LIGHTHOUSE_API: {
          apiUrl: 'https://lighthouse.fivenorth.io/api',
        },
      },
    };

    const client = ClientFactory.createClient('LIGHTHOUSE_API', config);

    expect(client).toBeInstanceOf(LighthouseApiClient);
    expect(client.getApiUrl()).toBe('https://lighthouse.fivenorth.io/api');
    expect(client.getNetwork()).toBe('mainnet');
  });

  it('should create a client without provider configuration', () => {
    const config = {
      network: 'mainnet' as const,
      apis: {
        LIGHTHOUSE_API: {
          apiUrl: 'https://lighthouse.fivenorth.io/api',
        },
      },
    };

    const client = ClientFactory.createClient('LIGHTHOUSE_API', config);

    expect(client).toBeInstanceOf(LighthouseApiClient);
    expect(client.getApiUrl()).toBe('https://lighthouse.fivenorth.io/api');
  });
});
