export type NetworkType = 'devnet' | 'testnet' | 'mainnet' | 'localnet';
export type ProviderType = string;

export type ApiType = 'LEDGER_JSON_API' | 'VALIDATOR_API' | 'SCAN_API';

export interface AuthConfig {
  grantType: string;
  clientId?: string;
  clientSecret?: string;
  username?: string;
  password?: string;
  audience?: string;
  scope?: string;
  /**
   * Static bearer token for auth modes that don't use OAuth2. If provided, this token is used directly without OAuth2
   * exchange.
   */
  bearerToken?: string;
  /** Async function to generate a bearer token dynamically. Used for JWT-based authentication. */
  tokenGenerator?: () => Promise<string>;
}

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
  contentType?: string;
  includeBearerToken?: boolean;
}

export interface ClientConfig {
  network: NetworkType;
  provider?: ProviderType;
  logger?: import('./logging').Logger;

  /**
   * Enable debug mode with verbose console logging.
   * When true, logs all API requests/responses to console.
   * Can also be enabled via CANTON_DEBUG=1 environment variable.
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
