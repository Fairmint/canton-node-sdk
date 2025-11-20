import { AuthenticationManager } from './auth/AuthenticationManager';
import { EnvLoader } from './config/EnvLoader';
import { ConfigurationError } from './errors';
import { HttpClient } from './http/HttpClient';
import { FileLogger } from './logging/FileLogger';
import {
  type ApiType,
  type ClientConfig,
  type NetworkType,
  type PartialProviderConfig,
  type ProviderType,
} from './types';

/** Abstract base class providing common functionality for all API clients */
export abstract class BaseClient {
  protected config: PartialProviderConfig;
  protected apiType: ApiType;
  protected clientConfig: ClientConfig;
  protected authManager: AuthenticationManager;
  protected httpClient: HttpClient;

  constructor(apiType: ApiType, config?: ClientConfig) {
    this.apiType = apiType;

    // If no config provided, or config missing APIs, use EnvLoader to get defaults
    if (!config) {
      // No config at all - use EnvLoader defaults
      const defaultConfig = EnvLoader.getConfig(apiType);
      defaultConfig.logger = new FileLogger();
      this.clientConfig = defaultConfig;
    } else if (!config.apis?.[apiType]) {
      // Config provided but missing API configuration - merge with EnvLoader defaults
      const options: { network?: NetworkType; provider?: ProviderType } = {
        network: config.network,
      };
      if (config.provider) {
        options.provider = config.provider;
      }
      const defaultConfig = EnvLoader.getConfig(apiType, options);
      this.clientConfig = {
        ...defaultConfig,
        ...config,
        apis: {
          ...defaultConfig.apis,
          ...config.apis,
        },
        logger: config.logger ?? new FileLogger(),
      };
    } else {
      // Config fully provided
      this.clientConfig = config;
    }

    // Validate that the required API configuration is present
    if (!this.clientConfig.apis?.[apiType]) {
      throw new ConfigurationError(`API configuration not found for ${apiType}`);
    }

    // Build provider configuration from the provided config
    this.config = {
      providerName: this.clientConfig.provider
        ? `${this.clientConfig.provider}_${this.clientConfig.network}`
        : this.clientConfig.network,
      authUrl: this.clientConfig.authUrl ?? '',
      apis: {
        [apiType]: this.clientConfig.apis[apiType],
      },
    };

    // Initialize authentication manager
    const apiConfig = this.config.apis[this.apiType];
    if (!apiConfig) {
      throw new ConfigurationError(`API configuration not found for ${this.apiType}`);
    }

    this.authManager = new AuthenticationManager(this.config.authUrl, apiConfig.auth, this.clientConfig.logger);

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

  public async makeDeleteRequest<T>(
    url: string,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    // Ensure we have a valid token if authentication is required
    if (config.includeBearerToken) {
      await this.authenticate();
    }

    return this.httpClient.makeDeleteRequest<T>(url, config);
  }

  public async makePatchRequest<T>(
    url: string,
    data: unknown,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    // Ensure we have a valid token if authentication is required
    if (config.includeBearerToken) {
      await this.authenticate();
    }

    return this.httpClient.makePatchRequest<T>(url, data, config);
  }

  public getLogger(): import('./logging').Logger | undefined {
    return this.clientConfig.logger;
  }

  public getApiUrl(): string {
    const apiConfig = this.config.apis[this.apiType];
    return apiConfig?.apiUrl ?? '';
  }

  public getPartyId(): string {
    // Use provided configuration first, fall back to API config
    const apiConfig = this.config.apis[this.apiType];
    if (apiConfig?.partyId) {
      return apiConfig.partyId;
    }
    return this.clientConfig.partyId ?? '';
  }

  public getUserId(): string | undefined {
    // Use provided configuration first, fall back to API config
    const apiConfig = this.config.apis[this.apiType];
    if (apiConfig?.userId) {
      return apiConfig.userId;
    }
    return this.clientConfig.userId;
  }

  public getManagedParties(): string[] {
    // For now, always use environment variables for managed parties
    // as this is not typically provided in the API config
    return this.clientConfig.managedParties ?? [];
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

  public getProvider(): ProviderType | undefined {
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
