import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { NetworkType, ProviderType } from '../types';
import { ConfigurationError } from '../errors';

// Load environment variables with fallback to parent directory
const currentEnvPath = '.env';
const parentEnvPath = path.join('..', '.env');

// Try to load from current directory first
let result = config({ path: currentEnvPath });

// If no .env file found in current directory, try parent directory
if (result.error && fs.existsSync(parentEnvPath)) {
  result = config({ path: parentEnvPath });

  if (result.error) {
    console.warn(
      'Failed to load .env file from parent directory:',
      result.error.message
    );
  }
}

/** Singleton class for managing environment variables and configuration */
export class EnvironmentConfig {
  private static instance: EnvironmentConfig;
  private env: Record<string, string | undefined>;

  private constructor() {
    this.env = process.env;
  }

  public static getInstance(): EnvironmentConfig {
    if (!EnvironmentConfig.instance) {
      EnvironmentConfig.instance = new EnvironmentConfig();
    }
    return EnvironmentConfig.instance;
  }

  public getNodeEnv(): 'development' | 'production' | 'test' {
    const value = this.env['NODE_ENV'] || 'development';
    if (!['development', 'production', 'test'].includes(value)) {
      throw new ConfigurationError(
        `Invalid NODE_ENV: ${value}. Must be 'development', 'production', or 'test'`
      );
    }
    return value as 'development' | 'production' | 'test';
  }

  public getCurrentNetwork(): NetworkType {
    const value = this.env['CANTON_CURRENT_NETWORK']?.toLowerCase();
    if (!value || !['devnet', 'testnet', 'mainnet'].includes(value)) {
      throw new ConfigurationError(
        'Missing or invalid CANTON_CURRENT_NETWORK. Must be "devnet", "testnet", or "mainnet"'
      );
    }
    return value as NetworkType;
  }

  public getCurrentProvider(): ProviderType {
    const value = this.env['CANTON_CURRENT_PROVIDER']?.toLowerCase();
    if (!value || !['intellect', '5n'].includes(value)) {
      throw new ConfigurationError(
        'Missing or invalid CANTON_CURRENT_PROVIDER. Must be "intellect" or "5n"'
      );
    }
    return value as ProviderType;
  }

  public getApiUri(apiType: string, network?: NetworkType, provider?: ProviderType): string {
    const targetNetwork = network || this.getCurrentNetwork();
    const targetProvider = provider || this.getCurrentProvider();

    const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_${apiType.toUpperCase()}_URI`;
    const uri = this.env[envKey];

    if (!uri) {
      throw new ConfigurationError(`Missing required environment variable: ${envKey}`);
    }

    return uri;
  }

  public getApiClientId(apiType: string, network?: NetworkType, provider?: ProviderType): string | undefined {
    const targetNetwork = network || this.getCurrentNetwork();
    const targetProvider = provider || this.getCurrentProvider();

    const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_${apiType.toUpperCase()}_CLIENT_ID`;
    return this.env[envKey];
  }

  public getApiClientSecret(apiType: string, network?: NetworkType, provider?: ProviderType): string | undefined {
    const targetNetwork = network || this.getCurrentNetwork();
    const targetProvider = provider || this.getCurrentProvider();

    const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_${apiType.toUpperCase()}_CLIENT_SECRET`;
    return this.env[envKey];
  }

  public getAuthUrl(network?: NetworkType, provider?: ProviderType): string {
    const targetNetwork = network || this.getCurrentNetwork();
    const targetProvider = provider || this.getCurrentProvider();

    const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_AUTH_URL`;
    const authUrl = this.env[envKey];

    if (!authUrl) {
      throw new ConfigurationError(`Missing required environment variable: ${envKey}`);
    }

    return authUrl;
  }

  public getPartyId(network?: NetworkType, provider?: ProviderType): string {
    const targetNetwork = network || this.getCurrentNetwork();
    const targetProvider = provider || this.getCurrentProvider();

    const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_PARTY_ID`;
    const partyId = this.env[envKey];

    if (!partyId) {
      throw new ConfigurationError(`Missing required environment variable: ${envKey}`);
    }

    return partyId;
  }

  public getUserId(network?: NetworkType, provider?: ProviderType): string | undefined {
    const targetNetwork = network || this.getCurrentNetwork();
    const targetProvider = provider || this.getCurrentProvider();

    const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_USER_ID`;
    return this.env[envKey];
  }

  public getDatabaseUrl(network?: NetworkType): string {
    const targetNetwork = network || this.getCurrentNetwork();
    const envKey = `CANTON_${targetNetwork.toUpperCase()}_DATABASE_URL`;
    const databaseUrl = this.env[envKey];

    if (!databaseUrl) {
      throw new ConfigurationError(`Missing required environment variable: ${envKey}`);
    }

    return databaseUrl;
  }

  public getManagedParties(network?: NetworkType, provider?: ProviderType): string[] {
    const targetNetwork = network || this.getCurrentNetwork();
    const targetProvider = provider || this.getCurrentProvider();

    const envKey = `CANTON_${targetNetwork.toUpperCase()}_${targetProvider.toUpperCase()}_MANAGED_PARTIES`;
    const managedParties = this.env[envKey];

    if (!managedParties) {
      return [];
    }

    return managedParties.split(',').map(party => party.trim()).filter(party => party.length > 0);
  }
} 