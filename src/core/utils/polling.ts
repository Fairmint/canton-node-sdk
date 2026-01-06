export interface WaitForConditionOptions {
  /** Maximum time to wait in milliseconds (default: 30000) */
  timeout?: number;
  /** Interval between checks in milliseconds (default: 1000) */
  interval?: number;
  /** Custom error message for timeout */
  timeoutMessage?: string;
}

/**
 * Polls a condition function until it returns a truthy value or times out.
 *
 * @param check - Function that returns a value or null/undefined. Resolves when a truthy value is returned.
 * @param options - Configuration options
 * @returns The first truthy value returned by the check function
 * @throws Error if the condition is not met within the timeout period
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
 */
export async function waitForCondition<T>(
  check: () => Promise<T | null | undefined>,
  options: WaitForConditionOptions = {}
): Promise<T> {
  const { timeout = 30000, interval = 1000, timeoutMessage = 'Timeout waiting for condition' } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await check();
    if (result != null) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(timeoutMessage);
}
