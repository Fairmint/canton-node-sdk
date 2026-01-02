/**
 * Shared test configuration utilities for integration tests.
 *
 * Tests use the SDK's built-in localnet defaults with OAuth2 authentication (cn-quickstart with OAuth2).
 *
 * @example
 *   LocalNet usage (default)
 *   ```bash
 *   npm run test
 *   ```
 */

import type { ClientConfig } from '../../src';

/**
 * Build a ClientConfig for integration tests.
 *
 * Returns LocalNet configuration using SDK's built-in OAuth2 defaults for cn-quickstart.
 * The SDK automatically configures:
 * - OAuth2 auth URL (Keycloak at localhost:8082)
 * - API endpoints (Validator: 3903, JSON API: 3975, Scan: 4000/api/scan)
 * - Client credentials (app-provider-validator)
 *
 * @returns ClientConfig for use with SDK clients
 */
export function buildIntegrationTestClientConfig(): ClientConfig {
  // Use SDK's built-in localnet defaults with OAuth2
  // This matches cn-quickstart setup with "make setup" option 2 (with OAuth2)
  // Must specify provider to get the correct API endpoints and credentials
  return {
    network: 'localnet',
    provider: 'app-provider',
  };
}

/**
 * Sleep for a specified number of milliseconds.
 *
 * @param ms - Milliseconds to sleep
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function until it succeeds or times out.
 *
 * @param fn - Async function to retry
 * @param options - Retry options
 * @returns The result of the function
 * @throws The last error if all retries fail
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
    description?: string;
  } = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const description = options.description ?? 'operation';

  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      await sleep(pollIntervalMs);
    }
  }

  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${(lastError as Error).message}` : ''}`);
}
