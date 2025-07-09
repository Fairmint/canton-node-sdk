import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { NetworkType, ProviderType, ClientConfig, ApiConfig, AuthConfig } from '../types';
import { ConfigurationError } from '../errors';

// Load environment variables with fallback to parent directory
const currentEnvPath = '.env';
const parentEnvPath = path.join('..', '.env');

// Try to load from current directory first
let result = config({ path: currentEnvPath });

// If no .env file found in current directory, try parent directory
if (result.error && fs.existsSync(parentEnvPath)) {
  result = config({ path: parentEnvPath });

  if (result.error) {
    console.warn(
      'Failed to load .env file from parent directory:',
      result.error.message
    );
  }
}

export interface EnvLoaderOptions {
  currentNetwork?: NetworkType;
  currentProvider?: ProviderType;
}

/** Singleton class for managing environment variables and configuration */
export class EnvLoader {
  private static instance: EnvLoader;
  private env: Record<string, string | undefined>;
  private options: EnvLoaderOptions;

  private constructor(options: EnvLoaderOptions = {}) {
    this.env = process.env;
    this.options = options;
  }

  public static getInstance(options: EnvLoaderOptions = {}): EnvLoader {
    if (!EnvLoader.instance) {
      EnvLoader.instance = new EnvLoader(options);
    }
    return EnvLoader.instance;
  }

  /**
   * Load complete configuration from environment variables as a ClientConfig
   */
  public loadConfig(): ClientConfig {
    const network = this.getCurrentNetwork();
    const provider = this.getCurrentProvider();
    const authUrl = this.getAuthUrl(network, provider);

    // Build API configs for each supported API type
    const apis: ClientConfig['apis'] = {};
    const apiTypes = ['LEDGER_JSON_API', 'VALIDATOR_API', 'SCAN_API'] as const;
    for (const apiType of apiTypes) {
      const apiConfig = this.loadApiConfig(apiType, network, provider);
      if (apiConfig) {
        apis[apiType] = apiConfig;
      }
    }

    return {
      network,
      provider,
      authUrl,
      apis,
    };
  }

  public getNodeEnv(): 'development' | 'production' | 'test' {
    const value = this.env['NODE_ENV'] || 'development';
    if (!['development', 'production', 'test'].includes(value)) {
      throw new ConfigurationError(
        `Invalid NODE_ENV: ${value}. Must be 'development', 'production', or 'test'`
      );
    }
    return value as 'development' | 'production' | 'test';
  }

  public getCurrentNetwork(): NetworkType {
    if (this.options.currentNetwork) {
      return this.options.currentNetwork;
    }
    const value = this.env['CANTON_CURRENT_NETWORK']?.toLowerCase();
    if (!value || !['devnet', 'testnet', 'mainnet'].includes(value)) {
      throw new ConfigurationError(
        'Missing or invalid CANTON_CURRENT_NETWORK. Must be "devnet", "testnet", or "mainnet"'
      );
    }
    return value as NetworkType;
  }

  public getCurrentProvider(): ProviderType {
    if (this.options.currentProvider) {
      return this.options.currentProvider;
    }
    const value = this.env['CANTON_CURRENT_PROVIDER']?.toLowerCase();
    if (!value || !['intellect', '5n'].includes(value)) {
      throw new ConfigurationError(
        'Missing or invalid CANTON_CURRENT_PROVIDER. Must be "intellect" or "5n"'
      );
    }
    return value as ProviderType;
  }

  public getApiUri(apiType: string, network?: NetworkType, provider?: ProviderType): string {
    const targetNetwork = network || this.getCurrentNetwork();
    const targetProvider = provider || this.getCurrentProvider();

    const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_${apiType.toUpperCase()}_URI`;
    const uri = this.env[envKey];

    if (!uri) {
      throw new ConfigurationError(`Missing required environment variable: ${envKey}`);
    }

    return uri;
  }

  public getApiClientId(apiType: string, network?: NetworkType, provider?: ProviderType): string | undefined {
    const targetNetwork = network || this.getCurrentNetwork();
    const targetProvider = provider || this.getCurrentProvider();

    const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_${apiType.toUpperCase()}_CLIENT_ID`;
    return this.env[envKey];
  }

