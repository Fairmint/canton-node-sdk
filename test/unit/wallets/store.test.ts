/**
 * `createWalletStore`: one token wallet per connected wallet, its snapshot, one wallet call at a time, a reload after
 * every write attempt, and outcomes tagged with the session they ran for.
 */
import {
  createCip103Session,
  createWalletStore,
  WalletError,
  WalletReadError,
  WalletSubmitError,
  type ConnectedWallet,
  type Cip103Session,
  type Wallet,
  type WalletState,
  type WalletStore,
} from '../../../src/wallets';
import { DEVNET, fakeProvider, HOLDER, OTHER } from './helpers';
import { connectedWallet, deferred, flush, TestProvider } from './session-helpers';

/** A load the test answers: the party it was asked for, and its settle functions. */
interface PendingLoad {
  readonly partyId: string;
  readonly resolve: (state: WalletState) => void;
  readonly reject: (error: unknown) => void;
}

/** A snapshot that names its party and the load it answered. */
const snapshot = (partyId: string, offset: number): WalletState => ({
  partyId,
  offset,
  holdings: [],
  balances: [],
  transferOffers: { incoming: [], outgoing: [] },
  mintOffers: [],
  burnRequests: [],
});

/**
 * A session over a scriptable provider, and a store whose token wallets hold every `loadState` until the test answers
 * it (`answer`, `fail`). Only `loadState` exists on the fake token wallets: actions get them through the context.
 */
function setup(): {
  session: Cip103Session;
  provider: TestProvider;
  store: WalletStore;
  opened: ConnectedWallet[];
  loads: PendingLoad[];
  answer: (offset?: number) => void;
  fail: (error: unknown) => void;
  published: () => number;
  /** How many `loadState` calls are in flight (asked and not yet settled). */
  active: () => number;
} {
  const session = createCip103Session();
  const provider = new TestProvider();
  const opened: ConnectedWallet[] = [];
  const loads: PendingLoad[] = [];
  let active = 0;
  const store = createWalletStore({
    session,
    open: (wallet) => {
      opened.push(wallet);
      const tokens: Pick<Wallet, 'loadState'> = {
        loadState: async () => {
          const reply = deferred<WalletState>();
          loads.push({ partyId: wallet.partyId, resolve: reply.resolve, reject: reply.reject });
          active += 1;
          try {
            return await reply.promise;
          } finally {
            active -= 1;
          }
        },
      };
      return tokens as Wallet;
    },
  });
  let published = 0;
  store.subscribe(() => {
    published += 1;
  });
  const next = (): PendingLoad => {
    const load = loads.shift();
    if (load === undefined) throw new Error('no load is pending');
    return load;
  };
  return {
    session,
    provider,
    store,
    opened,
    loads,
    answer: (offset = 1) => {
      const load = next();
      load.resolve(snapshot(load.partyId, offset));
    },
    fail: (error) => next().reject(error),
    published: () => published,
    active: () => active,
  };
}

/** Connect `party` and answer its first load. */
async function connectAndLoad(t: ReturnType<typeof setup>, party: string = HOLDER): Promise<ConnectedWallet> {
  t.provider.setParty(party);
  await t.session.connect(t.provider, { network: 'devnet' });
  t.answer();
  await flush();
  return connectedWallet(t.session);
}

