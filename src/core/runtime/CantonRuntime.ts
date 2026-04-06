import { AuthenticationManager } from '../auth/AuthenticationManager';
import { EnvLoader } from '../config/EnvLoader';
import { ConfigurationError } from '../errors';
import { CompositeLogger, ConsoleLogger, FileLogger, type Logger } from '../logging';
import { type ApiConfig, type ApiType, type AuthConfig, type ClientConfig, type NetworkType, type ProviderType } from '../types';

type RuntimeOverrides = Partial<Omit<ClientConfig, 'network'>>;
type ClientConfigWithLogger = ClientConfig & { logger: Logger };

const tokenGeneratorIds = new WeakMap<() => Promise<string>, number>();
let nextTokenGeneratorId = 0;

/**
 * Shared runtime for Canton API clients.
 *
 * A runtime owns reusable low-level dependencies such as authentication sessions and the shared base configuration from
 * which lightweight client views are created.
 */
export class CantonRuntime {
  private readonly authManagers: Map<string, AuthenticationManager>;
  private readonly baseConfig: ClientConfigWithLogger;

  constructor(config: ClientConfig, authManagers?: Map<string, AuthenticationManager>) {
    this.authManagers = authManagers ?? new Map<string, AuthenticationManager>();
    this.baseConfig = {
      ...config,
      ...(config.apis ? { apis: { ...config.apis } } : {}),
      logger: config.logger ?? createLogger(undefined, isDebugEnabled(config.debug)),
    };
  }

  /**
   * Creates a derived runtime that reuses the same shared auth-session registry while applying configuration overrides.
   */
  public fork(overrides: RuntimeOverrides): CantonRuntime {
    const forkedConfig: ClientConfig = {
      ...this.baseConfig,
      ...overrides,
      ...(overrides.apis || this.baseConfig.apis
        ? {
            apis: {
              ...(this.baseConfig.apis ?? {}),
              ...(overrides.apis ?? {}),
            },
          }
        : {}),
      ...(overrides.logger ? { logger: overrides.logger } : { logger: this.baseConfig.logger }),
    };

    return new CantonRuntime(
      forkedConfig,
      this.authManagers,
    );
  }

  /**
   * Builds a client-local config view for a specific API while keeping auth/session ownership at the runtime level.
   */
  public createClientConfig(apiType: ApiType): ClientConfig {
    const apiConfig = cloneApiConfig(this.resolveApiConfig(apiType));
    const clientConfig: ClientConfig = {
      ...this.baseConfig,
      apis: {
        [apiType]: apiConfig,
      },
    };
    return clientConfig;
  }

  public getAuthenticationManager(authUrl: string, authConfig: AuthConfig): AuthenticationManager {
    const cacheKey = buildAuthSessionKey(authUrl, authConfig);
    const existingManager = this.authManagers.get(cacheKey);
    if (existingManager) {
      return existingManager;
    }

    const manager = new AuthenticationManager(authUrl, authConfig, this.baseConfig.logger);
    this.authManagers.set(cacheKey, manager);
    return manager;
  }

  public getNetwork(): NetworkType {
    return this.baseConfig.network;
  }

  public getProvider(): ProviderType | undefined {
    return this.baseConfig.provider;
  }

  public getLogger(): Logger {
    return this.baseConfig.logger;
  }

  private resolveApiConfig(apiType: ApiType): ApiConfig {
    const configuredApi = this.baseConfig.apis?.[apiType];
    if (configuredApi) {
      return configuredApi;
    }

    const defaultConfig = EnvLoader.getConfig(apiType, {
      network: this.baseConfig.network,
      ...(this.baseConfig.provider ? { provider: this.baseConfig.provider } : {}),
    });
    const defaultApiConfig = defaultConfig.apis?.[apiType];

    if (!defaultApiConfig) {
      throw new ConfigurationError(`API configuration not found for ${apiType}`);
    }

    if (this.baseConfig.provider === undefined && defaultConfig.provider !== undefined) {
      this.baseConfig.provider = defaultConfig.provider;
    }
    if (this.baseConfig.authUrl === undefined && defaultConfig.authUrl !== undefined) {
      this.baseConfig.authUrl = defaultConfig.authUrl;
    }
    if (this.baseConfig.partyId === undefined && defaultConfig.partyId !== undefined) {
      this.baseConfig.partyId = defaultConfig.partyId;
    }
    if (this.baseConfig.userId === undefined && defaultConfig.userId !== undefined) {
      this.baseConfig.userId = defaultConfig.userId;
    }
    if (this.baseConfig.managedParties === undefined && defaultConfig.managedParties !== undefined) {
      this.baseConfig.managedParties = [...defaultConfig.managedParties];
    }

    this.baseConfig.apis = {
      ...(this.baseConfig.apis ?? {}),
      [apiType]: cloneApiConfig(defaultApiConfig),
    };

    const resolvedApiConfig = this.baseConfig.apis[apiType];
    if (!resolvedApiConfig) {
      throw new ConfigurationError(`API configuration not found for ${apiType}`);
    }
    return resolvedApiConfig;
  }
}

function cloneApiConfig(apiConfig: ApiConfig): ApiConfig {
  return {
    ...apiConfig,
    auth: { ...apiConfig.auth },
  };
}

function buildAuthSessionKey(authUrl: string, authConfig: AuthConfig): string {
  const normalizedAuthUrl = normalizeAuthUrl(authUrl);

  if (authConfig.bearerToken !== undefined) {
    return JSON.stringify({
      type: 'bearer',
      authUrl: normalizedAuthUrl,
      token: authConfig.bearerToken,
    });
  }

  if (authConfig.tokenGenerator !== undefined) {
    return JSON.stringify({
      type: 'generator',
      authUrl: normalizedAuthUrl,
      generatorId: getTokenGeneratorId(authConfig.tokenGenerator),
      audience: authConfig.audience ?? null,
      scope: authConfig.scope ?? null,
    });
  }

  if (authConfig.clientId.trim() === '') {
    return JSON.stringify({
      type: 'none',
      authUrl: normalizedAuthUrl,
    });
  }

  if (authConfig.grantType === 'password') {
    return JSON.stringify({
      type: 'oauth2-password',
      authUrl: normalizedAuthUrl,
      clientId: authConfig.clientId,
      username: authConfig.username,
      password: authConfig.password,
      audience: authConfig.audience ?? null,
      scope: authConfig.scope ?? null,
    });
  }

  return JSON.stringify({
    type: 'oauth2-client-credentials',
    authUrl: normalizedAuthUrl,
    clientId: authConfig.clientId,
    clientSecret: authConfig.clientSecret ?? null,
    audience: authConfig.audience ?? null,
    scope: authConfig.scope ?? null,
  });
}

function getTokenGeneratorId(tokenGenerator: () => Promise<string>): number {
  const existingId = tokenGeneratorIds.get(tokenGenerator);
  if (existingId !== undefined) {
    return existingId;
  }

  nextTokenGeneratorId += 1;
  tokenGeneratorIds.set(tokenGenerator, nextTokenGeneratorId);
  return nextTokenGeneratorId;
}

function normalizeAuthUrl(authUrl: string): string {
  return authUrl.endsWith('/') ? authUrl.slice(0, -1) : authUrl;
}

function isDebugEnabled(configDebug: boolean | undefined): boolean {
  if (configDebug !== undefined) {
    return configDebug;
  }
  const envDebug = process.env['CANTON_DEBUG'];
  return envDebug !== undefined && ['1', 'true', 'yes', 'on'].includes(envDebug.toLowerCase());
}

function createLogger(existingLogger: Logger | undefined, debug: boolean): Logger {
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
