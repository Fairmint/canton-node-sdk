/** `createWriteLatch`: one write at a time, epochs, and how an abandoned run reports (ported from apiv2's write lock). */
import { createWriteLatch, type WriteLatch, type WriteRunContext, type WriteRunOutcome } from '../../../src/wallets';
import { deferred, flush } from './session-helpers';

/** Start a run that waits on the test, returning its context and settle functions. */
function hold(
  latch: WriteLatch,
  label: string
): {
  outcome: Promise<WriteRunOutcome<string>>;
  context: WriteRunContext;
  resolve: (value: string) => void;
  reject: (error: unknown) => void;
} {
  const reply = deferred<string>();
  const started: WriteRunContext[] = [];
  const outcome = latch.run(label, async (ctx) => {
    started.push(ctx);
    return reply.promise;
  });
  const [context] = started;
  if (context === undefined) throw new Error('the run did not start synchronously');
  return { outcome, context, resolve: reply.resolve, reject: reply.reject };
}

describe('createWriteLatch', () => {
  it('is free at first and gives one holder at a time, refusing a second run synchronously', async () => {
    const latch = createWriteLatch();
    expect(latch.getSnapshot()).toEqual({ holder: null, epoch: 0 });
    const first = hold(latch, 'token wallet');
    expect(latch.getSnapshot().holder).toMatchObject({ label: 'token wallet' });
    let ran = false;
    const second = latch.run('Canton Coin send', async () => {
      ran = true;
      return 1;
    });
    expect(ran).toBe(false);
    expect(await second).toEqual({ status: 'refused', reason: 'busy', holder: latch.getSnapshot().holder });
    first.resolve('ok');
    expect(await first.outcome).toEqual({ status: 'done', value: 'ok' });
    expect(latch.getSnapshot().holder).toBeNull();
  });

  it('is free again after the holder settles, also when it threw, and gives each run its own id', async () => {
    const latch = createWriteLatch();
    const a = hold(latch, 'a');
    const idA = latch.getSnapshot().holder?.id;
    const boom = new Error('boom');
    a.reject(boom);
    expect(await a.outcome).toEqual({ status: 'failed', error: boom });
    const b = hold(latch, 'b');
    expect(latch.getSnapshot().holder?.id).not.toBe(idA);
    b.resolve('done');
    await b.outcome;
  });

  it('keeps the latch held across a bump (only the holder frees it), aborting the run and marking it not current', async () => {
    const latch = createWriteLatch();
    const a = hold(latch, 'a');
    expect(a.context.isCurrent()).toBe(true);
    expect(a.context.signal.aborted).toBe(false);
    latch.bump();
    expect(latch.getSnapshot()).toMatchObject({ holder: { label: 'a' }, epoch: 1 });
    expect(a.context.isCurrent()).toBe(false);
    expect(a.context.signal.aborted).toBe(true);
    expect((await latch.run('b', async () => 1)).status).toBe('refused');
    a.resolve('late');
    await a.outcome;
    expect(latch.getSnapshot().holder).toBeNull();
    // A run started after the bump is current.
    const b = hold(latch, 'b');
    expect(b.context.isCurrent()).toBe(true);
    b.resolve('ok');
    expect(await b.outcome).toEqual({ status: 'done', value: 'ok' });
  });

  it('drops a run abandoned before it submitted', async () => {
    const latch = createWriteLatch();
    const a = hold(latch, 'a');
    latch.bump();
    a.resolve('late');
    expect(await a.outcome).toEqual({ status: 'dropped' });
  });

  it('flags an unknown outcome once the submit had started, with what it threw', async () => {
    const latch = createWriteLatch();
    const a = hold(latch, 'a');
    a.context.markSubmitted();
    latch.bump();
    a.resolve('late');
    expect(await a.outcome).toEqual({ status: 'unknown-outcome' });
    const b = hold(latch, 'b');
    b.context.markSubmitted();
    latch.bump();
    const error = new Error('timed out');
    b.reject(error);
    expect(await b.outcome).toEqual({ status: 'unknown-outcome', error });
  });

  it('reports normally while current, even after markSubmitted', async () => {
    const latch = createWriteLatch();
    const a = hold(latch, 'a');
    a.context.markSubmitted();
    a.resolve('ok');
    expect(await a.outcome).toEqual({ status: 'done', value: 'ok' });
  });

  it('publishes each change, with a snapshot that stays the same object until then', async () => {
    const latch = createWriteLatch();
    const seen: unknown[] = [];
    latch.subscribe(() => seen.push(latch.getSnapshot()));
    const first = latch.getSnapshot();
    expect(latch.getSnapshot()).toBe(first);
    const a = hold(latch, 'a');
    latch.bump();
    a.resolve('x');
    await a.outcome;
    expect(seen).toEqual([
      { holder: { id: 1, label: 'a' }, epoch: 0 },
      { holder: { id: 1, label: 'a' }, epoch: 1 },
      { holder: null, epoch: 1 },
    ]);
    expect(Object.isFrozen(latch.getSnapshot())).toBe(true);
  });

  it('refuses runs once disposed, abandons the one in flight and publishes nothing more', async () => {
    const latch = createWriteLatch();
    const a = hold(latch, 'a');
    let published = 0;
    latch.subscribe(() => {
      published += 1;
    });
    latch.dispose();
    expect(a.context.signal.aborted).toBe(true);
    a.resolve('late');
    expect(await a.outcome).toEqual({ status: 'dropped' });
    expect(await latch.run('b', async () => 1)).toEqual({ status: 'refused', reason: 'disposed' });
    latch.bump();
    await flush();
    expect(published).toBe(0);
  });

  it('never rejects: a body that throws synchronously fails the run', async () => {
    const latch = createWriteLatch();
    const outcome = await latch.run('a', () => {
      throw new Error('sync');
    });
    expect(outcome).toMatchObject({ status: 'failed', error: { message: 'sync' } });
    expect(latch.getSnapshot().holder).toBeNull();
  });
});
