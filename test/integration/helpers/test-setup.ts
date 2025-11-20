/**
 * Test Setup Helper for End-to-End Tests
 *
 * This module provides utilities for setting up and configuring clients for end-to-end
 * integration tests against a running localnet instance.
 *
 * @example
 * ```typescript
 * import { createTestClient } from './helpers/test-setup';
 *
 * describe('My API Tests', () => {
 *   let client: LedgerJsonApiClient;
 *
 *   beforeAll(() => {
 *     client = createTestClient();
 *   });
 *
 *   it('should call an API', async () => {
 *     const result = await client.getVersion();
 *     expect(result).toBeDefined();
 *   });
 * });
 * ```
 */

import { LedgerJsonApiClient } from '../../../src';
import type { ClientConfig } from '../../../src/core/types';

/**
 * Creates a LedgerJsonApiClient configured for localnet testing.
 *
 * Uses the SDK's built-in localnet defaults which automatically configure:
 * - Network: 'localnet'
 * - Provider: 'app-provider'
 * - OAuth2 authentication
 * - API endpoints
 *
 * @returns A configured LedgerJsonApiClient instance
 */
export function createTestClient(): LedgerJsonApiClient {
  const config: ClientConfig = {
    network: 'localnet',
  };

  return new LedgerJsonApiClient(config);
}

/**
 * Waits for a service to be ready by checking a URL.
 *
 * @param url - The URL to check
 * @param maxAttempts - Maximum number of attempts (default: 30)
 * @param delayMs - Delay between attempts in milliseconds (default: 1000)
 * @returns Promise that resolves when the service is ready
 */
export async function waitForService(
  url: string,
  maxAttempts: number = 30,
  delayMs: number = 1000,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok || response.status === 401) {
        // 401 is OK - it means the service is up (auth will be handled by SDK)
        return;
      }
    } catch {
      // Service not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(`Service at ${url} did not become ready after ${maxAttempts} attempts`);
}
