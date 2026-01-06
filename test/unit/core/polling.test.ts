import { waitForCondition } from '../../../src/core/utils/polling';

describe('waitForCondition', () => {
  it('returns immediately when condition is true on first check', async () => {
    const check = jest.fn().mockResolvedValue('success');

    const result = await waitForCondition(check, { timeout: 1000, interval: 100 });

    expect(result).toBe('success');
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('polls until condition becomes true', async () => {
    let callCount = 0;
    const check = jest.fn().mockImplementation(async () => {
      callCount++;
      return Promise.resolve(callCount >= 3 ? 'found' : null);
    });

    const result = await waitForCondition(check, { timeout: 5000, interval: 50 });

    expect(result).toBe('found');
    expect(check).toHaveBeenCalledTimes(3);
  });

  it('throws error on timeout with default message', async () => {
    const check = jest.fn().mockResolvedValue(null);

    await expect(waitForCondition(check, { timeout: 100, interval: 30 })).rejects.toThrow(
      'Timeout waiting for condition'
    );
  });

  it('throws error on timeout with custom message', async () => {
    const check = jest.fn().mockResolvedValue(null);

    await expect(
      waitForCondition(check, {
        timeout: 100,
        interval: 30,
        timeoutMessage: 'Custom timeout message',
      })
    ).rejects.toThrow('Custom timeout message');
  });

  it('uses default options when none provided', async () => {
    const check = jest.fn().mockResolvedValue('result');

    const result = await waitForCondition(check);

    expect(result).toBe('result');
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('treats undefined as falsy', async () => {
    let callCount = 0;
    const check = jest.fn().mockImplementation(async () => {
      callCount++;
      return Promise.resolve(callCount >= 2 ? 'value' : undefined);
    });

    const result = await waitForCondition(check, { timeout: 1000, interval: 50 });

    expect(result).toBe('value');
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('accepts zero as a valid truthy result', async () => {
    const check = jest.fn().mockResolvedValue(0);

    const result = await waitForCondition(check, { timeout: 1000, interval: 100 });

    expect(result).toBe(0);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('accepts empty string as a valid result', async () => {
    const check = jest.fn().mockResolvedValue('');

    const result = await waitForCondition(check, { timeout: 1000, interval: 100 });

    expect(result).toBe('');
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('accepts false as a valid result', async () => {
    const check = jest.fn().mockResolvedValue(false);

    const result = await waitForCondition(check, { timeout: 1000, interval: 100 });

    expect(result).toBe(false);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('returns typed result', async () => {
    interface MyResult {
      id: string;
      value: number;
    }

    const check = jest.fn().mockResolvedValue({ id: 'test', value: 42 });

    const result = await waitForCondition<MyResult>(check, { timeout: 1000 });

    expect(result.id).toBe('test');
    expect(result.value).toBe(42);
  });

  it('waits for the interval between checks', async () => {
    let callCount = 0;
    const check = jest.fn().mockImplementation(async () => {
      callCount++;
      return Promise.resolve(callCount >= 2 ? 'done' : null);
    });

    const start = Date.now();
    const result = await waitForCondition(check, { timeout: 5000, interval: 50 });
    const elapsed = Date.now() - start;

    expect(result).toBe('done');
    expect(check).toHaveBeenCalledTimes(2);
    // Should have waited at least one interval
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  it('times out after the specified duration', async () => {
    const check = jest.fn().mockResolvedValue(null);

    const start = Date.now();
    await expect(
      waitForCondition(check, { timeout: 100, interval: 20, timeoutMessage: 'Timed out' })
    ).rejects.toThrow('Timed out');
    const elapsed = Date.now() - start;

    // Should have taken approximately the timeout duration
    expect(elapsed).toBeGreaterThanOrEqual(90);
    expect(elapsed).toBeLessThan(300);
  });
});
