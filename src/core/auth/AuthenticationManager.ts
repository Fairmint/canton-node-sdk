import {
  AuthenticationManager as RestClientAuthManager,
  type AuthConfig as RestClientAuthConfig,
  type RestClientLogger,
} from '@hardlydifficult/rest-client';
import { type Logger } from '../logging';
import { type AuthConfig } from '../types';

export interface AuthResponse {
  readonly access_token: string;
  readonly token_type?: string;
  readonly expires_in?: number;
  readonly scope?: string;
}

/**
 * Manages OAuth2 authentication and token lifecycle. Delegates to `@hardlydifficult/rest-client`'s
 * AuthenticationManager internally.
 */
export class AuthenticationManager {
  private readonly delegate: RestClientAuthManager;

  constructor(authUrl: string, authConfig: AuthConfig, logger?: Logger) {
    const restAuthConfig = convertAuthConfig(authUrl, authConfig);
    this.delegate = new RestClientAuthManager(restAuthConfig, toRestLogger(logger));
  }

  public async authenticate(): Promise<string> {
    return this.delegate.authenticate();
  }

  public async getBearerToken(): Promise<string> {
    return this.authenticate();
  }

  public clearToken(): void {
    this.delegate.clearToken();
  }

  public getTokenExpiryTime(): number | null {
    return this.delegate.getTokenExpiryTime();
  }

  public getTokenIssuedAt(): number | null {
    return this.delegate.getTokenIssuedAt();
  }

  public getTokenLifetimeMs(): number | null {
    return this.delegate.getTokenLifetimeMs();
  }
}

/** Converts Canton's auth config format to rest-client's auth config format. */
function convertAuthConfig(authUrl: string, config: AuthConfig): RestClientAuthConfig {
  if (config.bearerToken) {
    return { type: 'bearer', token: config.bearerToken };
  }

  if (config.tokenGenerator) {
    return { type: 'generator', generate: config.tokenGenerator };
  }

  if (!config.clientId || config.clientId.trim() === '') {
    return { type: 'none' };
  }

  const tokenUrl = authUrl.endsWith('/') ? authUrl : `${authUrl}/`;

  if (config.grantType === 'password') {
    return {
      type: 'oauth2' as const,
      tokenUrl,
      clientId: config.clientId,
      grantType: 'password' as const,
      username: config.username,
      password: config.password,
      ...(config.audience ? { audience: config.audience } : {}),
      ...(config.scope ? { scope: config.scope } : {}),
    };
  }

  return {
    type: 'oauth2' as const,
    tokenUrl,
    clientId: config.clientId,
    grantType: 'client_credentials' as const,
    ...(config.clientSecret ? { clientSecret: config.clientSecret } : {}),
    ...(config.audience ? { audience: config.audience } : {}),
    ...(config.scope ? { scope: config.scope } : {}),
  };
}

/** Adapts Canton's Logger to rest-client's RestClientLogger. */
function toRestLogger(logger: Logger | undefined): RestClientLogger | undefined {
  if (!logger) return undefined;
  const adapted: RestClientLogger = {};
  if (logger.debug) adapted.debug = logger.debug.bind(logger);
  if (logger.info) adapted.info = logger.info.bind(logger);
  if (logger.warn) adapted.warn = logger.warn.bind(logger);
  if (logger.error) adapted.error = logger.error.bind(logger);
  return adapted;
}
