import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { ProviderConfigENVFormat, NetworkType, ProviderType } from './types';
import { env, getApiUri, getApiClientId, getApiClientSecret } from '../../env';

// Load environment variables with fallback to parent directory
const currentEnvPath = '.env';
const parentEnvPath = path.join('..', '.env');

// Try to load from current directory first
let result = dotenv.config({ path: currentEnvPath });

// If no .env file found in current directory, try parent directory
if (result.error && fs.existsSync(parentEnvPath)) {
  result = dotenv.config({ path: parentEnvPath });

  if (result.error) {
    console.warn(
      'Failed to load .env file from parent directory:',
      result.error.message
    );
  }
}

export class ProviderConfig {
  constructor() {
    // No initialization needed for the new format
  }

  getCurrentNetwork(): NetworkType {
    const currentNetwork = env.CURRENT_NETWORK?.toLowerCase();
    if (currentNetwork === 'mainnet' || currentNetwork === 'devnet') {
      return currentNetwork;
    }
    throw new Error('Missing required environment variable: CURRENT_NETWORK');
  }

  getCurrentProvider(): ProviderType {
    const currentProvider = env.CURRENT_PROVIDER?.toLowerCase();
    if (currentProvider === 'intellect' || currentProvider === '5n') {
      return currentProvider;
    }
    throw new Error('Missing required environment variable: CURRENT_PROVIDER');
  }

  getProviderConfig(
    network?: NetworkType,
    provider?: ProviderType
  ): ProviderConfigENVFormat | null {
    const targetNetwork = network || this.getCurrentNetwork();
    const targetProvider = provider || this.getCurrentProvider();

    // Get user IDs for both APIs
    const jsonApiUserId = this.getUserId(targetNetwork, targetProvider);
    const validatorApiUserId = this.getUserId(targetNetwork, targetProvider);

    // Build configuration from individual environment variables
    const config: ProviderConfigENVFormat = {
      PROVIDER_NAME: `${targetProvider}_${targetNetwork}`,
      AUTH_URL: this.getAuthUrl(targetNetwork, targetProvider),
      JSON_API: {
        API_URL: this.getApiUri(
          'LEDGER_JSON_API',
          targetNetwork,
          targetProvider
        ),
        GRANT_TYPE: 'client_credentials',
        CLIENT_ID:
          this.getApiClientId(
            'LEDGER_JSON_API',
            targetNetwork,
            targetProvider
          ) || '',
        CLIENT_SECRET:
          this.getApiClientSecret(
            'LEDGER_JSON_API',
            targetNetwork,
            targetProvider
          ) || '',
        PARTY_ID: this.getPartyId(targetNetwork, targetProvider),
        ...(jsonApiUserId && { USER_ID: jsonApiUserId }),
      },
      VALIDATOR_API: {
        API_URL: this.getApiUri('VALIDATOR_API', targetNetwork, targetProvider),
        GRANT_TYPE: 'client_credentials',
        CLIENT_ID:
          this.getApiClientId('VALIDATOR_API', targetNetwork, targetProvider) ||
          '',
        CLIENT_SECRET:
          this.getApiClientSecret(
            'VALIDATOR_API',
            targetNetwork,
            targetProvider
          ) || '',
        PARTY_ID: this.getPartyId(targetNetwork, targetProvider),
        ...(validatorApiUserId && { USER_ID: validatorApiUserId }),
      },
      SCAN_API: {
        API_URL: this.getApiUri('SCAN_API', targetNetwork, targetProvider),
        GRANT_TYPE: 'client_credentials',
        CLIENT_ID:
          this.getApiClientId('SCAN_API', targetNetwork, targetProvider) || '',
        CLIENT_SECRET:
          this.getApiClientSecret('SCAN_API', targetNetwork, targetProvider) ||
          '',
      },
    };

    return config;
  }

  getApiSpecificConfig(
    apiType: 'JSON_API' | 'VALIDATOR_API' | 'SCAN_API',
    network?: NetworkType,
    provider?: ProviderType
  ): ProviderConfigENVFormat | null {
    const targetNetwork = network || this.getCurrentNetwork();
    const targetProvider = provider || this.getCurrentProvider();

    // Get user ID for the specific API
    const userId = this.getUserId(targetNetwork, targetProvider);

    // Build configuration for the specific API type only
    const config: ProviderConfigENVFormat = {
      PROVIDER_NAME: `${targetProvider}_${targetNetwork}`,
      AUTH_URL: this.getAuthUrl(targetNetwork, targetProvider),
      JSON_API:
        apiType === 'JSON_API'
          ? {
              API_URL: this.getApiUri(
                'LEDGER_JSON_API',
                targetNetwork,
                targetProvider
              ),
              GRANT_TYPE: 'client_credentials',
              CLIENT_ID:
                this.getApiClientId(
                  'LEDGER_JSON_API',
                  targetNetwork,
                  targetProvider
                ) || '',
              CLIENT_SECRET:
                this.getApiClientSecret(
                  'LEDGER_JSON_API',
                  targetNetwork,
                  targetProvider
                ) || '',
              PARTY_ID: this.getPartyId(targetNetwork, targetProvider),
              ...(userId && { USER_ID: userId }),
            }
          : {},
      VALIDATOR_API:
        apiType === 'VALIDATOR_API'
          ? {
              API_URL: this.getApiUri(
                'VALIDATOR_API',
                targetNetwork,
                targetProvider
              ),
              GRANT_TYPE: 'client_credentials',
              CLIENT_ID:
                this.getApiClientId(
                  'VALIDATOR_API',
                  targetNetwork,
                  targetProvider
                ) || '',
              CLIENT_SECRET:
                this.getApiClientSecret(
                  'VALIDATOR_API',
                  targetNetwork,
                  targetProvider
                ) || '',
              PARTY_ID: this.getPartyId(targetNetwork, targetProvider),
              ...(userId && { USER_ID: userId }),
            }
          : {},
      SCAN_API:
        apiType === 'SCAN_API'
          ? {
              API_URL: this.getApiUri(
                'SCAN_API',
                targetNetwork,
                targetProvider
              ),
              GRANT_TYPE: 'client_credentials',
              CLIENT_ID:
                this.getApiClientId(
                  'SCAN_API',
                  targetNetwork,
                  targetProvider
                ) || '',
              CLIENT_SECRET:
                this.getApiClientSecret(
                  'SCAN_API',
                  targetNetwork,
                  targetProvider
                ) || '',
            }
          : {},
    };

    return config;
  }

