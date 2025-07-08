import { config } from 'dotenv';

// Load environment variables from .env file
config();

/**
 * Environment variable configuration with strong typing
 */
export interface EnvConfig {
  // Development/Testing
  NODE_ENV?: 'development' | 'production' | 'test';
  CANTON_CURRENT_NETWORK?: 'devnet' | 'testnet' | 'mainnet';
  CANTON_CURRENT_PROVIDER?: string;

  // Dynamic API configuration - will be populated based on environment variables
  [key: string]: string | undefined;
}

/**
 * Parse and validate environment variables
 */
function parseEnvVar<T>(
  key: string,
  parser: (value: string) => T,
  defaultValue?: T
): T {
  const value = process.env[key];

  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing required environment variable: ${key}`);
  }

  try {
    return parser(value);
  } catch {
    throw new Error(`Invalid value for environment variable ${key}: ${value}`);
  }
}

/**
 * Parse node environment variable
 */
function parseNodeEnv(value: string): 'development' | 'production' | 'test' {
  if (!['development', 'production', 'test'].includes(value)) {
    throw new Error(
      `Invalid NODE_ENV: ${value}. Must be 'development', 'production', or 'test'`
    );
  }
  return value as 'development' | 'production' | 'test';
}

/**
 * Environment configuration object
 */
export const env: EnvConfig = {
  // Development/Testing
  NODE_ENV: parseEnvVar('NODE_ENV', parseNodeEnv, 'development'),
  CANTON_CURRENT_NETWORK: parseEnvVar('CANTON_CURRENT_NETWORK', value => {
    if (!['devnet', 'testnet', 'mainnet'].includes(value)) {
      throw new Error(
        `Invalid CANTON_CURRENT_NETWORK: ${value}. Must be 'devnet', 'testnet', or 'mainnet'`
      );
    }
    return value as 'devnet' | 'testnet' | 'mainnet';
  }),
  CANTON_CURRENT_PROVIDER: parseEnvVar('CANTON_CURRENT_PROVIDER', String),
};

/**
 * Helper function to get API URI for a specific API type, network, and provider
 */
export function getApiUri(
  apiType: string,
  network?: string,
  provider?: string
): string {
  const targetNetwork = network || env.CANTON_CURRENT_NETWORK;
  const targetProvider = provider || env.CANTON_CURRENT_PROVIDER;

  if (!targetNetwork || !targetProvider) {
    throw new Error(
      'Network and provider must be specified or available in environment'
    );
  }

  const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_${apiType.toUpperCase()}_URI`;
  const uri = process.env[envKey];

  if (!uri) {
    throw new Error(`Missing required environment variable: ${envKey}`);
  }

  return uri;
}

/**
 * Helper function to get API client ID for a specific API type, network, and provider
 */
export function getApiClientId(
  apiType: string,
  network?: string,
  provider?: string
): string | undefined {
  const targetNetwork = network || env.CANTON_CURRENT_NETWORK;
  const targetProvider = provider || env.CANTON_CURRENT_PROVIDER;

  if (!targetNetwork || !targetProvider) {
    return undefined;
  }

  const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_${apiType.toUpperCase()}_CLIENT_ID`;
  return process.env[envKey];
}

/**
 * Helper function to get API client secret for a specific API type, network, and provider
 */
export function getApiClientSecret(
  apiType: string,
  network?: string,
  provider?: string
): string | undefined {
  const targetNetwork = network || env.CANTON_CURRENT_NETWORK;
  const targetProvider = provider || env.CANTON_CURRENT_PROVIDER;

  if (!targetNetwork || !targetProvider) {
    return undefined;
  }

  const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_${apiType.toUpperCase()}_CLIENT_SECRET`;
  return process.env[envKey];
}

/**
 * Helper function to get API configuration for a specific API type, network, and provider
 */
export function getApiConfig(
  apiType: string,
  network?: string,
  provider?: string
): {
  uri: string;
  clientId?: string;
  clientSecret?: string;
} {
  const clientId = getApiClientId(apiType, network, provider);
  const clientSecret = getApiClientSecret(apiType, network, provider);

  return {
    uri: getApiUri(apiType, network, provider),
    ...(clientId && { clientId }),
    ...(clientSecret && { clientSecret }),
  };
}

/**
 * Helper function to check if authentication is configured
 */
export function hasAuthentication(): boolean {
  return !!(getApiClientId('LEDGER_API') || getApiClientSecret('LEDGER_API'));
}

/**
 * Helper function to get authentication headers
 */
export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  const clientId = getApiClientId('LEDGER_API');
  const clientSecret = getApiClientSecret('LEDGER_API');

  if (clientId) {
    headers['X-Client-ID'] = clientId;
  }

  if (clientSecret) {
    headers['X-Client-Secret'] = clientSecret;
  }

  return headers;
}

/**
 * Helper function to validate required environment variables for specific features
 */
export function validateRequiredEnvVars(
  feature: string,
  requiredVars: string[]
): void {
  const missing: string[] = [];

  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (value === undefined || value === null || value === '') {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for ${feature}: ${missing.join(', ')}`
    );
  }
}

export default env;