  public getApiClientSecret(apiType: string, network?: NetworkType, provider?: ProviderType): string | undefined {
    const targetNetwork = network || this.getCurrentNetwork();
    const targetProvider = provider || this.getCurrentProvider();

    const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_${apiType.toUpperCase()}_CLIENT_SECRET`;
    return this.env[envKey];
  }

  public getAuthUrl(network?: NetworkType, provider?: ProviderType): string {
    const targetNetwork = network || this.getCurrentNetwork();
    const targetProvider = provider || this.getCurrentProvider();

    const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_AUTH_URL`;
    const authUrl = this.env[envKey];

    if (!authUrl) {
      throw new ConfigurationError(`Missing required environment variable: ${envKey}`);
    }

    return authUrl;
  }

  public getPartyId(network?: NetworkType, provider?: ProviderType): string {
    const targetNetwork = network || this.getCurrentNetwork();
    const targetProvider = provider || this.getCurrentProvider();

    const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_PARTY_ID`;
    const partyId = this.env[envKey];

    if (!partyId) {
      throw new ConfigurationError(`Missing required environment variable: ${envKey}`);
    }

    return partyId;
  }

  public getUserId(network?: NetworkType, provider?: ProviderType): string | undefined {
    const targetNetwork = network || this.getCurrentNetwork();
    const targetProvider = provider || this.getCurrentProvider();

    const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_USER_ID`;
    return this.env[envKey];
  }

  public getDatabaseUrl(network?: NetworkType): string {
    const targetNetwork = network || this.getCurrentNetwork();
    const envKey = `CANTON_${targetNetwork.toUpperCase()}_DATABASE_URL`;
    const databaseUrl = this.env[envKey];

    if (!databaseUrl) {
      throw new ConfigurationError(`Missing required environment variable: ${envKey}`);
    }

    return databaseUrl;
  }

  public getManagedParties(network?: NetworkType, provider?: ProviderType): string[] {
    const targetNetwork = network || this.getCurrentNetwork();
    const targetProvider = provider || this.getCurrentProvider();

    const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_MANAGED_PARTIES`;
    const managedParties = this.env[envKey];

    if (!managedParties) {
      return [];
    }

    return managedParties.split(',').map(party => party.trim()).filter(party => party.length > 0);
  }

  private loadApiConfig(apiType: string, network: NetworkType, provider: ProviderType): ApiConfig | undefined {
    const apiUrl = this.getApiUri(apiType, network, provider);
    const clientId = this.getApiClientId(apiType, network, provider);
    const clientSecret = this.getApiClientSecret(apiType, network, provider);
    const partyId = this.getPartyId(network, provider);
    const userId = this.getUserId(network, provider);
    
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
    
    if (partyId) {
      apiConfig.partyId = String(partyId);
    }
    if (userId) {
      apiConfig.userId = String(userId);
    }
    return apiConfig;
  }

  /**
   * Validate that required configuration is present
   */
  public validateConfig(): void {
    const config = this.loadConfig();
    if (!config.authUrl) {
      throw new ConfigurationError('Missing required authUrl configuration');
    }
    // Check if at least one API is configured
    const configuredApis = Object.keys(config.apis || {}).filter(key => config.apis && config.apis[key as keyof typeof config.apis]);
    if (configuredApis.length === 0) {
      throw new ConfigurationError(
        'No API configurations found. Please provide configuration for at least one API type.'
      );
    }
    // Validate each configured API
    for (const [apiType, apiConfig] of Object.entries(config.apis || {})) {
      if (apiConfig) {
        if (!apiConfig.apiUrl) {
          throw new ConfigurationError(`Missing apiUrl for ${apiType}`);
        }
        if (!apiConfig.auth?.clientId) {
          throw new ConfigurationError(`Missing clientId for ${apiType}`);
        }
      }
    }
  }
} 