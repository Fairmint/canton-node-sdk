import {
  ApiType,
  PartialProviderConfig,
  ClientConfig,
  NetworkType,
  ProviderType,
} from './types';
import { EnvLoader, EnvLoaderOptions } from './config/EnvLoader';
import { ProviderConfigBuilder } from './config/ProviderConfigBuilder';
import { AuthenticationManager } from './auth/AuthenticationManager';
import { HttpClient } from './http/HttpClient';
import { ConfigurationError } from './errors';

/** Abstract base class providing common functionality for all API clients */
export abstract class BaseClient {
  protected config: PartialProviderConfig;
  protected apiType: ApiType;
  protected clientConfig: ClientConfig;
  protected authManager: AuthenticationManager;
  protected httpClient: HttpClient;
  protected envLoader: EnvLoader;

  constructor(apiType: ApiType, config?: Partial<ClientConfig>) {
    this.apiType = apiType;

    // Get network and provider from config or environment
    const network = config?.network;
    const provider = config?.provider;

    // Initialize EnvLoader with options if network/provider are provided
    const envLoaderOptions: EnvLoaderOptions = {};
    if (network) envLoaderOptions.currentNetwork = network;
    if (provider) envLoaderOptions.currentProvider = provider;
    this.envLoader = EnvLoader.getInstance(envLoaderOptions);

    // Build client configuration
    this.clientConfig = {
      network: network || this.envLoader.getCurrentNetwork(),
      provider: provider || this.envLoader.getCurrentProvider(),
      ...(config?.logger && { logger: config.logger }),
    };

    // Build provider configuration
    const configBuilder = new ProviderConfigBuilder();
    this.config = configBuilder.buildApiSpecificConfig(
      this.apiType,
      this.clientConfig.network,
      this.clientConfig.provider,
      config
    );

    // Initialize authentication manager
    const apiConfig = this.config.apis[this.apiType];
    if (!apiConfig) {
      throw new ConfigurationError(
        `API configuration not found for ${this.apiType}`
      );
    }

    this.authManager = new AuthenticationManager(
      this.config.authUrl,
      apiConfig.auth
    );

    // Initialize HTTP client with logger
    this.httpClient = new HttpClient(this.clientConfig.logger);
  }

  public async authenticate(): Promise<string> {
    const token = await this.authManager.authenticate();
    if (token) {
      this.httpClient.setBearerToken(token);
    }
    return token;
  }

  public async makeGetRequest<T>(
    url: string,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    // Ensure we have a valid token if authentication is required
    if (config.includeBearerToken) {
      await this.authenticate();
    }

    return this.httpClient.makeGetRequest<T>(url, config);
  }

  public async makePostRequest<T>(
    url: string,
    data: unknown,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    // Ensure we have a valid token if authentication is required
    if (config.includeBearerToken) {
      await this.authenticate();
    }

    return this.httpClient.makePostRequest<T>(url, data, config);
  }

  public getApiUrl(): string {
    const apiConfig = this.config.apis[this.apiType];
    return apiConfig?.apiUrl || '';
  }

  public getPartyId(): string {
    return this.envLoader.getPartyId(
      this.clientConfig.network,
      this.clientConfig.provider
    );
  }

  public getUserId(): string | undefined {
    return this.envLoader.getUserId(
      this.clientConfig.network,
      this.clientConfig.provider
    );
  }

  public getManagedParties(): string[] {
    return this.envLoader.getManagedParties(
      this.clientConfig.network,
      this.clientConfig.provider
    );
  }

  public buildPartyList(additionalParties: string[] = []): string[] {
    const managedParties = this.getManagedParties();
    const partyId = this.getPartyId();

    const partyList = [...additionalParties, ...managedParties];

    if (partyId && !partyList.includes(partyId)) {
      partyList.push(partyId);
    }

    return [...new Set(partyList)];
  }

  public getNetwork(): NetworkType {
    return this.clientConfig.network;
  }

  public getProvider(): ProviderType {
    return this.clientConfig.provider;
  }

  public getProviderName(): string {
    return this.config.providerName;
  }

  public getAuthUrl(): string {
    return this.config.authUrl;
  }

  public getApiType(): ApiType {
    return this.apiType;
  }
}
