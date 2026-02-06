import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigurationError } from '../errors';
import {
  type ApiConfig,
  type ApiType,
  type AuthConfig,
  type ClientConfig,
  type NetworkType,
  type ProviderType,
} from '../types';

// Load environment variables with fallback to parent directory
const currentEnvPath = '.env';
const parentEnvPath = path.join('..', '.env');

// Try to load from current directory first
let result = config({ path: currentEnvPath });

// If no .env file found in current directory, try parent directory
if (result.error && fs.existsSync(parentEnvPath)) {
  result = config({ path: parentEnvPath });
}

export interface EnvLoaderOptions {
  currentNetwork?: NetworkType;
  currentProvider?: ProviderType;
}

/** Singleton class for managing environment variables and configuration */
export class EnvLoader {
  private static instance: EnvLoader | undefined;
  private readonly env: Record<string, string | undefined>;
  private options: EnvLoaderOptions;

  private constructor(options: EnvLoaderOptions = {}) {
    this.env = process.env;
    this.options = options;
  }

  public static getInstance(options: EnvLoaderOptions = {}): EnvLoader {
    if (!EnvLoader.instance) {
      EnvLoader.instance = new EnvLoader(options);
    } else if (options.currentNetwork || options.currentProvider) {
      // Update existing instance with new options
      EnvLoader.instance.options = { ...EnvLoader.instance.options, ...options };
    }
    return EnvLoader.instance;
  }

  public static resetInstance(): void {
    EnvLoader.instance = undefined;
  }

  /**
   * Get configuration for a specific API type from environment variables
   *
   * @param apiType The API type to get configuration for
   * @param options Optional network and provider to use instead of reading from env
   * @returns ClientConfig with only the specified API configured
   */
  public static getConfig(apiType: ApiType, options?: { network?: NetworkType; provider?: ProviderType }): ClientConfig {
    const envLoader = EnvLoader.getInstance();

    // Determine which values to use - prioritize options over environment
    const network = options?.network ?? envLoader.getCurrentNetwork();

    // Get provider, with special handling for localnet
    let provider = options?.provider;
    if (!provider) {
      // For localnet, default to 'app-provider' if not specified
      if (network === 'localnet') {
        provider = 'app-provider';
      } else {
        // For other networks, require provider from environment
        provider = envLoader.getCurrentProvider();
      }
    }

    if (!provider) {
      throw new ConfigurationError(
        `Provider is required for ${apiType}. Either specify it in options or set CANTON_CURRENT_PROVIDER in environment.`
      );
    }
    const authUrl = envLoader.getAuthUrl(network, provider);

    // Get API-specific configuration using the determined network and provider
    const apiConfig = envLoader.loadApiConfig(apiType, network, provider || undefined);
    if (!apiConfig) {
      const providerStr = provider ? provider.toUpperCase() : 'PROVIDER';
      throw new ConfigurationError(
        `Missing required environment variables for ${apiType}. ` +
          `Required: CANTON_${network.toUpperCase()}_${providerStr}_${apiType.toUpperCase()}_URI, ` +
          `CANTON_${network.toUpperCase()}_${providerStr}_${apiType.toUpperCase()}_CLIENT_ID, ` +
          `and either CLIENT_SECRET (for client_credentials) or USERNAME/PASSWORD (for password grant)`
      );
    }

    const clientConfig: ClientConfig = {
      network,
      apis: {
        [apiType]: apiConfig,
      },
    };

    clientConfig.provider = provider;
    clientConfig.authUrl = authUrl;

    return clientConfig;
  }

