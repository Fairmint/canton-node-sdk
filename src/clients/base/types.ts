export interface ApiConfig {
  API_URL: string;
  GRANT_TYPE: string;
  CLIENT_ID: string;
  AUDIENCE?: string;
  CLIENT_SECRET?: string;
  USERNAME?: string;
  PASSWORD?: string;
  SCOPE?: string;
}

export enum ApiType {
  LEDGER_API = 'LEDGER_API',
  JSON_API = 'JSON_API',
  VALIDATOR_API = 'VALIDATOR_API',
  SCAN_API = 'SCAN_API',
}

export interface ProviderConfigENVFormat {
  PROVIDER_NAME: string;
  AUTH_URL: string;
  JSON_API: Partial<
    ApiConfig & {
      PARTY_ID: string;
      USER_ID?: string;
    }
  >;
  VALIDATOR_API: Partial<
    ApiConfig & {
      PARTY_ID: string;
      USER_ID?: string;
    }
  >;
  SCAN_API: Partial<ApiConfig>;
}

export interface AuthResponse {
  access_token: string;
}

export type NetworkType = 'mainnet' | 'devnet';
export type ProviderType = 'intellect' | '5n';
