/** Canton network environments. */
export type NetworkType = 'devnet' | 'testnet' | 'mainnet' | 'localnet';

/** Provider identifier (e.g., '5n', 'app-provider'). */
export type ProviderType = string;

/** API client types supported by the SDK. */
export type ApiType = 'LEDGER_JSON_API' | 'VALIDATOR_API' | 'SCAN_API';

/** Supported OAuth2 grant types. */
export type GrantType = 'client_credentials' | 'password';

/** Shared OAuth2 fields present in all auth configs. */
interface AuthConfigBase {
  readonly clientId: string;
  readonly audience?: string;
  readonly scope?: string;
  /**
   * Static bearer token for auth modes that don't use OAuth2. If provided, this token is used directly without OAuth2
   * exchange.
   */
  readonly bearerToken?: string;
  /** Async function to generate a bearer token dynamically. Used for shared-secret JWT generation. */
  readonly tokenGenerator?: () => Promise<string>;
}

/** Auth config for client_credentials grant type. */
export interface ClientCredentialsAuthConfig extends AuthConfigBase {
  readonly grantType: 'client_credentials';
  readonly clientSecret?: string;
}

/** Auth config for password grant type. */
export interface PasswordAuthConfig extends AuthConfigBase {
  readonly grantType: 'password';
  readonly username: string;
  readonly password: string;
}

/** Discriminated union of all auth configurations, keyed on `grantType`. */
export type AuthConfig = ClientCredentialsAuthConfig | PasswordAuthConfig;

/** Configuration for a single API endpoint. */
export interface ApiConfig {
  apiUrl: string;
  readonly auth: AuthConfig;
  partyId?: string;
  userId?: string;
}

/** Full provider configuration with all API types required. */
export interface ProviderConfig {
  readonly providerName: string;
  readonly authUrl: string;
  readonly apis: Record<ApiType, ApiConfig>;
}

/** Partial provider configuration where not all API types are required. */
export interface PartialProviderConfig {
  readonly providerName: string;
  readonly authUrl: string;
  readonly apis: Partial<Record<ApiType, ApiConfig>>;
}

/** Configuration for individual HTTP requests. */
export interface RequestConfig {
  readonly contentType?: 'application/json' | 'application/octet-stream';
  readonly includeBearerToken?: boolean;
}

/** Top-level configuration for creating API clients. */
export interface ClientConfig {
  readonly network: NetworkType;
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
