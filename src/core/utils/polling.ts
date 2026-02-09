import { OperationError, OperationErrorCode } from '../errors';

export interface WaitForConditionOptions {
  /** Maximum time to wait in milliseconds (default: 30000). */
  readonly timeout?: number;
  /** Interval between checks in milliseconds (default: 1000). */
  readonly interval?: number;
  /** Custom error message for timeout. */
  readonly timeoutMessage?: string;
}

/**
 * Polls a condition function until it returns a non-null/non-undefined value or times out.
 *
 * Return `null` or `undefined` to signal "not yet". Any other value (including falsy values like `0`, `false`, or
 * `""`) is treated as success and returned immediately.
 *
 * @example
 *   const contract = await waitForCondition(
 *     () => client.getContract(id),
 *     { timeout: 30_000, timeoutMessage: 'Contract not found' }
 *   );
 *
 * @param check - Async function returning a value when the condition is met, or `null`/`undefined` otherwise.
 * @param options - Timeout, polling interval, and error message.
 * @returns The first non-null/non-undefined value.
 * @throws {@link OperationError} if the timeout is reached.
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