describe('createWalletStore', () => {
  it('opens a token wallet for the connected wallet and loads its snapshot', async () => {
    const t = setup();
    expect(t.store.getSnapshot()).toMatchObject({
      session: { status: 'disconnected' },
      wallet: null,
      state: null,
      loading: false,
      busy: false,
      running: null,
      outcome: null,
      unknownOutcomeParty: null,
    });
    await t.session.connected(t.provider, { network: 'devnet' });
    const wallet = connectedWallet(t.session);
    expect(t.opened).toEqual([wallet]);
    expect(t.store.getSnapshot()).toMatchObject({ wallet, state: null, loading: true });
    t.answer(7);
    await flush();
    expect(t.store.getSnapshot()).toMatchObject({ wallet, state: { partyId: HOLDER, offset: 7 }, loading: false });
    // Stable between changes.
    expect(t.store.getSnapshot()).toBe(t.store.getSnapshot());
  });

  it('refuses a second run in the same tick without calling its action', async () => {
    const t = setup();
    await connectAndLoad(t);
    const write = deferred<string>();
    let calls = 0;
    const first = t.store.run('send', async () => {
      calls += 1;
      return write.promise;
    });
    const second = t.store.run('redeem', async () => {
      calls += 1;
      return 'never';
    });
    expect(await second).toBe(false);
    expect(calls).toBe(1);
    expect(t.store.getSnapshot()).toMatchObject({ running: 'send', busy: true });
    write.resolve('Sent.');
    await flush();
    t.answer();
    expect(await first).toBe(true);
  });

  it.each([
    ['ends the session', (t: ReturnType<typeof setup>) => t.session.end('wallet')],
    ['fails the session', (t: ReturnType<typeof setup>) => t.session.fail(new Error('wallet setup failed'))],
    ['disposes the store', (t: ReturnType<typeof setup>) => t.store.dispose()],
  ])('does not start an action when a listener of its running state %s', async (_case, cancel) => {
    const t = setup();
    await connectAndLoad(t);
    let cancelled = false;
    t.store.subscribe(() => {
      if (!cancelled && t.store.getSnapshot().running === 'send') {
        cancelled = true;
        cancel(t);
      }
    });
    let calls = 0;
    const action = async (): Promise<string> => {
      calls += 1;
      return 'Sent.';
    };
    expect(await t.store.run('send', action)).toBe(false);
    expect(calls).toBe(0);
    expect(t.loads).toHaveLength(0);
    if (_case === 'disposes the store') return; // a disposed store publishes nothing more
    expect(t.store.getSnapshot()).toMatchObject({
      running: null,
      busy: false,
      outcome: null,
      unknownOutcomeParty: null,
    });
    // The latch is free: after connecting again, an action runs.
    await connectAndLoad(t);
    const write = t.store.run('send', action);
    await flush();
    t.answer();
    expect(await write).toBe(true);
    expect(calls).toBe(1);
  });

  it('keeps its latch and other listeners working when a listener throws, and reports the error asynchronously', async () => {
    const t = setup();
    await connectAndLoad(t);
    const rethrown: unknown[] = [];
    const timer = jest.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => {
      try {
        callback();
      } catch (error) {
        rethrown.push(error);
      }
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
    try {
      const boom = new Error('listener bug');
      t.store.subscribe(() => {
        if (t.store.getSnapshot().running === 'send') throw boom;
      });
      let seen = 0;
      t.store.subscribe(() => {
        seen += 1;
      });
      const write = t.store.run('send', async () => 'Sent.');
      await flush();
      t.answer();
      expect(await write).toBe(true);
      expect(rethrown).toContain(boom);
      expect(seen).toBeGreaterThan(0);
      // The reload after the write (answered above) settles and frees the latch.
      await flush();
      expect(t.active()).toBe(0);
      expect(t.store.getSnapshot()).toMatchObject({ busy: false, running: null, outcome: { status: 'succeeded' } });
    } finally {
      timer.mockRestore();
    }
  });

  it('is busy and refuses to run while any load is pending: the first one and a Retry', async () => {
    const t = setup();
    await t.session.connected(t.provider, { network: 'devnet' });
    expect(t.store.getSnapshot()).toMatchObject({ loading: true, busy: true, running: null });
    let calls = 0;
    const action = async (): Promise<string> => {
      calls += 1;
      return 'x';
    };
    expect(await t.store.run('receive', action)).toBe(false);
    t.answer();
    await flush();
    expect(t.store.getSnapshot()).toMatchObject({ loading: false, busy: false });
    t.store.refresh();
    expect(t.store.getSnapshot()).toMatchObject({ loading: true, busy: true });
    expect(await t.store.run('ownership', action, { readOnly: true })).toBe(false);
    expect(calls).toBe(0);
    t.answer();
    await flush();
    expect(await t.store.run('ownership', action, { readOnly: true })).toBe(true);
    expect(calls).toBe(1);
  });

  it('refuses to run while disconnected', async () => {
    const t = setup();
    let called = false;
    expect(
      await t.store.run('send', async () => {
        called = true;
      })
    ).toBe(false);
    expect(called).toBe(false);
  });

  it('passes the token wallet and the connected wallet to the action, and records its message', async () => {
    const t = setup();
    const wallet = await connectAndLoad(t);
    let seen: ConnectedWallet | null = null;
    const ran = t.store.run('accept', async ({ wallet: ranFor, tokens }) => {
      seen = ranFor;
      expect(typeof tokens.loadState).toBe('function');
      return 'Mint offer accepted.';
    });
    await flush();
    t.answer();
    expect(await ran).toBe(true);
    expect(seen).toBe(wallet);
    await flush(); // the reload's reply
    expect(t.store.getSnapshot().outcome).toEqual({
      id: 'accept',
      partyId: HOLDER,
      status: 'succeeded',
      message: 'Mint offer accepted.',
    });
    // An action that resolves with nothing has no message.
    const silent = t.store.run('preview', async () => undefined, { readOnly: true });
    expect(await silent).toBe(true);
    expect(t.store.getSnapshot().outcome).toEqual({
      id: 'preview',
      partyId: HOLDER,
      status: 'succeeded',
      message: null,
    });
  });

  it('reloads after a failed write, and stays busy until that reload answers', async () => {
    const t = setup();
    await connectAndLoad(t);
    const ran = t.store.run('send', async () => {
      throw new WalletSubmitError('unknown', 'The wallet did not confirm the transaction.', { code: -32002 });
    });
    expect(await ran).toBe(false);
    // The failed write may have committed: the snapshot reloads.
    expect(t.loads).toHaveLength(1);
    const reloading = t.store.getSnapshot();
    expect(reloading).toMatchObject({ running: null, busy: true, loading: true });
    expect(reloading.outcome).toMatchObject({
      id: 'send',
      partyId: HOLDER,
      status: 'failed',
      error: { kind: 'outcome-unknown', code: -32002 },
    });
    // Busy: nothing runs against the pre-write snapshot.
    expect(await t.store.run('send', async () => 'again')).toBe(false);

    t.answer(2);
    await flush();
    expect(t.store.getSnapshot()).toMatchObject({ busy: false, loading: false, state: { offset: 2 } });
    expect(await t.store.run('send', async () => 'again', { readOnly: true })).toBe(true);
  });

  it('stays busy after a write until a reload answers, and a failed reload clears the state', async () => {
    const t = setup();
    await connectAndLoad(t);
    const ran = t.store.run('redeem', async () => 'Burn requested.');
    expect(await ran).toBe(true);
    expect(t.store.getSnapshot()).toMatchObject({ busy: true, running: null });
    t.fail(new WalletReadError('Limit exceeded', -32005));
    await flush();
    const view = t.store.getSnapshot();
    expect(view).toMatchObject({ busy: false, loading: false, state: null });
    expect(view.loadError).toMatchObject({ kind: 'rate-limited', code: -32005 });
    // The outcome stays.
    expect(view.outcome).toMatchObject({ id: 'redeem', status: 'succeeded' });
  });

  it('does not reload after an action run with refresh: false', async () => {
    const t = setup();
    await connectAndLoad(t);
    expect(await t.store.run('ownership', async () => 'Verified.', { readOnly: true })).toBe(true);
    expect(t.loads).toHaveLength(0);
    expect(t.store.getSnapshot()).toMatchObject({ busy: false, loading: false });
  });

  it('clears the state when a load fails, and refresh() loads again', async () => {
    const t = setup();
    await connectAndLoad(t);
    t.store.refresh();
    expect(t.store.getSnapshot()).toMatchObject({ loading: true, state: { offset: 1 } });
    t.fail(new WalletReadError('not connected', 4100));
    await flush();
    expect(t.store.getSnapshot()).toMatchObject({
      state: null,
      loading: false,
      loadError: { kind: 'read-failed', message: 'The wallet did not answer a read: not connected', code: 4100 },
    });
    t.store.refresh();
    t.answer(3);
    await flush();
    expect(t.store.getSnapshot()).toMatchObject({ state: { offset: 3 }, loadError: null });
  });

  it('folds a refresh() during a write into the reload after it, and ignores it while disconnected', async () => {
    const t = setup();
    t.store.refresh();
    expect(t.loads).toHaveLength(0);
    await connectAndLoad(t);
    const write = deferred<string>();
    const ran = t.store.run('send', async () => write.promise);
    t.store.refresh();
    expect(t.loads).toHaveLength(0);
    write.resolve('Sent.');
    expect(await ran).toBe(true);
    expect(t.loads).toHaveLength(1);
  });

  it('drops the previous wallet’s load when the wallet changes', async () => {
    const t = setup();
    await t.session.connected(t.provider, { network: 'devnet' });
    const [aliceLoad] = t.loads.splice(0);
    t.provider.setParty(OTHER);
    await t.session.connected(t.provider, { network: 'devnet' });
    aliceLoad?.resolve(snapshot(HOLDER, 99));
    await flush();
    expect(t.store.getSnapshot()).toMatchObject({ wallet: { partyId: OTHER }, state: null, loading: true });
    t.answer(5);
    await flush();
    expect(t.store.getSnapshot().state).toMatchObject({ partyId: OTHER, offset: 5 });
  });

  it('records interrupted, never succeeded, for an action that settles after its session ended', async () => {
    const t = setup();
    await connectAndLoad(t);
    const write = deferred<string>();
    const ran = t.store.run('send', async () => write.promise);
    t.session.end('user');
    // Still running for the ended session: its outcome is unknown, and the page stays busy (no new wallet call).
    expect(t.store.getSnapshot()).toMatchObject({
      wallet: null,
      running: 'send',
      busy: true,
      unknownOutcomeParty: HOLDER,
    });
    write.resolve('Sent.');
    expect(await ran).toBe(false);
    expect(t.store.getSnapshot()).toMatchObject({
      running: null,
      busy: false,
      outcome: { id: 'send', partyId: HOLDER, status: 'interrupted' },
      unknownOutcomeParty: HOLDER,
    });
    // No reload for an ended session.
    expect(t.loads).toHaveLength(0);

    // A failure that settles late is interrupted too.
    await t.session.connect(t.provider, { network: 'devnet' });
    t.answer();
    await flush();
    const failing = deferred<string>();
    const failed = t.store.run('redeem', async () => failing.promise);
    t.session.end('wallet');
    failing.reject(new WalletSubmitError('failed', 'ledger said no'));
    expect(await failed).toBe(false);
    expect(t.store.getSnapshot().outcome).toEqual({ id: 'redeem', partyId: HOLDER, status: 'interrupted' });
  });

  it('interrupts a running action when the wallet switches account', async () => {
    const t = setup();
    const alice = await connectAndLoad(t);
    const write = deferred<string>();
    const ran = t.store.run('send', async () => write.promise);
    t.provider.setParty(OTHER);
    t.provider.emit('accountsChanged', [{ partyId: OTHER, primary: true }]);
    await flush();
    const bob = connectedWallet(t.session);
    expect(bob).not.toBe(alice);
    expect(t.store.getSnapshot()).toMatchObject({
      wallet: bob,
      running: 'send',
      busy: true,
      unknownOutcomeParty: HOLDER,
    });
    // Bob's wallet cannot start a call while Alice's is pending.
    expect(await t.store.run('send', async () => 'x')).toBe(false);
    write.resolve('Sent.');
    expect(await ran).toBe(false);
    expect(t.store.getSnapshot()).toMatchObject({
      wallet: bob,
      running: null,
      busy: true, // Bob's first load is still pending
      outcome: { id: 'send', partyId: HOLDER, status: 'interrupted' },
      unknownOutcomeParty: HOLDER,
    });
    // Only Bob's own load is pending; Alice's action did not reload.
    expect(t.loads.map((load) => load.partyId)).toEqual([OTHER]);
  });

  it('clears succeeded and failed outcomes on a wallet change, and keeps interrupted ones', async () => {
    const t = setup();
    await connectAndLoad(t);
    expect(await t.store.run('send', async () => 'Sent.', { readOnly: true })).toBe(true);
    expect(t.store.getSnapshot().outcome?.status).toBe('succeeded');
    // Another wallet never sees Alice's success.
    await connectAndLoad(t, OTHER);
    expect(t.store.getSnapshot()).toMatchObject({
      wallet: { partyId: OTHER },
      outcome: null,
      unknownOutcomeParty: null,
    });

    expect(
      await t.store.run(
        'send',
        async () => {
          throw new WalletError('insufficient-balance', 'not enough');
        },
        { readOnly: true }
      )
    ).toBe(false);
    expect(t.store.getSnapshot().outcome).toMatchObject({ status: 'failed', error: { kind: 'refused' } });
    t.session.end('user');
    expect(t.store.getSnapshot()).toMatchObject({ wallet: null, outcome: null });

    await connectAndLoad(t);
    const write = deferred<string>();
    const ran = t.store.run('send', async () => write.promise);
    t.session.end('wallet');
    write.resolve('Sent.');
    await ran;
    await connectAndLoad(t, OTHER);
    expect(t.store.getSnapshot()).toMatchObject({
      wallet: { partyId: OTHER },
      outcome: { status: 'interrupted', partyId: HOLDER },
      unknownOutcomeParty: HOLDER,
    });
    // The next action clears it.
    expect(await t.store.run('preview', async () => 'direct', { readOnly: true })).toBe(true);
    expect(t.store.getSnapshot()).toMatchObject({
      outcome: { status: 'succeeded', partyId: OTHER },
      unknownOutcomeParty: null,
    });
  });

  it('keeps an outcome-unknown failure when the session ends right after it, naming its party', async () => {
    const t = setup();
    await connectAndLoad(t);
    const ran = t.store.run('send', async () => {
      throw new WalletSubmitError('unknown', 'Session changed during request', { code: 4100 });
    });
    expect(await ran).toBe(false);
    // The wallet ends the session while the reload is pending.
    t.session.end('wallet');
    const unknown = { id: 'send', partyId: HOLDER, status: 'failed', error: { kind: 'outcome-unknown' } };
    expect(t.store.getSnapshot()).toMatchObject({ wallet: null, outcome: unknown, unknownOutcomeParty: HOLDER });
    // Another party still sees it as unknown.
    await connectAndLoad(t, OTHER);
    expect(t.store.getSnapshot()).toMatchObject({ outcome: unknown, unknownOutcomeParty: HOLDER });
    // The same party sees it as its own failure, which says not to resubmit blindly.
    await connectAndLoad(t);
    expect(t.store.getSnapshot()).toMatchObject({ outcome: unknown, unknownOutcomeParty: null });
  });

  it('keeps a previous outcome-unknown warning when a listener ends the session before the next run starts', async () => {
    const t = setup();
    await connectAndLoad(t);
    const failed = t.store.run('send', async () => {
      throw new WalletSubmitError('unknown', 'Session changed during request', { code: 4100 });
    });
    expect(await failed).toBe(false);
    t.answer();
    await flush();
    const unknown = { id: 'send', partyId: HOLDER, status: 'failed', error: { kind: 'outcome-unknown' } };
    expect(t.store.getSnapshot()).toMatchObject({ busy: false, outcome: unknown });
    // A store listener ends the session as soon as the next action shows as running.
    let ended = false;
    t.store.subscribe(() => {
      if (!ended && t.store.getSnapshot().running === 'other') {
        ended = true;
        t.session.end('wallet');
      }
    });
    let called = false;
    expect(
      await t.store.run('other', async () => {
        called = true;
      })
    ).toBe(false);
    expect(called).toBe(false);
    // Nothing was sent: the unknown outcome of HOLDER's write is still reported, as across any session end.
    expect(t.store.getSnapshot()).toMatchObject({
      wallet: null,
      running: null,
      busy: false,
      outcome: unknown,
      unknownOutcomeParty: HOLDER,
    });
  });

  it('records no unknown outcome for a read-only call whose session ended before it settled', async () => {
    const t = setup();
    await connectAndLoad(t);
    const signing = deferred<string>();
    const ran = t.store.run('ownership', async () => signing.promise, { readOnly: true });
    t.provider.setParty(OTHER);
    t.provider.emit('accountsChanged', [{ partyId: OTHER, primary: true }]);
    await flush();
    // Still running, so still busy, but nothing it does can commit.
    expect(t.store.getSnapshot()).toMatchObject({ running: 'ownership', busy: true, unknownOutcomeParty: null });
    signing.resolve('Verified.');
    expect(await ran).toBe(false);
    expect(t.store.getSnapshot()).toMatchObject({ running: null, outcome: null, unknownOutcomeParty: null });
    // No reload for it: only Bob's own first load.
    expect(t.loads.map((load) => load.partyId)).toEqual([OTHER]);
  });

  it('stops publishing after dispose and drops pending replies', async () => {
    const t = setup();
    await t.session.connected(t.provider, { network: 'devnet' });
    const before = t.published();
    const view = t.store.getSnapshot();
    t.store.dispose();
    t.answer();
    await flush();
    t.session.end('user');
    expect(t.published()).toBe(before);
    expect(t.store.getSnapshot()).toBe(view);
    expect(await t.store.run('send', async () => 'x')).toBe(false);
  });

  describe('one wallet call at a time', () => {
    it('runs a refresh asked during a load once after it, and stays busy until both answer', async () => {
      const t = setup();
      await connectAndLoad(t);
      t.store.refresh();
      t.store.refresh(); // coalesced with the first queued refresh
      t.store.refresh();
      // Only the first load is asked; the rest wait for it.
      expect(t.loads).toHaveLength(1);
      expect(t.active()).toBe(1);
      let calls = 0;
      const action = async (): Promise<string> => {
        calls += 1;
        return 'x';
      };
      expect(await t.store.run('ownership', action, { readOnly: true })).toBe(false);
      t.answer(10);
      await flush();
      // The first reply is shown, and the queued refresh is now the one call in flight.
      expect(t.loads).toHaveLength(1);
      expect(t.active()).toBe(1);
      expect(t.store.getSnapshot()).toMatchObject({ state: { offset: 10 }, loading: true, busy: true });
      expect(await t.store.run('ownership', action, { readOnly: true })).toBe(false);
      t.answer(20);
      await flush();
      expect(t.loads).toHaveLength(0);
      expect(t.store.getSnapshot()).toMatchObject({ state: { offset: 20 }, loading: false, busy: false });
      expect(await t.store.run('ownership', action, { readOnly: true })).toBe(true);
      expect(calls).toBe(1);
    });

    it('queues the new wallet’s first load behind the previous wallet’s action, and starts it when it is interrupted', async () => {
      const t = setup();
      await connectAndLoad(t);
      const write = deferred<string>();
      let actionActive = true;
      const ran = t.store.run('send', async () => {
        try {
          return await write.promise;
        } finally {
          actionActive = false;
        }
      });
      t.provider.setParty(OTHER);
      t.provider.emit('accountsChanged', [{ partyId: OTHER, primary: true }]);
      await flush();
      const bob = connectedWallet(t.session);
      // Bob's load waits: Alice's write is still the one call in flight.
      expect(t.loads).toHaveLength(0);
      expect(t.store.getSnapshot()).toMatchObject({
        wallet: bob,
        state: null,
        loading: true,
        running: 'send',
        busy: true,
      });
      write.resolve('Sent.');
      expect(await ran).toBe(false);
      expect(actionActive).toBe(false);
      // The interrupted branch starts it.
      expect(t.loads.map((load) => load.partyId)).toEqual([OTHER]);
      expect(t.store.getSnapshot()).toMatchObject({
        running: null,
        loading: true,
        busy: true,
        outcome: { status: 'interrupted', partyId: HOLDER },
      });
      t.answer(4);
      await flush();
      expect(t.store.getSnapshot()).toMatchObject({
        wallet: bob,
        state: { partyId: OTHER, offset: 4 },
        loading: false,
        busy: false,
      });
    });

    it('queues the new wallet’s first load behind the previous wallet’s load, and drops that load’s reply', async () => {
      const t = setup();
      await t.session.connected(t.provider, { network: 'devnet' });
      expect(t.active()).toBe(1);
      t.provider.setParty(OTHER);
      t.provider.emit('accountsChanged', [{ partyId: OTHER, primary: true }]);
      await flush();
      // Alice's load is still asking the wallet: Bob's waits, and nothing runs meanwhile.
      expect(t.loads.map((load) => load.partyId)).toEqual([HOLDER]);
      expect(t.store.getSnapshot()).toMatchObject({ wallet: { partyId: OTHER }, loading: true, busy: true });
      expect(await t.store.run('ownership', async () => 'x', { readOnly: true })).toBe(false);
      // Alice's late failure is dropped, and frees the latch for Bob's load.
      t.fail(new Error('late'));
      await flush();
      expect(t.store.getSnapshot()).toMatchObject({ state: null, loadError: null, loading: true, busy: true });
      expect(t.loads.map((load) => load.partyId)).toEqual([OTHER]);
      expect(t.active()).toBe(1);
      t.answer(6);
      await flush();
      expect(t.store.getSnapshot()).toMatchObject({ state: { partyId: OTHER, offset: 6 }, busy: false });
    });

    it('never has two wallet calls in flight across switches, refreshes, actions and reloads', async () => {
      const t = setup();
      let actions = 0;
      let peak = 0;
      const probe = (): void => {
        peak = Math.max(peak, t.active() + actions);
      };
      const tracked = (reply: Promise<string>) => async (): Promise<string> => {
        actions += 1;
        probe();
        try {
          return await reply;
        } finally {
          actions -= 1;
        }
      };
      await t.session.connected(t.provider, { network: 'devnet' });
      probe();
      t.store.refresh();
      probe();
      t.provider.setParty(OTHER);
      t.provider.emit('accountsChanged', [{ partyId: OTHER, primary: true }]);
      await flush();
      probe();
      while (t.loads.length > 0) {
        t.answer();
        await flush();
        probe();
      }
      const write = deferred<string>();
      const ran = t.store.run('send', tracked(write.promise));
      t.store.refresh();
      t.provider.setParty(HOLDER);
      t.provider.emit('accountsChanged', [{ partyId: HOLDER, primary: true }]);
      await flush();
      probe();
      write.resolve('Sent.');
      await ran;
      probe();
      while (t.loads.length > 0) {
        t.answer();
        await flush();
        probe();
      }
      expect(peak).toBe(1);
      expect(t.store.getSnapshot()).toMatchObject({ wallet: { partyId: HOLDER }, busy: false, loading: false });
    });

    it('coalesces wallet changes during an action into one load, for the newest wallet', async () => {
      const t = setup();
      await connectAndLoad(t);
      const write = deferred<string>();
      const ran = t.store.run('send', async () => write.promise);
      t.provider.setParty(OTHER);
      t.provider.emit('accountsChanged', [{ partyId: OTHER, primary: true }]);
      await flush();
      t.provider.setParty(HOLDER);
      t.provider.emit('accountsChanged', [{ partyId: HOLDER, primary: true }]);
      await flush();
      t.store.refresh();
      expect(t.loads).toHaveLength(0);
      write.resolve('Sent.');
      expect(await ran).toBe(false);
      expect(t.opened.map((wallet) => wallet.partyId)).toEqual([HOLDER, OTHER, HOLDER]);
      expect(t.loads.map((load) => load.partyId)).toEqual([HOLDER]);
      t.answer(8);
      await flush();
      expect(t.loads).toHaveLength(0);
      expect(t.store.getSnapshot()).toMatchObject({
        wallet: t.opened[2],
        state: { partyId: HOLDER, offset: 8 },
        busy: false,
      });
    });

    it('starts a queued load when the call before it fails, and runs a refresh asked during a read-only call', async () => {
      const t = setup();
      await connectAndLoad(t);
      const failing = deferred<string>();
      const ran = t.store.run('send', async () => failing.promise);
      t.provider.setParty(OTHER);
      t.provider.emit('accountsChanged', [{ partyId: OTHER, primary: true }]);
      await flush();
      failing.reject(new WalletSubmitError('failed', 'ledger said no'));
      expect(await ran).toBe(false);
      expect(t.loads.map((load) => load.partyId)).toEqual([OTHER]);
      t.answer();
      await flush();
      expect(t.store.getSnapshot()).toMatchObject({ busy: false });

      const signing = deferred<string>();
      const signed = t.store.run('ownership', async () => signing.promise, { readOnly: true });
      t.store.refresh();
      expect(t.loads).toHaveLength(0);
      expect(t.store.getSnapshot()).toMatchObject({ running: 'ownership', loading: true, busy: true });
      signing.reject(new Error('declined'));
      expect(await signed).toBe(false);
      expect(t.loads.map((load) => load.partyId)).toEqual([OTHER]);
      t.answer(9);
      await flush();
      expect(t.store.getSnapshot()).toMatchObject({ state: { offset: 9 }, busy: false, loading: false });
    });

    it('drops a queued load when the session ends, and starts nothing after dispose', async () => {
      const t = setup();
      await connectAndLoad(t);
      const write = deferred<string>();
      const ran = t.store.run('send', async () => write.promise);
      t.provider.setParty(OTHER);
      t.provider.emit('accountsChanged', [{ partyId: OTHER, primary: true }]);
      await flush();
      t.session.end('user');
      expect(t.store.getSnapshot()).toMatchObject({ wallet: null, loading: false, busy: true });
      write.resolve('Sent.');
      expect(await ran).toBe(false);
      expect(t.loads).toHaveLength(0);
      expect(t.store.getSnapshot()).toMatchObject({ wallet: null, loading: false, busy: false });

      await connectAndLoad(t, OTHER);
      const again = deferred<string>();
      const second = t.store.run('send', async () => again.promise);
      t.store.refresh();
      t.store.dispose();
      const before = t.published();
      again.resolve('Sent.');
      expect(await second).toBe(false);
      await flush();
      expect(t.loads).toHaveLength(0);
      expect(t.published()).toBe(before);
    });
  });

  it('drops a queued load when the session is disposed before the store, and settles busy and loading', async () => {
    const t = setup();
    await connectAndLoad(t);
    const write = deferred<string>();
    const ran = t.store.run('x', async () => write.promise);
    t.store.refresh();
    expect(t.store.getSnapshot()).toMatchObject({ running: 'x', busy: true, loading: true });
    // The session is disposed and publishes nothing; the store is not disposed.
    t.session.dispose();
    write.resolve('Sent.');
    expect(await ran).toBe(false);
    await flush();
    expect(t.loads).toHaveLength(0);
    expect(t.store.getSnapshot()).toMatchObject({
      running: null,
      busy: false,
      loading: false,
      outcome: { id: 'x', partyId: HOLDER, status: 'interrupted' },
    });
  });

  it('drops a load that answers after the session was disposed, and settles loading', async () => {
    const t = setup();
    await connectAndLoad(t);
    const before = t.store.getSnapshot().state;
    t.store.refresh();
    expect(t.store.getSnapshot()).toMatchObject({ loading: true, busy: true });
    t.session.dispose();
    t.answer(99);
    await flush();
    expect(t.store.getSnapshot().state).toBe(before);
    expect(t.store.getSnapshot()).toMatchObject({ loading: false, busy: false, loadError: null });
    // A failure that answers late is dropped too.
    const u = setup();
    await connectAndLoad(u);
    u.store.refresh();
    u.session.dispose();
    u.fail(new Error('late failure'));
    await flush();
    expect(u.store.getSnapshot()).toMatchObject({ loading: false, busy: false, loadError: null });
    expect(u.store.getSnapshot().state).not.toBeNull();
  });

  it('ignores a refresh() that a session listener ahead of the store asks for a wallet the session left', async () => {
    const session = createCip103Session();
    const provider = new TestProvider();
    // Subscribed before the store: it runs before the store follows the session.
    let store: WalletStore | null = null;
    session.subscribe(() => {
      store?.refresh();
    });
    const loads: string[] = [];
    store = createWalletStore({
      session,
      open: (wallet) => {
        const tokens: Pick<Wallet, 'loadState'> = {
          loadState: async () => {
            loads.push(wallet.key);
            return snapshot(wallet.partyId, 1);
          },
        };
        return tokens as Wallet;
      },
    });
    await session.connect(provider, { network: 'devnet' });
    await flush();
    const first = connectedWallet(session);
    expect(loads).toEqual([first.key]);
    // The session ends: no load goes to the wallet it left.
    session.end('user');
    await flush();
    expect(loads).toEqual([first.key]);
    expect(store.getSnapshot()).toMatchObject({ wallet: null, loading: false, busy: false });
    // An account switch loads the new wallet only.
    await session.connect(provider, { network: 'devnet' });
    await flush();
    const second = connectedWallet(session);
    provider.setParty(OTHER);
    provider.emit('accountsChanged', [{ partyId: OTHER, primary: true }]);
    await flush();
    const third = connectedWallet(session);
    expect(third.partyId).toBe(OTHER);
    expect(loads).toEqual([first.key, second.key, third.key]);
    expect(store.getSnapshot()).toMatchObject({ wallet: third, state: { partyId: OTHER }, busy: false });
  });

  describe('default token wallet', () => {
    it('refuses a connected wallet without a network as a load error', async () => {
      const session = createCip103Session();
      const store = createWalletStore({ session });
      await session.connected(new TestProvider());
      expect(store.getSnapshot()).toMatchObject({
        state: null,
        loading: false,
        loadError: {
          kind: 'refused',
          code: 'invalid-input',
          message: 'The connected wallet names no network: connect with { network }, or pass open to createWalletStore',
        },
      });
      expect(await store.run('send', async () => 'x')).toBe(false);
    });

    it("acts as the connected party through createWallet with DA's registry for its network", async () => {
      // DA's registry is down: the load reaches it on DevNet and fails as a registry error.
      const fetched: string[] = [];
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        fetched.push(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url);
        return new Response('down', { status: 503 });
      });
      const session = createCip103Session();
      const store = createWalletStore({ session });
      const provider = fakeProvider({}, { party: HOLDER });
      try {
        await session.connected(provider, { network: 'devnet' });
        await flush();
        expect(store.getSnapshot().loadError).toMatchObject({ kind: 'registry', code: 503 });
      } finally {
        fetchSpy.mockRestore();
      }
      expect(fetched.length).toBeGreaterThan(0);
      expect(fetched.every((url) => url.startsWith(`${DEVNET}/`))).toBe(true);
      let partyId: string | null = null;
      expect(
        await store.run(
          'party',
          async ({ tokens }) => {
            partyId = await tokens.partyId();
          },
          { readOnly: true }
        )
      ).toBe(true);
      expect(partyId).toBe(HOLDER);
      // The token wallet is bound to that party: it does not read the primary account again.
      expect(provider.requests.filter((r) => r.method === 'getPrimaryAccount')).toHaveLength(1);
      store.dispose();
    });

    it('is bound to its session: once the session switched to another account, its writes are refused unsent', async () => {
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () => new Response('down', { status: 503 }));
      try {
        const session = createCip103Session();
        const store = createWalletStore({ session });
        const account: Record<string, unknown> = { partyId: HOLDER };
        const provider = fakeProvider({}, { party: HOLDER, account });
        await session.connected(provider, { network: 'devnet' });
        await flush();
        let kept: Wallet | null = null;
        expect(
          await store.run(
            'keep',
            async ({ tokens }) => {
              kept = tokens;
            },
            { readOnly: true }
          )
        ).toBe(true);
        // The wallet now signs in as another party: a new ConnectedWallet, with its own token wallet.
        account['partyId'] = OTHER;
        await session.connected(provider, { network: 'devnet' });
        await flush();
        expect(connectedWallet(session).partyId).toBe(OTHER);
        // A dApp that kept HOLDER's token wallet submits through it in OTHER's run.
        const stale = kept as unknown as Wallet;
        let sent: string[] = [];
        let fetched = -1;
        expect(
          await store.run('send', async () => {
            const requests = provider.requests.length;
            const fetches = fetchSpy.mock.calls.length;
            try {
              await stale.createTransferPreapproval({ instrumentAdmin: OTHER });
            } finally {
              sent = provider.requests.slice(requests).map((r) => r.method);
              fetched = fetchSpy.mock.calls.length - fetches;
            }
          })
        ).toBe(false);
        expect(store.getSnapshot().outcome).toMatchObject({
          status: 'failed',
          partyId: OTHER,
          error: { kind: 'refused', code: 'invalid-input', message: expect.stringMatching(/nothing was submitted/) },
        });
        // Refused before any read, registry call or signature.
        expect(sent).toEqual([]);
        expect(fetched).toBe(0);
        expect(provider.submissions).toEqual([]);
        store.dispose();
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('records no interrupted outcome for a write it refused unsent because the account switched mid-write', async () => {
      const operator = deferred<Response>();
      let holdOperator = false;
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
        if (holdOperator && href.endsWith('/api/utilities/v0/operator')) return operator.promise;
        return new Response('down', { status: 503 });
      });
      try {
        const session = createCip103Session();
        const store = createWalletStore({ session });
        const account: Record<string, unknown> = { partyId: HOLDER };
        const provider = fakeProvider({}, { party: HOLDER, account });
        await session.connected(provider, { network: 'devnet' });
        await flush();
        expect(store.getSnapshot().busy).toBe(false);
        // A write whose registry call is pending when the wallet switches to another account.
        holdOperator = true;
        let caught: unknown = null;
        const ran = store.run('send', async ({ tokens }) => {
          try {
            await tokens.createTransferPreapproval({ instrumentAdmin: OTHER });
          } catch (error) {
            caught = error;
            throw error;
          }
        });
        await flush();
        expect(store.getSnapshot().running).toBe('send');
        account['partyId'] = OTHER;
        await session.connected(provider, { network: 'devnet' });
        expect(connectedWallet(session).partyId).toBe(OTHER);
        operator.resolve(new Response(JSON.stringify({ partyId: 'op::1' }), { status: 200 }));
        expect(await ran).toBe(false);
        // The check before signing refused it: nothing was submitted, so its outcome is known.
        expect(caught).toBeInstanceOf(WalletError);
        expect(provider.submissions).toEqual([]);
        expect(store.getSnapshot()).toMatchObject({ outcome: null, unknownOutcomeParty: null });
        store.dispose();
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });
});