  /**
   * Get a summary of the environment variables being used for a specific configuration This is useful for debugging
   * configuration issues
   */
  public static getConfigSummary(
    apiType: ApiType,
    options?: { network?: NetworkType; provider?: ProviderType }
  ): {
    network: NetworkType;
    provider?: ProviderType;
    envVars: Record<string, string | undefined>;
    missingVars: string[];
  } {
    const envLoader = EnvLoader.getInstance();
    const network = options?.network ?? envLoader.getCurrentNetwork();
    const provider = options?.provider ?? envLoader.getCurrentProvider();

    const envVars: Record<string, string | undefined> = {};
    const missingVars: string[] = [];

    if (provider) {
      const upperNetwork = network.toUpperCase();
      const upperProvider = provider.toUpperCase();
      const baseKey = `CANTON_${upperNetwork}_${upperProvider}`;

      // API-specific variables
      envVars[`${baseKey}_${apiType.toUpperCase()}_URI`] = envLoader.env[`${baseKey}_${apiType.toUpperCase()}_URI`];
      envVars[`${baseKey}_${apiType.toUpperCase()}_CLIENT_ID`] =
        envLoader.env[`${baseKey}_${apiType.toUpperCase()}_CLIENT_ID`];
      envVars[`${baseKey}_${apiType.toUpperCase()}_CLIENT_SECRET`] =
        envLoader.env[`${baseKey}_${apiType.toUpperCase()}_CLIENT_SECRET`];
      envVars[`${baseKey}_${apiType.toUpperCase()}_USERNAME`] =
        envLoader.env[`${baseKey}_${apiType.toUpperCase()}_USERNAME`];
      envVars[`${baseKey}_${apiType.toUpperCase()}_PASSWORD`] =
        envLoader.env[`${baseKey}_${apiType.toUpperCase()}_PASSWORD`];

      // Common variables
      envVars[`${baseKey}_AUTH_URL`] = envLoader.env[`${baseKey}_AUTH_URL`];
      envVars[`${baseKey}_PARTY_ID`] = envLoader.env[`${baseKey}_PARTY_ID`];
      envVars[`${baseKey}_USER_ID`] = envLoader.env[`${baseKey}_USER_ID`];

      if (!envVars[`${baseKey}_${apiType.toUpperCase()}_URI`]) {
        missingVars.push(`${baseKey}_${apiType.toUpperCase()}_URI`);
      }
      if (!envVars[`${baseKey}_${apiType.toUpperCase()}_CLIENT_ID`]) {
        missingVars.push(`${baseKey}_${apiType.toUpperCase()}_CLIENT_ID`);
      }
      if (!envVars[`${baseKey}_AUTH_URL`]) {
        missingVars.push(`${baseKey}_AUTH_URL`);
      }
    }

    // Add template and contract IDs to the summary
    const walletTemplateKey = `CANTON_WALLET_TEMPLATE_ID_${network.toUpperCase()}`;
    const preapprovalTemplateKey = `CANTON_PREAPPROVAL_TEMPLATE_ID_${network.toUpperCase()}`;
    const amuletRulesContractKey = `CANTON_AMULET_RULES_CONTRACT_ID_${network.toUpperCase()}`;
    const validatorWalletAppInstallContractKey = `CANTON_VALIDATOR_WALLET_APP_INSTALL_CONTRACT_ID_${network.toUpperCase()}`;

    envVars[walletTemplateKey] = envLoader.env[walletTemplateKey];
    envVars[preapprovalTemplateKey] = envLoader.env[preapprovalTemplateKey];
    envVars[amuletRulesContractKey] = envLoader.env[amuletRulesContractKey];
    envVars[validatorWalletAppInstallContractKey] = envLoader.env[validatorWalletAppInstallContractKey];

    // Check for missing template and contract variables
    if (!envVars[walletTemplateKey]) {
      missingVars.push(walletTemplateKey);
    }
    if (!envVars[preapprovalTemplateKey]) {
      missingVars.push(preapprovalTemplateKey);
    }
    if (!envVars[amuletRulesContractKey]) {
      missingVars.push(amuletRulesContractKey);
    }
    if (!envVars[validatorWalletAppInstallContractKey]) {
      missingVars.push(validatorWalletAppInstallContractKey);
    }

    return {
      network,
      provider,
      envVars,
      missingVars,
    };
  }

  public getNodeEnv(): 'development' | 'production' | 'test' {
    const value = this.env['NODE_ENV'] ?? 'development';
    if (!['development', 'production', 'test'].includes(value)) {
      throw new ConfigurationError(`Invalid NODE_ENV: ${value}. Must be 'development', 'production', or 'test'`);
    }
    return value as 'development' | 'production' | 'test';
  }

  public getCurrentNetwork(): NetworkType {
    if (this.options.currentNetwork) {
      return this.options.currentNetwork;
    }
    const value = this.env['CANTON_CURRENT_NETWORK']?.toLowerCase();
    if (!value || !['devnet', 'testnet', 'mainnet', 'localnet'].includes(value)) {
      throw new ConfigurationError(
        'Missing or invalid CANTON_CURRENT_NETWORK. Must be "devnet", "testnet", "mainnet", or "localnet"'
      );
    }
    return value as NetworkType;
  }

