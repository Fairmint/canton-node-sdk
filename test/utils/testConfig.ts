/**
 * Shared test configuration utilities for integration tests.
 *
 * Tests are configured for LocalNet (cn-quickstart) with shared-secret authentication by default.
 *
 * @example
 *   LocalNet usage (default)
 *   ```bash
 *   npm run test
 *   ```
 */

import jwt from 'jsonwebtoken';

import type { ClientConfig } from '../../src';

/**
 * Get an environment variable value, returning undefined if empty or not set.
 *
 * @param name - Environment variable name
 * @returns The value or undefined if not set/empty
 */
function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

/**
 * Generate a JWT for shared-secret authentication in LocalNet.
 *
 * This creates a JWT signed with the 'unsafe' secret, which is the default for cn-quickstart shared-secret mode.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- tokenGenerator requires Promise<string>
async function generateSharedSecretJwt(): Promise<string> {
  const secret = getEnv('CN_TEST_SHARED_SECRET') ?? 'unsafe';
  return jwt.sign(
    {
      sub: 'ledger-api-user',
      aud: 'https://canton.network.global',
    },
    secret,
    { algorithm: 'HS256', expiresIn: '2h' }
  );
}

/**
 * Build a ClientConfig for integration tests.
 *
 * Returns LocalNet configuration with shared-secret authentication.
 *
 * @returns ClientConfig for use with SDK clients
 */
export function buildIntegrationTestClientConfig(): ClientConfig {
  // Allow overriding via env vars for flexibility
  const ledgerApiUrl = getEnv('CN_TEST_LEDGER_API_URL') ?? 'http://localhost:3975';
  const validatorApiUrl = getEnv('CN_TEST_VALIDATOR_API_URL') ?? 'http://localhost:3903';
  const scanApiUrl = getEnv('CN_TEST_SCAN_API_URL') ?? 'http://localhost:4000';

  return {
    network: 'localnet',
    apis: {
      LEDGER_JSON_API: {
        apiUrl: ledgerApiUrl,
        auth: {
          grantType: 'none',
          tokenGenerator: generateSharedSecretJwt,
        },
      },
      VALIDATOR_API: {
        apiUrl: validatorApiUrl,
        auth: {
          grantType: 'none',
          tokenGenerator: generateSharedSecretJwt,
        },
      },
      SCAN_API: {
        apiUrl: scanApiUrl,
        auth: {
          grantType: 'none',
        },
      },
    },
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
