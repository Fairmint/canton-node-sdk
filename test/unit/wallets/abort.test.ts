import { awaitWithAbort as coreAwaitWithAbort } from '../../../src/core/http/abort';
import * as Wallets from '../../../src/wallets';
import { awaitWithAbort, isCancelledBeforeSubmit, withTimeout } from '../../../src/wallets/abort';

describe('awaitWithAbort starts no work once cancellation won', () => {
  it('wallets: an abort between the call and the microtask never runs the work, and is branded', async () => {
    const work = jest.fn(() => 'done');
    const controller = new AbortController();
    const result = awaitWithAbort(work, controller.signal);
    controller.abort();
    const error = await result.catch((e: unknown) => e);
    expect(error).toMatchObject({ name: 'AbortError' });
    expect(isCancelledBeforeSubmit(error)).toBe(true);
    expect(work).not.toHaveBeenCalled();
  });

  it('core: an abort between the call and the microtask never runs the work, and is not branded', async () => {
    const work = jest.fn(async () => Promise.resolve('sent'));
    const controller = new AbortController();
    const result = coreAwaitWithAbort(work, controller.signal);
    controller.abort();
    const error = await result.catch((e: unknown) => e);
    expect(error).toMatchObject({ name: 'AbortError' });
    expect(isCancelledBeforeSubmit(error)).toBe(false);
    expect(work).not.toHaveBeenCalled();
  });

  it('still runs the work when the signal has not aborted', async () => {
    const controller = new AbortController();
    await expect(awaitWithAbort(() => 1, controller.signal)).resolves.toBe(1);
    await expect(coreAwaitWithAbort(async () => Promise.resolve(2), controller.signal)).resolves.toBe(2);
  });
});

describe('withTimeout', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('settles as the work does, before the deadline', async () => {
    await expect(withTimeout(async () => 'done', 1000)).resolves.toBe('done');
    await expect(withTimeout(async () => Promise.reject(new Error('nope')), 1000)).rejects.toThrow('nope');
    await expect(
      withTimeout(() => {
        throw new Error('sync');
      }, 1000)
    ).rejects.toThrow('sync');
  });

  it('rejects with a TimeoutError at the deadline and aborts the work', async () => {
    jest.useFakeTimers();
    let workSignal: AbortSignal | undefined;
    const pending = withTimeout(async (signal) => {
      workSignal = signal;
      return new Promise<string>(() => undefined);
    }, 500);
    const settled = pending.catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(500);
    expect(await settled).toMatchObject({ name: 'TimeoutError' });
    expect(workSignal?.aborted).toBe(true);
  });

  it("rejects with an AbortError when the caller's signal aborts, and refuses an aborted signal at once", async () => {
    const controller = new AbortController();
    let started = false;
    const pending = withTimeout(
      async (signal) => {
        started = true;
        return new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new Error('work saw the abort'));
          });
        });
      },
      10_000,
      { signal: controller.signal }
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(started).toBe(true);
    const work = jest.fn(async () => 'never');
    await expect(withTimeout(work, 10, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(work).not.toHaveBeenCalled();
  });

  it('refuses a deadline that is not a non-negative finite number', async () => {
    await expect(withTimeout(async () => 1, -1)).rejects.toThrow(RangeError);
    await expect(withTimeout(async () => 1, Number.POSITIVE_INFINITY)).rejects.toThrow(RangeError);
  });

  it('is exported from the wallets entry point', () => {
    expect(Wallets.withTimeout).toBe(withTimeout);
  });
});