  public getCurrentProvider(): ProviderType {
    if (this.options.currentProvider) {
      return this.options.currentProvider;
    }
    const value = this.env['CANTON_CURRENT_PROVIDER']?.toLowerCase();
    if (!value) {
      throw new ConfigurationError('Missing or invalid CANTON_CURRENT_PROVIDER');
    }
    return value;
  }

  public getApiUri(apiType: string, network?: NetworkType, provider?: ProviderType): string | undefined {
    const targetNetwork = network ?? this.getCurrentNetwork();

    // Special case for APIs that don't require provider-specific configuration
    if (apiType === 'LIGHTHOUSE_API') {
      const envKey = `CANTON_${targetNetwork.toUpperCase()}_${apiType.toUpperCase()}_URI`;
      const uri = this.env[envKey];
      return uri;
    }

    const targetProvider = provider ?? this.getCurrentProvider();
    const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_${apiType.toUpperCase()}_URI`;
    const uri = this.env[envKey];

    return uri;
  }

  public getApiClientId(apiType: string, network?: NetworkType, provider?: ProviderType): string | undefined {
    const targetNetwork = network ?? this.getCurrentNetwork();
    const targetProvider = provider ?? this.getCurrentProvider();

    const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_${apiType.toUpperCase()}_CLIENT_ID`;
    return this.env[envKey];
  }

  public getApiClientSecret(apiType: string, network?: NetworkType, provider?: ProviderType): string | undefined {
    const targetNetwork = network ?? this.getCurrentNetwork();
    const targetProvider = provider ?? this.getCurrentProvider();

    const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_${apiType.toUpperCase()}_CLIENT_SECRET`;
    return this.env[envKey];
  }

  public getApiUsername(apiType: string, network?: NetworkType, provider?: ProviderType): string | undefined {
    const targetNetwork = network ?? this.getCurrentNetwork();
    const targetProvider = provider ?? this.getCurrentProvider();

    const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_${apiType.toUpperCase()}_USERNAME`;
    return this.env[envKey];
  }

  public getApiPassword(apiType: string, network?: NetworkType, provider?: ProviderType): string | undefined {
    const targetNetwork = network ?? this.getCurrentNetwork();
    const targetProvider = provider ?? this.getCurrentProvider();

    const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_${apiType.toUpperCase()}_PASSWORD`;
    return this.env[envKey];
  }

  public getAuthUrl(network?: NetworkType, provider?: ProviderType): string {
    const targetNetwork = network ?? this.getCurrentNetwork();
    const targetProvider = provider ?? this.getCurrentProvider();

    const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_AUTH_URL`;
    const authUrl = this.env[envKey];

    // Provide localnet defaults for cn-quickstart
    if (!authUrl && targetNetwork === 'localnet') {
      if (targetProvider === 'app-provider') {
        return 'http://localhost:8082/realms/AppProvider/protocol/openid-connect/token';
      }
      if (targetProvider === 'app-user') {
        return 'http://localhost:8082/realms/AppUser/protocol/openid-connect/token';
      }
    }

    if (!authUrl) {
      throw new ConfigurationError(`Missing required environment variable: ${envKey}`);
    }

    return authUrl;
  }

  public getPartyId(network?: NetworkType, provider?: ProviderType): string {
    const targetNetwork = network ?? this.getCurrentNetwork();
    const targetProvider = provider ?? this.getCurrentProvider();

    const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_PARTY_ID`;
    const partyId = this.env[envKey];

    if (!partyId) {
      throw new ConfigurationError(`Missing required environment variable: ${envKey}`);
    }

    return partyId;
  }

  public getUserId(network?: NetworkType, provider?: ProviderType): string | undefined {
    const targetNetwork = network ?? this.getCurrentNetwork();
    const targetProvider = provider ?? this.getCurrentProvider();

    const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_USER_ID`;
    return this.env[envKey];
  }

  public getDatabaseUrl(network?: NetworkType): string {
    const targetNetwork = network ?? this.getCurrentNetwork();
    const envKey = `CANTON_${targetNetwork.toUpperCase()}_DATABASE_URL`;
    const databaseUrl = this.env[envKey];

    if (!databaseUrl) {
      throw new ConfigurationError(`Missing required environment variable: ${envKey}`);
    }

    return databaseUrl;
  }

