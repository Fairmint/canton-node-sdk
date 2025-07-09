import { z } from 'zod';

export type NetworkType = 'devnet' | 'testnet' | 'mainnet';
export type ProviderType = 'intellect' | '5n';

export type ApiType = 'LEDGER_JSON_API' | 'VALIDATOR_API' | 'SCAN_API';

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

export interface ProviderConfig {
  providerName: string;
  authUrl: string;
  apis: Record<ApiType, ApiConfig>;
}

export interface RequestConfig {
  contentType?: string;
  includeBearerToken?: boolean;
}

export interface ApiOperationConfig<Params, Response> {
  paramsSchema: z.ZodSchema<Params>;
  operation: string;
  method: 'GET' | 'POST';
  buildUrl: (params: Params, apiUrl: string) => string;
  buildRequestData?: (params: Params) => unknown;
  requestConfig?: RequestConfig;
  transformResponse?: (response: unknown) => Response;
}

export interface ClientConfig {
  network: NetworkType;
  provider: ProviderType;
  enableLogging?: boolean;
  logDir?: string;
}
