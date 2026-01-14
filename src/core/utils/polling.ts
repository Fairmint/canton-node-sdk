import { OperationError, OperationErrorCode } from '../errors';

export interface WaitForConditionOptions {
  /** Maximum time to wait in milliseconds (default: 30000) */
  timeout?: number;
  /** Interval between checks in milliseconds (default: 1000) */
  interval?: number;
  /** Custom error message for timeout */
  timeoutMessage?: string;
}

/**
 * Polls a condition function until it returns a non-null/non-undefined value or times out.
 *
 * Return `null` or `undefined` from the check function to indicate the condition is not yet met. Any other value
 * (including falsy values like `0`, `false`, or `""`) is considered a successful result.
 *
 * @example
 *   // Wait for a contract to exist
 *   const contract = await waitForCondition(() => client.getContract(id), {
 *     timeout: 30000,
 *     interval: 1000,
 *     timeoutMessage: 'Contract not found within timeout',
 *   });
 *
 * @example
 *   // Wait for amulets to be available
 *   await waitForCondition(
 *     async () => {
 *       const amulets = await getAmulets(partyId);
 *       return amulets.length > 0 ? amulets : null;
 *     },
 *     { timeout: 60000 }
 *   );
 *
 * @param check - Function that returns a value, or null/undefined if the condition is not yet met.
 * @param options - Configuration options
 * @returns The first non-null/non-undefined value returned by the check function
 * @throws Error if the condition is not met within the timeout period
 */
export async function waitForCondition<T>(
  check: () => Promise<T | null | undefined>,
  options: WaitForConditionOptions = {}
): Promise<T> {
  const { timeout = 30000, interval = 1000, timeoutMessage = 'Timeout waiting for condition' } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await check();
    if (result !== null && result !== undefined) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new OperationError(timeoutMessage, OperationErrorCode.TRANSACTION_FAILED, { timeoutMs: timeout });
}
