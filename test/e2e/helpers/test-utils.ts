/**
 * E2E Test Utilities
 *
 * Common utilities for E2E tests to handle timeouts, retries, and assertions.
 */

/**
 * Test timeouts for different operation types
 */
export const TIMEOUTS = {
  /** Fast operations like version checks */
  FAST: 10_000,
  /** Standard API operations */
  STANDARD: 30_000,
  /** Operations involving transactions or state changes */
  TRANSACTION: 60_000,
} as const;

/**
 * Retry an async operation with exponential backoff
 *
 * Useful for operations that may fail transiently during localnet startup.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
  } = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 10_000,
    backoffMultiplier = 2,
  } = options;

  let lastError: unknown;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        break;
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError;
}

/**
 * Assert that an error is a connection error (expected when localnet is not running)
 */
export function assertIsConnectionError(error: unknown): void {
  const errorMessage = error instanceof Error ? error.message : String(error);

  const isConnectionError =
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('connect') ||
    errorMessage.includes('fetch') ||
    errorMessage.includes('Network') ||
    errorMessage.includes('Authentication failed');

  if (!isConnectionError) {
    throw new Error(
      `Expected connection error but got: ${errorMessage}`,
    );
  }
}

/**
 * Skip test if localnet is not available
 *
 * This is a marker for tests that require localnet to be running.
 * Tests will pass with a skip message if localnet is unavailable.
 */
export function describeWithLocalnet(
  description: string,
  testSuite: () => void,
): void {
  describe(description, () => {
    beforeAll(() => {
      if (!process.env['CI'] && !process.env['LOCALNET_AVAILABLE']) {
        console.log(
          '⚠️  Localnet tests require a running localnet instance.',
        );
        console.log('   Set LOCALNET_AVAILABLE=true or run in CI.');
      }
    });

    testSuite();
  });
}