  public getManagedParties(network?: NetworkType, provider?: ProviderType): string[] {
    const targetNetwork = network ?? this.getCurrentNetwork();
    const targetProvider = provider ?? this.getCurrentProvider();

    const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_MANAGED_PARTIES`;
    const managedParties = this.env[envKey];

    if (!managedParties) {
      return [];
    }

    return managedParties
      .split(',')
      .map((party) => party.trim())
      .filter((party) => party.length > 0);
  }

  public getAmuletRulesContractId(network?: NetworkType): string {
    const targetNetwork = network ?? this.getCurrentNetwork();
    const envKey = `CANTON_AMULET_RULES_CONTRACT_ID_${targetNetwork.toUpperCase()}`;
    const contractId = this.env[envKey];

    if (!contractId) {
      throw new ConfigurationError(`Missing required environment variable: ${envKey}`);
    }

    return contractId;
  }

  public getValidatorWalletAppInstallContractId(network?: NetworkType): string {
    const targetNetwork = network ?? this.getCurrentNetwork();
    const envKey = `CANTON_VALIDATOR_WALLET_APP_INSTALL_CONTRACT_ID_${targetNetwork.toUpperCase()}`;
    const contractId = this.env[envKey];

    if (!contractId) {
      throw new ConfigurationError(`Missing required environment variable: ${envKey}`);
    }

    return contractId;
  }

  /**
   * Get localnet defaults for cn-quickstart These are the standard OAuth2 credentials and URLs for cn-quickstart with
   * OAuth2 enabled
   */
  private getLocalnetDefaults(apiType: string, provider: ProviderType): ApiConfig | undefined {
    if (provider !== 'app-provider' && provider !== 'app-user') {
      return undefined;
    }

    const portPrefix = provider === 'app-provider' ? '3' : '2';

    // Default OAuth2 credentials for cn-quickstart
    const auth: AuthConfig = {
      grantType: 'client_credentials',
      clientId: `${provider}-validator`,
      clientSecret:
        provider === 'app-provider' ? 'AL8648b9SfdTFImq7FV56Vd0KHifHBuC' : 'k1YVWeC1vjQcqzlqzY98WVxJc6e4IIdZ',
    };

    // Map API types to their port suffixes
    const apiUrlMap: Record<string, string> = {
      VALIDATOR_API: `http://localhost:${portPrefix}903`,
      LEDGER_JSON_API: `http://localhost:${portPrefix}975`,
      SCAN_API: `http://localhost:4000/api/scan`,
    };

    const apiUrl = apiUrlMap[apiType];
    if (!apiUrl) {
      return undefined;
    }

    return {
      apiUrl,
      auth,
    };
  }

  private loadApiConfig(apiType: string, network: NetworkType, provider?: ProviderType): ApiConfig | undefined {
    if (!provider) {
      return undefined; // Provider must be specified to load this API configuration
    }

    // For localnet, try defaults first if environment variables are not set
    if (network === 'localnet') {
      const apiUrl = this.getApiUri(apiType, network, provider);
      const clientId = this.getApiClientId(apiType, network, provider);

      // If no environment variables are set, use localnet defaults
      if (!apiUrl && !clientId) {
        return this.getLocalnetDefaults(apiType, provider);
      }
    }

    const apiUrl = this.getApiUri(apiType, network, provider);
    const clientId = this.getApiClientId(apiType, network, provider);
    const clientSecret = this.getApiClientSecret(apiType, network, provider);
    const username = this.getApiUsername(apiType, network, provider);
    const password = this.getApiPassword(apiType, network, provider);
    const partyId = this.getPartyId(network, provider);
    const userId = this.getUserId(network, provider);

    if (!apiUrl || !clientId) {
      return undefined;
    }

    // Determine grant type based on available credentials
    let auth: AuthConfig;

    if (username && password) {
      auth = {
        grantType: 'password',
        clientId,
        username,
        password,
      };
    } else {
      auth = {
        grantType: 'client_credentials',
        clientId,
        ...(clientSecret !== undefined ? { clientSecret } : {}),
      };
    }

    const apiConfig: ApiConfig = {
      apiUrl,
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
}