  private getAuthUrl(network: NetworkType, provider: ProviderType): string {
    const envKey = `CANTON_${network.toUpperCase()}_${provider.toUpperCase()}_AUTH_URL`;
    const url = process.env[envKey];
    if (!url) {
      throw new Error(`Missing required environment variable: ${envKey}`);
    }
    return url;
  }

  private getApiUri(
    apiType: string,
    network: NetworkType,
    provider: ProviderType
  ): string {
    return getApiUri(apiType, network, provider);
  }

  private getApiClientId(
    apiType: string,
    network: NetworkType,
    provider: ProviderType
  ): string | undefined {
    return getApiClientId(apiType, network, provider);
  }

  private getApiClientSecret(
    apiType: string,
    network: NetworkType,
    provider: ProviderType
  ): string | undefined {
    return getApiClientSecret(apiType, network, provider);
  }

  private getPartyId(network: NetworkType, provider: ProviderType): string {
    const envKey = `CANTON_${network.toUpperCase()}_${provider.toUpperCase()}_PARTY_ID`;
    const partyId = process.env[envKey];
    if (!partyId) {
      throw new Error(`Missing required environment variable: ${envKey}`);
    }
    return partyId;
  }

  private getUserId(
    network: NetworkType,
    provider: ProviderType
  ): string | undefined {
    const envKey = `CANTON_${network.toUpperCase()}_${provider.toUpperCase()}_USER_ID`;
    const userId = process.env[envKey];
    return userId || undefined;
  }

  getCurrentProviderConfig(): ProviderConfigENVFormat | null {
    return this.getProviderConfig();
  }

  getAllProviderConfigs(): Record<string, ProviderConfigENVFormat> {
    const configs: Record<string, ProviderConfigENVFormat> = {};
    const networks: NetworkType[] = ['mainnet', 'devnet'];
    const providers: ProviderType[] = ['intellect', '5n'];

    for (const network of networks) {
      for (const provider of providers) {
        try {
          const config = this.getProviderConfig(network, provider);
          if (config) {
            const key = `${provider}_${network}`;
            configs[key] = config;
          }
        } catch (error) {
          // Skip configurations that don't have all required environment variables
          console.warn(
            `Skipping ${provider}_${network} configuration: ${error}`
          );
        }
      }
    }

    return configs;
  }

  // Helper method to get database URL for a specific network
  getDatabaseUrl(network?: NetworkType): string {
    const targetNetwork = network || this.getCurrentNetwork();
    const envKey = `POSTGRES_DB_URL_${targetNetwork.toUpperCase()}`;
    const url = env[envKey as keyof typeof env] as string | undefined;
    if (!url) {
      throw new Error(`Missing required environment variable: ${envKey}`);
    }
    return url;
  }

  // Helper method to get current database URL
  getCurrentDatabaseUrl(): string | null {
    return this.getDatabaseUrl();
  }

  // Helper method to get managed parties for a specific network and provider
  getManagedParties(network?: NetworkType, provider?: ProviderType): string[] {
    const targetNetwork = network || this.getCurrentNetwork();
    const targetProvider = provider || this.getCurrentProvider();

    const envKey = `MANAGED_PARTIES_${targetProvider.toUpperCase()}_${targetNetwork.toUpperCase()}`;
    const managedPartiesJson = env[envKey as keyof typeof env] as
      | string
      | undefined;
    if (!managedPartiesJson) {
      return [];
    }

    try {
      const parties = JSON.parse(managedPartiesJson);
      if (Array.isArray(parties)) {
        return parties.filter(party => typeof party === 'string');
      }
      throw new Error(
        `Managed parties configuration for ${targetProvider} on ${targetNetwork} is not an array: ${managedPartiesJson}`
      );
    } catch (error) {
      throw new Error(
        `Failed to parse managed parties configuration for ${targetProvider} on ${targetNetwork}: ${error}`
      );
    }
  }

  // Helper method to get current managed parties
  getCurrentManagedParties(): string[] {
    return this.getManagedParties();
  }
}
