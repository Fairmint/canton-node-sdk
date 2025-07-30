export type NetworkType = 'devnet' | 'testnet' | 'mainnet';
export type ProviderType = 'intellect' | '5n';

export type ApiType =
  | 'LEDGER_JSON_API'
  | 'VALIDATOR_API'
  | 'SCAN_API'
  | 'LIGHTHOUSE_API';

export interface AuthConfig {
  grantType: string;
  clientId: string;
  clientSecret?: string;
  username?: string;
  password?: string;
  audience?: string;
  scope?: string;
}

export interface ApiConfig {
  apiUrl: string;
  auth: AuthConfig;
  partyId?: string;
  userId?: string;
}

// Simplified config for Lighthouse API which doesn't require auth
export interface LighthouseApiConfig {
  apiUrl: string;
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
  provider?: ProviderType; // Made optional for Lighthouse API
  logger?: import('./logging').Logger;

  // Direct configuration options
  authUrl?: string;
  partyId?: string;
  userId?: string;
  managedParties?: string[];
  apis?: {
    LEDGER_JSON_API?: ApiConfig;
    VALIDATOR_API?: ApiConfig;
    SCAN_API?: ApiConfig;
    LIGHTHOUSE_API?: LighthouseApiConfig; // Use simplified config
  };
}
