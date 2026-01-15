import { AuthenticationManager } from './auth/AuthenticationManager';
import { EnvLoader } from './config/EnvLoader';
import { ConfigurationError } from './errors';
import { HttpClient } from './http/HttpClient';
import { CompositeLogger, ConsoleLogger, FileLogger, type Logger } from './logging';
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
      defaultConfig.logger = this.createLogger(undefined, this.isDebugEnabled(undefined));
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
        logger: config.logger ?? this.createLogger(undefined, this.isDebugEnabled(config.debug)),
      };
    } else {
      // Config fully provided - create logger if not provided
      this.clientConfig = {
        ...config,
        logger: config.logger ?? this.createLogger(undefined, this.isDebugEnabled(config.debug)),
      };
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

  /**
   * Clears the cached authentication token, forcing a refresh on the next authenticate() call. Useful when a token has
   * expired mid-operation (e.g., during a long-running WebSocket stream).
   */
  public clearToken(): void {
    this.authManager.clearToken();
    this.httpClient.clearBearerToken();
  }

  /**
   * Returns the token expiry timestamp in milliseconds since epoch, or null if not available. Use this to schedule
   * proactive token refresh before expiration, especially for long-running WebSocket connections.
   */
  public getTokenExpiryTime(): number | null {
    return this.authManager.getTokenExpiryTime();
  }

  /** Returns the timestamp when the current token was issued, in milliseconds since epoch, or null if not available. */
  public getTokenIssuedAt(): number | null {
    return this.authManager.getTokenIssuedAt();
  }

  /**
   * Returns the token lifetime in milliseconds, or null if not available. Useful for calculating when to schedule
   * proactive token refresh (e.g., at 50% of lifetime or 2 minutes before expiry, whichever is later).
   */
  public getTokenLifetimeMs(): number | null {
    return this.authManager.getTokenLifetimeMs();
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

  /**
   * Set the party ID for this client. Useful for LocalNet where party ID is discovered at runtime after client
   * initialization.
   */
  public setPartyId(partyId: string): void {
    this.clientConfig.partyId = partyId;
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

  /** Checks if debug mode is enabled via config or environment variable. */
  private isDebugEnabled(configDebug: boolean | undefined): boolean {
    if (configDebug !== undefined) {
      return configDebug;
    }
    const envDebug = process.env['CANTON_DEBUG'];
    return envDebug !== undefined && ['1', 'true', 'yes', 'on'].includes(envDebug.toLowerCase());
  }

  /**
   * Creates a logger based on configuration. When debug is enabled, uses a CompositeLogger with both file and console
   * logging.
   */
  private createLogger(existingLogger: Logger | undefined, debug: boolean): Logger {
    if (existingLogger) {
      return existingLogger;
    }

    const fileLogger = new FileLogger();

    if (debug) {
      const consoleLogger = new ConsoleLogger({ logLevel: 'debug' });
      return new CompositeLogger([fileLogger, consoleLogger]);
    }

    return fileLogger;
  }
}
