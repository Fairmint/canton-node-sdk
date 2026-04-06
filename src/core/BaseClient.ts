import { type PartyId, type UserId } from './branded-types';
import { ConfigurationError } from './errors';
import { HttpClient } from './http/HttpClient';
import { type CantonRuntime } from './runtime';
import { type ApiType, type ClientConfig, type NetworkType, type PartialProviderConfig, type ProviderType, type RequestConfig } from './types';

/** Abstract base class providing common functionality for all API clients */
export abstract class BaseClient {
  protected config: PartialProviderConfig;
  protected apiType: ApiType;
  protected clientConfig: ClientConfig;
  protected runtime: CantonRuntime;
  protected httpClient: HttpClient;

  constructor(apiType: ApiType, runtime: CantonRuntime) {
    this.apiType = apiType;
    this.runtime = runtime;
    this.clientConfig = runtime.createClientConfig(apiType);

    // Validate that the required API configuration is present
    const validatedApiConfig = this.clientConfig.apis?.[apiType];
    if (!validatedApiConfig) {
      throw new ConfigurationError(`API configuration not found for ${apiType}`);
    }

    // Build provider configuration from the provided config
    this.config = {
      providerName: this.clientConfig.provider
        ? `${this.clientConfig.provider}_${this.clientConfig.network}`
        : this.clientConfig.network,
      authUrl: this.clientConfig.authUrl ?? '',
      apis: {
        [apiType]: validatedApiConfig,
      },
    };

    const apiConfig = this.config.apis[this.apiType];
    if (!apiConfig) {
      throw new ConfigurationError(`API configuration not found for ${this.apiType}`);
    }

    this.httpClient = new HttpClient(this.clientConfig.logger, async () =>
      this.runtime.getAuthenticationManager(this.config.authUrl, apiConfig.auth).authenticate(),
    );
  }

  public async authenticate(): Promise<string> {
    const apiConfig = this.config.apis[this.apiType];
    if (!apiConfig) {
      throw new ConfigurationError(`API configuration not found for ${this.apiType}`);
    }
    return this.runtime.getAuthenticationManager(this.config.authUrl, apiConfig.auth).authenticate();
  }

  /**
   * Clears the cached authentication token, forcing a refresh on the next authenticate() call. Useful when a token has
   * expired mid-operation (e.g., during a long-running WebSocket stream).
   */
  public clearToken(): void {
    const apiConfig = this.config.apis[this.apiType];
    if (!apiConfig) {
      throw new ConfigurationError(`API configuration not found for ${this.apiType}`);
    }
    this.runtime.getAuthenticationManager(this.config.authUrl, apiConfig.auth).clearToken();
  }

  /**
   * Returns the token expiry timestamp in milliseconds since epoch, or null if not available. Use this to schedule
   * proactive token refresh before expiration, especially for long-running WebSocket connections.
   */
  public getTokenExpiryTime(): number | null {
    const apiConfig = this.config.apis[this.apiType];
    if (!apiConfig) {
      throw new ConfigurationError(`API configuration not found for ${this.apiType}`);
    }
    return this.runtime.getAuthenticationManager(this.config.authUrl, apiConfig.auth).getTokenExpiryTime();
  }

  /** Returns the timestamp when the current token was issued, in milliseconds since epoch, or null if not available. */
  public getTokenIssuedAt(): number | null {
    const apiConfig = this.config.apis[this.apiType];
    if (!apiConfig) {
      throw new ConfigurationError(`API configuration not found for ${this.apiType}`);
    }
    return this.runtime.getAuthenticationManager(this.config.authUrl, apiConfig.auth).getTokenIssuedAt();
  }

  /**
   * Returns the token lifetime in milliseconds, or null if not available. Useful for calculating when to schedule
   * proactive token refresh (e.g., at 50% of lifetime or 2 minutes before expiry, whichever is later).
   */
  public getTokenLifetimeMs(): number | null {
    const apiConfig = this.config.apis[this.apiType];
    if (!apiConfig) {
      throw new ConfigurationError(`API configuration not found for ${this.apiType}`);
    }
    return this.runtime.getAuthenticationManager(this.config.authUrl, apiConfig.auth).getTokenLifetimeMs();
  }

  public async makeGetRequest<T>(url: string, config: RequestConfig = {}): Promise<T> {
    return this.httpClient.makeGetRequest<T>(url, config);
  }

  public async makePostRequest<T>(url: string, data: unknown, config: RequestConfig = {}): Promise<T> {
    return this.httpClient.makePostRequest<T>(url, data, config);
  }

  public async makeDeleteRequest<T>(url: string, config: RequestConfig = {}): Promise<T> {
    return this.httpClient.makeDeleteRequest<T>(url, config);
  }

  public async makePatchRequest<T>(url: string, data: unknown, config: RequestConfig = {}): Promise<T> {
    return this.httpClient.makePatchRequest<T>(url, data, config);
  }

  public getLogger(): import('./logging').Logger | undefined {
    return this.clientConfig.logger;
  }

  public getApiUrl(): string {
    const apiConfig = this.config.apis[this.apiType];
    if (!apiConfig?.apiUrl) {
      throw new ConfigurationError(`API URL not configured for ${this.apiType}`);
    }
    return apiConfig.apiUrl;
  }

  public getPartyId(): PartyId {
    // Use provided configuration first, fall back to API config
    const apiConfig = this.config.apis[this.apiType];
    if (apiConfig?.partyId) {
      return apiConfig.partyId as PartyId;
    }
    if (this.clientConfig.partyId) {
      return this.clientConfig.partyId as PartyId;
    }
    throw new ConfigurationError(`Party ID not configured. Set partyId in client config or call setPartyId().`);
  }

  /**
   * Set the party ID for this client. Useful for LocalNet where party ID is discovered at runtime after client
   * initialization.
   */
  public setPartyId(partyId: PartyId | string): void {
    this.clientConfig.partyId = partyId;
  }

  public getUserId(): UserId | undefined {
    // Use provided configuration first, fall back to API config
    const apiConfig = this.config.apis[this.apiType];
    if (apiConfig?.userId) {
      return apiConfig.userId as UserId;
    }
    return this.clientConfig.userId as UserId | undefined;
  }

  public getManagedParties(): readonly string[] {
    // For now, always use environment variables for managed parties
    // as this is not typically provided in the API config
    return this.clientConfig.managedParties ?? [];
  }

  public buildPartyList(additionalParties: readonly string[] = []): string[] {
    const managedParties = this.getManagedParties();
    const partyId = this.getPartyId();

    const partyList: string[] = [...additionalParties, ...managedParties];

    if (!partyList.includes(partyId)) {
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

  public getRuntime(): CantonRuntime {
    return this.runtime;
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
