/**
 * `createTokenWalletStore`: one token wallet per connected wallet, its snapshot, one wallet call at a time, a reload
 * after every write attempt, and outcomes tagged with the session they ran for.
 */
import {
  createCip103Session,
  createTokenWalletStore,
  TokenWalletError,
  WalletReadError,
  WalletSubmitError,
  type ConnectedWallet,
  type Cip103Session,
  type TokenWallet,
  type TokenWalletState,
  type TokenWalletStore,
} from '../../../src/wallets';
import { DEVNET, fakeProvider, HOLDER, OTHER } from './helpers';
import { connectedWallet, deferred, flush, TestProvider } from './session-helpers';

/** A load the test answers: the party it was asked for, and its settle functions. */
interface PendingLoad {
  readonly partyId: string;
  readonly resolve: (state: TokenWalletState) => void;
  readonly reject: (error: unknown) => void;
}

/** A snapshot that names its party and the load it answered. */
const snapshot = (partyId: string, offset: number): TokenWalletState => ({
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
  store: TokenWalletStore;
  opened: ConnectedWallet[];
  loads: PendingLoad[];
  answer: (offset?: number) => void;
  fail: (error: unknown) => void;
  published: () => number;
} {
  const session = createCip103Session();
  const provider = new TestProvider();
  const opened: ConnectedWallet[] = [];
  const loads: PendingLoad[] = [];
  const store = createTokenWalletStore({
    session,
    open: (wallet) => {
      opened.push(wallet);
      const tokens: Pick<TokenWallet, 'loadState'> = {
        loadState: async () => {
          const reply = deferred<TokenWalletState>();
          loads.push({ partyId: wallet.partyId, resolve: reply.resolve, reject: reply.reject });
          return reply.promise;
        },
      };
      return tokens as TokenWallet;
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

describe('createTokenWalletStore', () => {
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

  it('drops a stale load reply', async () => {
    const t = setup();
    await connectAndLoad(t);
    t.store.refresh();
    t.store.refresh();
    expect(t.loads).toHaveLength(2);
    const [older, newer] = t.loads.splice(0);
    newer?.resolve(snapshot(HOLDER, 20));
    await flush();
    older?.resolve(snapshot(HOLDER, 10));
    await flush();
    expect(t.store.getSnapshot().state).toMatchObject({ offset: 20 });
    // A stale failure is dropped too.
    t.store.refresh();
    t.store.refresh();
    const [stale, fresh] = t.loads.splice(0);
    fresh?.resolve(snapshot(HOLDER, 30));
    await flush();
    stale?.reject(new Error('late'));
    await flush();
    expect(t.store.getSnapshot()).toMatchObject({ state: { offset: 30 }, loadError: null });
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

  it('ignores refresh() while an action runs or while disconnected', async () => {
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
          throw new TokenWalletError('insufficient-balance', 'not enough');
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

  describe('default token wallet', () => {
    it('refuses a connected wallet without a network as a load error', async () => {
      const session = createCip103Session();
      const store = createTokenWalletStore({ session });
      await session.connected(new TestProvider());
      expect(store.getSnapshot()).toMatchObject({
        state: null,
        loading: false,
        loadError: {
          kind: 'refused',
          code: 'invalid-input',
          message:
            'The connected wallet names no network: connect with { network }, or pass open to createTokenWalletStore',
        },
      });
      expect(await store.run('send', async () => 'x')).toBe(false);
    });

    it("acts as the connected party through createTokenWallet with DA's registry for its network", async () => {
      // DA's registry is down: the load reaches it on DevNet and fails as a registry error.
      const fetched: string[] = [];
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        fetched.push(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url);
        return new Response('down', { status: 503 });
      });
      const session = createCip103Session();
      const store = createTokenWalletStore({ session });
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
  });
});
