import { ApiType, AuthConfig, ApiConfig, NetworkType, ProviderType, PartialProviderConfig, ClientConfig } from '../types';
import { EnvLoader } from './EnvLoader';

/** Builds provider-specific configuration from environment variables */
export class ProviderConfigBuilder {
  private envLoader: EnvLoader;

  constructor() {
    this.envLoader = EnvLoader.getInstance();
  }

  public buildProviderConfig(
    network?: NetworkType,
    provider?: ProviderType
  ): PartialProviderConfig {
    const targetNetwork = network || this.envLoader.getCurrentNetwork();
    const targetProvider = provider || this.envLoader.getCurrentProvider();

    const apis: Partial<Record<ApiType, ApiConfig>> = {};
    
    // Only include APIs that have valid configurations
    const apiTypes = ['LEDGER_JSON_API', 'VALIDATOR_API', 'SCAN_API'] as const;
    for (const apiType of apiTypes) {
      const apiConfig = this.buildApiConfig(apiType, targetNetwork, targetProvider);
      if (apiConfig) {
        apis[apiType] = apiConfig;
      }
    }

    return {
      providerName: `${targetProvider}_${targetNetwork}`,
      authUrl: this.envLoader.getAuthUrl(targetNetwork, targetProvider),
      apis,
    };
  }

  public buildApiSpecificConfig(
    apiType: ApiType,
    network?: NetworkType,
    provider?: ProviderType,
    config?: Partial<ClientConfig>
  ): PartialProviderConfig {
    const targetNetwork = network || this.envLoader.getCurrentNetwork();
    const targetProvider = provider || this.envLoader.getCurrentProvider();

    const apis: Partial<Record<ApiType, ApiConfig>> = {};

    if (config && config.apis && config.apis[apiType]) {
      apis[apiType] = config.apis[apiType]!;
    } else {
      const apiConfig = this.buildApiConfig(apiType, targetNetwork, targetProvider);
      if (apiConfig) {
        apis[apiType] = apiConfig;
      }
    }

    const authUrl = (config && config.authUrl) || this.envLoader.getAuthUrl(targetNetwork, targetProvider);

    return {
      providerName: `${targetProvider}_${targetNetwork}`,
      authUrl,
      apis,
    };
  }

  private buildApiConfig(
    apiType: ApiType,
    network: NetworkType,
    provider: ProviderType
  ): ApiConfig | undefined {
    const apiUrl = this.envLoader.getApiUri(apiType, network, provider);
    const clientId = this.envLoader.getApiClientId(apiType, network, provider);
    const clientSecret = this.envLoader.getApiClientSecret(apiType, network, provider);
    
    if (!apiUrl || !clientId) {
      return undefined;
    }
    
    const auth: AuthConfig = {
      grantType: 'client_credentials',
      clientId: clientId || '',
      ...(clientSecret && { clientSecret }),
    };

    const apiConfig: ApiConfig = {
      apiUrl: apiUrl || '',
      auth,
    };

    // Add party-specific configuration for APIs that support it
    if (apiType === 'LEDGER_JSON_API' || apiType === 'VALIDATOR_API') {
      apiConfig.partyId = this.envLoader.getPartyId(network, provider);
      const userId = this.envLoader.getUserId(network, provider);
      if (userId) {
        apiConfig.userId = userId;
      }
    }

    return apiConfig;
  }

  public getAllProviderConfigs(): Record<string, PartialProviderConfig> {
    const networks: NetworkType[] = ['devnet', 'testnet', 'mainnet'];
    const providers: ProviderType[] = ['intellect', '5n'];
    const configs: Record<string, PartialProviderConfig> = {};

    for (const network of networks) {
      for (const provider of providers) {
        try {
          const config = this.buildProviderConfig(network, provider);
          // Only include configurations that have at least one API configured
          if (Object.keys(config.apis).length > 0) {
            configs[`${provider}_${network}`] = config;
          }
        } catch (error) {
          // Skip configurations that don't have all required environment variables
          console.warn(`Skipping configuration for ${provider}_${network}: ${error}`);
        }
      }
    }

    return configs;
  }
} 