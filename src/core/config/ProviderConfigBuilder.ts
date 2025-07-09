import { ApiType, AuthConfig, ApiConfig, ProviderConfig, NetworkType, ProviderType, PartialProviderConfig } from '../types';
import { EnvironmentConfig } from './EnvironmentConfig';

/** Builds provider-specific configuration from environment variables */
export class ProviderConfigBuilder {
  private envConfig: EnvironmentConfig;

  constructor() {
    this.envConfig = EnvironmentConfig.getInstance();
  }

  public buildProviderConfig(
    network?: NetworkType,
    provider?: ProviderType
  ): ProviderConfig {
    const targetNetwork = network || this.envConfig.getCurrentNetwork();
    const targetProvider = provider || this.envConfig.getCurrentProvider();

    return {
      providerName: `${targetProvider}_${targetNetwork}`,
      authUrl: this.envConfig.getAuthUrl(targetNetwork, targetProvider),
      apis: {
        LEDGER_JSON_API: this.buildApiConfig('LEDGER_JSON_API', targetNetwork, targetProvider),
        VALIDATOR_API: this.buildApiConfig('VALIDATOR_API', targetNetwork, targetProvider),
        SCAN_API: this.buildApiConfig('SCAN_API', targetNetwork, targetProvider),
      },
    };
  }

  public buildApiSpecificConfig(
    apiType: ApiType,
    network?: NetworkType,
    provider?: ProviderType
  ): PartialProviderConfig {
    const targetNetwork = network || this.envConfig.getCurrentNetwork();
    const targetProvider = provider || this.envConfig.getCurrentProvider();

    const apis: Partial<Record<ApiType, ApiConfig>> = {};

    apis[apiType] = this.buildApiConfig(apiType, targetNetwork, targetProvider);

    return {
      providerName: `${targetProvider}_${targetNetwork}`,
      authUrl: this.envConfig.getAuthUrl(targetNetwork, targetProvider),
      apis,
    };
  }

  private buildApiConfig(
    apiType: ApiType,
    network: NetworkType,
    provider: ProviderType
  ): ApiConfig {
    const clientSecret = this.envConfig.getApiClientSecret(apiType, network, provider);
    const auth: AuthConfig = {
      grantType: 'client_credentials',
      clientId: this.envConfig.getApiClientId(apiType, network, provider) || '',
      ...(clientSecret && { clientSecret }),
    };

    const apiConfig: ApiConfig = {
      apiUrl: this.envConfig.getApiUri(apiType, network, provider),
      auth,
    };

    // Add party-specific configuration for APIs that support it
    if (apiType === 'LEDGER_JSON_API' || apiType === 'VALIDATOR_API') {
      apiConfig.partyId = this.envConfig.getPartyId(network, provider);
      const userId = this.envConfig.getUserId(network, provider);
      if (userId) {
        apiConfig.userId = userId;
      }
    }

    return apiConfig;
  }

  public getAllProviderConfigs(): Record<string, ProviderConfig> {
    const networks: NetworkType[] = ['devnet', 'testnet', 'mainnet'];
    const providers: ProviderType[] = ['intellect', '5n'];
    const configs: Record<string, ProviderConfig> = {};

    for (const network of networks) {
      for (const provider of providers) {
        try {
          const config = this.buildProviderConfig(network, provider);
          configs[`${provider}_${network}`] = config;
        } catch (error) {
          // Skip configurations that don't have all required environment variables
          console.warn(`Skipping configuration for ${provider}_${network}: ${error}`);
        }
      }
    }

    return configs;
  }
} 