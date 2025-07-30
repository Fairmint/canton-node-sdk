import { ApiType, ClientConfig } from './types';
import { BaseClient, SimpleBaseClient } from './BaseClient';
import { ConfigurationError } from './errors';

/** Factory for creating and managing API client instances */
export class ClientFactory {
  private static clientRegistry: Map<
    ApiType,
    new (config: ClientConfig) => BaseClient | SimpleBaseClient
  > = new Map();

  /**
   * Register a client implementation for a specific API type
   */
  public static registerClient(
    apiType: ApiType,
    clientClass: new (config: ClientConfig) => BaseClient | SimpleBaseClient
  ): void {
    this.clientRegistry.set(apiType, clientClass);
  }

  /**
   * Create a client for the specified API type
   */
  public static createClient(
    apiType: ApiType,
    config: ClientConfig
  ): BaseClient | SimpleBaseClient {
    const ClientClass = this.clientRegistry.get(apiType);

    if (!ClientClass) {
      throw new ConfigurationError(
        `No client implementation registered for API type: ${apiType}. ` +
          `Available types: ${Array.from(this.clientRegistry.keys()).join(', ')}`
      );
    }

    return new ClientClass(config);
  }

  /**
   * Get all registered API types
   */
  public static getRegisteredApiTypes(): ApiType[] {
    return Array.from(this.clientRegistry.keys());
  }

  /**
   * Check if a client is registered for the given API type
   */
  public static hasClient(apiType: ApiType): boolean {
    return this.clientRegistry.has(apiType);
  }
}
