import { awaitWithAbort as coreAwaitWithAbort } from '../../../src/core/http/abort';
import { awaitWithAbort, isCancelledBeforeSubmit } from '../../../src/wallets/abort';

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
