import {
  ApiType,
  ProviderConfig,
  ClientConfig,
  NetworkType,
  ProviderType,
} from './types';
import { EnvironmentConfig } from './config/EnvironmentConfig';
import { ProviderConfigBuilder } from './config/ProviderConfigBuilder';
import { AuthenticationManager } from './auth/AuthenticationManager';
import { HttpClient } from './http/HttpClient';
import { ConfigurationError } from './errors';

export abstract class BaseClient {
  protected config: ProviderConfig;
  protected apiType: ApiType;
  protected clientConfig: ClientConfig;
  protected authManager: AuthenticationManager;
  protected httpClient: HttpClient;
  protected envConfig: EnvironmentConfig;

  constructor(apiType: ApiType, clientConfig?: Partial<ClientConfig>) {
    this.apiType = apiType;
    this.envConfig = EnvironmentConfig.getInstance();

    // Build client configuration
    this.clientConfig = {
      network: clientConfig?.network || this.envConfig.getCurrentNetwork(),
      provider: clientConfig?.provider || this.envConfig.getCurrentProvider(),
      enableLogging: clientConfig?.enableLogging ?? true,
      ...(clientConfig?.logDir && { logDir: clientConfig.logDir }),
    };

    // Build provider configuration
    const configBuilder = new ProviderConfigBuilder();
    this.config = configBuilder.buildApiSpecificConfig(
      this.apiType,
      this.clientConfig.network,
      this.clientConfig.provider
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

    // Initialize HTTP client
    this.httpClient = new HttpClient(
      this.clientConfig.enableLogging,
      this.clientConfig.logDir
    );

    console.log(
      `🔍 Connected to ${this.config.providerName} (${this.apiType})`
    );
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

  public getPartyId(): string | undefined {
    const apiConfig = this.config.apis[this.apiType];
    return apiConfig?.partyId;
  }

  public getUserId(): string | undefined {
    const apiConfig = this.config.apis[this.apiType];
    return apiConfig?.userId;
  }

  public getManagedParties(): string[] {
    return this.envConfig.getManagedParties(
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
}
