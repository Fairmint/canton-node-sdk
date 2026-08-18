import {
  DEFAULT_READ_RETRY_DELAYS_MS,
  DEFAULT_READ_RETRY_MAX_ATTEMPTS,
  defaultReadRetryBackoffMs,
} from '../../../src/core/http/request-retry';

describe('default read retry schedule', () => {
  it('has six total attempts and delays that sum to 60s', () => {
    expect(DEFAULT_READ_RETRY_MAX_ATTEMPTS).toBe(DEFAULT_READ_RETRY_DELAYS_MS.length + 1);
    expect(DEFAULT_READ_RETRY_MAX_ATTEMPTS).toBe(6);
    expect([...DEFAULT_READ_RETRY_DELAYS_MS]).toEqual([2000, 5000, 10000, 20000, 23000]);
    expect(DEFAULT_READ_RETRY_DELAYS_MS.reduce((sum, delayMs) => sum + delayMs, 0)).toBe(60_000);
  });

  it.each([
    [1, 2000],
    [2, 5000],
    [3, 10000],
    [4, 20000],
    [5, 23000],
  ] as const)(
    'maps failed attempt %i to %i ms (waitForRetry passes the failed attempt, not the next one)',
    (attempt, delayMs) => {
      expect(defaultReadRetryBackoffMs({ attempt })).toBe(delayMs);
    }
  );
});
