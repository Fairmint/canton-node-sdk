export type NetworkType = 'devnet' | 'testnet' | 'mainnet' | 'localnet';
export type ProviderType = string;

export type ApiType = 'LEDGER_JSON_API' | 'VALIDATOR_API' | 'SCAN_API';

/** Supported OAuth2 grant types */
export type GrantType = 'client_credentials' | 'password';

/** Shared OAuth2 fields present in all auth configs */
interface AuthConfigBase {
  clientId: string;
  audience?: string;
  scope?: string;
  /**
   * Static bearer token for auth modes that don't use OAuth2. If provided, this token is used directly without OAuth2
   * exchange.
   */
  bearerToken?: string;
  /** Async function to generate a bearer token dynamically. Used for shared-secret JWT generation. */
  tokenGenerator?: () => Promise<string>;
}

/** Auth config for client_credentials grant type */
export interface ClientCredentialsAuthConfig extends AuthConfigBase {
  grantType: 'client_credentials';
  clientSecret?: string;
}

/** Auth config for password grant type */
export interface PasswordAuthConfig extends AuthConfigBase {
  grantType: 'password';
  username: string;
  password: string;
}

/** Discriminated union of all auth configurations, keyed on grantType */
export type AuthConfig = ClientCredentialsAuthConfig | PasswordAuthConfig;

export interface ApiConfig {
  apiUrl: string;
  auth: AuthConfig;
  partyId?: string;
  userId?: string;
}

export interface ProviderConfig {
  providerName: string;
  authUrl: string;
  apis: Record<ApiType, ApiConfig>;
}

export interface PartialProviderConfig {
  providerName: string;
  authUrl: string;
  apis: Partial<Record<ApiType, ApiConfig>>;
}

export interface RequestConfig {
  contentType?: 'application/json' | 'application/octet-stream';
  includeBearerToken?: boolean;
}

export interface ClientConfig {
  network: NetworkType;
  provider?: ProviderType;
  logger?: import('./logging').Logger;

  /**
   * Enable debug mode with verbose console logging. When true, logs all API requests/responses to console. Can also be
   * enabled via CANTON_DEBUG=1 environment variable.
   */
  debug?: boolean;

  // Direct configuration options
  authUrl?: string;
  partyId?: string;
  userId?: string;
  managedParties?: string[];
  apis?: {
    LEDGER_JSON_API?: ApiConfig;
    VALIDATOR_API?: ApiConfig;
    SCAN_API?: ApiConfig;
  };
}
