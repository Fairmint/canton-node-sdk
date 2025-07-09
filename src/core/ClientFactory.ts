import { ApiType, ClientConfig } from './types';
import { BaseClient } from './BaseClient';
import { ConfigurationError } from './errors';

/** Factory for creating and managing API client instances */
export class ClientFactory {
  private static clientRegistry: Map<
    ApiType,
    new (config?: Partial<ClientConfig>) => BaseClient
  > = new Map();

  /**
   * Register a client implementation for a specific API type
   */
  public static registerClient(
    apiType: ApiType,
    clientClass: new (config?: Partial<ClientConfig>) => BaseClient
  ): void {
    this.clientRegistry.set(apiType, clientClass);
  }

  /**
   * Create a client for the specified API type
   */
  public static createClient(
    apiType: ApiType,
    config?: Partial<ClientConfig>
  ): BaseClient {
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
