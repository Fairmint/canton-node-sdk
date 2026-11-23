/**
 * `createWalletStore`: one token wallet per connected wallet, its snapshot, typed actions one wallet call at a time, a
 * reload after every write attempt, outcomes tagged with their party, and a sticky unknown outcome.
 */
import {
  actionState,
  canAct,
  createCip103Session,
  createWalletStore,
  walletActionKey,
  RegistryApiError,
  WalletError,
  WalletReadError,
  WalletSubmitError,
  type Cip103Session,
  type ConnectedWallet,
  type TransferPlan,
  type Wallet,
  type WalletAction,
  type WalletOptions,
  type WalletState,
  type WalletStore,
  type WalletStoreOptions,
  type WalletView,
  createWriteLatch,
  type WriteRunContext,
} from '../../../src/wallets';
import type { WalletStoreInternalOptions } from '../../../src/wallets/store';
import { CANTON_COIN_METADATA } from '../../../src/wallets/amulet/constants';
import {
  amuletHolding,
  DSO,
  fakeFetch,
  fakeProvider,
  HOLDER,
  HOLDING_V1_VIEW_KEY,
  OPERATOR,
  OTHER,
  REGISTRAR,
} from './helpers';
import { connectedWallet, deferred, flush, TestProvider } from './session-helpers';

/** A wallet call the test answers: the party and method it was asked for, and its settle functions. */
interface PendingCall {
  readonly partyId: string;
  readonly method: string;
  readonly args: readonly unknown[];
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
}

/** A snapshot whose offset names the load it answered. */
const snapshot = (offset: number): WalletState => ({
  offset,
  holdings: [],
  balances: [],
  transferOffers: { incoming: [], outgoing: [] },
  mintOffers: [],
  burnRequests: [],
  transferPreapprovals: [],
  cantonCoinUnavailable: false,
});

const SUBMITTED = { updateId: 'update-1', commandId: 'command-1' };
const INSTRUMENT = { admin: REGISTRAR, id: 'XMPL' };
const ACCEPT: WalletAction = { type: 'acceptMintOffer', mintOfferCid: 'mint-1' };
const PLAN = {
  type: 'planTransfer',
  request: { receiver: OTHER, instrumentId: INSTRUMENT, amount: '1' },
} as const satisfies WalletAction;

/**
 * A session over a scriptable provider, and a store whose token wallets hold every call (loads and actions) until the
 * test answers it.
 */
function setup(extra: Partial<WalletStoreOptions> = {}): {
  session: Cip103Session;
  provider: TestProvider;
  store: WalletStore;
  opened: WalletOptions[];
  loads: PendingCall[];
  calls: PendingCall[];
  /** Answer the oldest pending load. */
  answer: (offset?: number) => void;
  fail: (error: unknown) => void;
  /** The oldest pending action call. */
  call: () => PendingCall;
  published: () => number;
  /** How many wallet calls (loads and actions) are in flight. */
  active: () => number;
} {
  const session = createCip103Session({ network: 'devnet' });
  const provider = new TestProvider();
  const opened: WalletOptions[] = [];
  const loads: PendingCall[] = [];
  const calls: PendingCall[] = [];
  let active = 0;
  const hold = async <T>(list: PendingCall[], partyId: string, method: string, args: unknown[]): Promise<T> => {
    const reply = deferred<T>();
    list.push({ partyId, method, args, resolve: reply.resolve as (value: unknown) => void, reject: reply.reject });
    active += 1;
    try {
      return await reply.promise;
    } finally {
      active -= 1;
    }
  };
  const openWallet = (options: WalletOptions): Wallet => {
    opened.push(options);
    const { partyId, network } = options;
    const action =
      <T>(method: string) =>
      async (...args: unknown[]): Promise<T> =>
        hold<T>(calls, partyId, method, args);
    return {
      partyId,
      network,
      loadState: async (...args: unknown[]) => hold<WalletState>(loads, partyId, 'loadState', args),
      planTransfer: action('planTransfer'),
      acceptTransferOffer: action('acceptTransferOffer'),
      rejectTransferOffer: action('rejectTransferOffer'),
      withdrawTransferOffer: action('withdrawTransferOffer'),
      withdrawExpiredTransferOffers: action('withdrawExpiredTransferOffers'),
      reclaimLockedTokens: action('reclaimLockedTokens'),
      acceptMintOffer: action('acceptMintOffer'),
      rejectMintOffer: action('rejectMintOffer'),
      requestBurn: action('requestBurn'),
      cancelBurnRequest: action('cancelBurnRequest'),
      createTransferPreapproval: action('createTransferPreapproval'),
      removeTransferPreapproval: action('removeTransferPreapproval'),
    };
  };
  const internal: WalletStoreInternalOptions = { session, openWallet, ...extra };
  const store = createWalletStore(internal);
  let published = 0;
  store.subscribe(() => {
    published += 1;
  });
  const next = (list: PendingCall[], what: string): PendingCall => {
    const pending = list.shift();
    if (pending === undefined) throw new Error(`no ${what} is pending`);
    return pending;
  };
  return {
    session,
    provider,
    store,
    opened,
    loads,
    calls,
    answer: (offset = 1) => next(loads, 'load').resolve(snapshot(offset)),
    fail: (error) => next(loads, 'load').reject(error),
    call: () => next(calls, 'call'),
    published: () => published,
    active: () => active,
  };
}

type Setup = ReturnType<typeof setup>;

/** Connect `party` and answer its first load. */
async function connectAndLoad(t: Setup, party: string = HOLDER): Promise<ConnectedWallet> {
  t.provider.setParty(party);
  await t.session.connect(t.provider);
  t.answer();
  await flush();
  return connectedWallet(t.session);
}

/** Switch the connected wallet's account to `party`. */
async function switchAccount(t: Setup, party: string): Promise<ConnectedWallet> {
  t.provider.setParty(party);
  t.provider.emit('accountsChanged', [{ partyId: party, primary: true }]);
  await flush();
  return connectedWallet(t.session);
}

/** Run `ACCEPT` to success, answering its call and its reload. */
async function acceptMintOffer(t: Setup): Promise<void> {
  const ran = t.store.act(ACCEPT);
  t.call().resolve(SUBMITTED);
  await ran;
  t.answer();
  await flush();
}

/** A plan whose `submit` the test answers. */
function fakePlan(kind: TransferPlan['kind'] = 'offer'): { plan: TransferPlan; submit: ReturnType<typeof deferred> } {
  const submit = deferred<unknown>();
  const plan: TransferPlan = {
    kind,
    description: 'planned',
    partyId: HOLDER,
    request: { receiver: OTHER, instrumentId: INSTRUMENT, amount: '1' },
    submit: async () => submit.promise as Promise<never>,
  };
  return { plan, submit };
}

/** A plan the store made for its current wallet (the only kind `submitTransfer` sends). */
async function planThroughStore(t: Setup, kind: TransferPlan['kind'] = 'offer'): Promise<ReturnType<typeof fakePlan>> {
  const planned = fakePlan(kind);
  const planning = t.store.act(PLAN);
  t.call().resolve(planned.plan);
  const plan = await planning;
  if (plan === null) throw new Error('planning was refused');
  return { plan, submit: planned.submit };
}

describe('createWalletStore', () => {
  it('opens a token wallet for each connected wallet on the session network, bound to it, and loads its snapshot', async () => {
    const t = setup();
    expect(t.store.getSnapshot()).toEqual({
      session: { status: 'disconnected', error: null },
      wallet: null,
      ready: false,
      state: null,
      loading: false,
      loadError: null,
      running: null,
      busy: false,
      busyReason: null,
      busyLabel: null,
      shown: null,
      stale: false,
      readOnly: null,
      outcome: null,
      unknownOutcome: null,
      notices: [],
    });
    await t.session.connect(t.provider);
    const wallet = connectedWallet(t.session);
    expect(t.opened).toEqual([
      { provider: t.provider, partyId: HOLDER, network: 'devnet', isActive: expect.any(Function) },
    ]);
    expect(t.store.getSnapshot()).toMatchObject({ wallet, ready: true, state: null, loading: true, busy: true });
    t.answer(7);
    await flush();
    expect(t.store.getSnapshot()).toMatchObject({ wallet, state: { offset: 7 }, loading: false, busy: false });
    expect(t.store.getSnapshot()).toBe(t.store.getSnapshot());
    // Its isActive follows the session: false once the account switched.
    const isActive = t.opened[0]?.isActive;
    expect(isActive?.()).toBe(true);
    await switchAccount(t, OTHER);
    expect(isActive?.()).toBe(false);
    expect(t.opened[1]?.isActive?.()).toBe(true);
  });

  it("builds DA's token wallet with the registry options when no hook is given", async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 503, text: 'down' }));
    const session = createCip103Session({ network: 'devnet' });
    const store = createWalletStore({ session, registry: { baseUrl: 'https://registry.example', fetch } });
    const provider = fakeProvider({}, { party: HOLDER });
    await session.connect(provider);
    await flush();
    expect(store.getSnapshot().loadError).toMatchObject({ kind: 'registry', code: 503 });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.url.startsWith('https://registry.example/'))).toBe(true);
    // Bound to the party: it does not read the primary account again.
    expect(provider.requests.filter((r) => r.method === 'getPrimaryAccount')).toHaveLength(1);
    store.dispose();
  });

  it("passes the Canton Coin options to each token wallet: a pinned DSO drops another DSO's Amulet", async () => {
    const { fetch } = fakeFetch((call) =>
      call.url.endsWith('/api/utilities/v0/operator') ? { json: { partyId: OPERATOR } } : { status: 404, json: {} }
    );
    const session = createCip103Session({ network: 'devnet' });
    const store = createWalletStore({ session, registry: { fetch }, cantonCoin: { dsoParty: DSO, fetch } });
    const provider = fakeProvider(
      {
        [HOLDING_V1_VIEW_KEY]: [amuletHolding('00cc', '3'), amuletHolding('00ccother', '9', { dso: 'DSO::1220ffff' })],
      },
      { party: HOLDER }
    );
    await session.connect(provider);
    await flush();
    const { state, loadError } = store.getSnapshot();
    expect(loadError).toBeNull();
    expect(state?.holdings.map((h) => h.contractId)).toEqual(['00cc']);
    expect(state?.balances).toEqual([
      expect.objectContaining({
        instrumentId: { admin: DSO, id: 'Amulet' },
        unlocked: '3.0000000000',
        source: 'amulet',
        metadata: CANTON_COIN_METADATA,
      }),
    ]);
    store.dispose();
  });

  it('warns, with a retry, while Canton Coin cannot be confirmed, and shows the rest of the state', async () => {
    const { fetch } = fakeFetch((call) =>
      call.url.endsWith('/api/utilities/v0/operator') ? { json: { partyId: OPERATOR } } : { status: 503, json: {} }
    );
    const session = createCip103Session({ network: 'devnet' });
    const store = createWalletStore({ session, registry: { fetch }, cantonCoin: { fetch } });
    await session.connect(fakeProvider({ [HOLDING_V1_VIEW_KEY]: [amuletHolding('00cc', '3')] }, { party: HOLDER }));
    await flush();
    const view = store.getSnapshot();
    expect(view.loadError).toBeNull();
    expect(view.state).toMatchObject({ holdings: [], cantonCoinUnavailable: true });
    expect(view.notices).toEqual([
      expect.objectContaining({ key: 'canton-coin', level: 'warning', title: 'Canton Coin is not shown', retry: true }),
    ]);
    store.dispose();
  });

  it('shows why when the token wallet cannot be built (an invalid registry option), without a retry', async () => {
    const session = createCip103Session({ network: 'devnet' });
    const store = createWalletStore({ session, registry: { trustedProviders: { [REGISTRAR]: [] } } });
    await session.connect(fakeProvider({}, { party: HOLDER }));
    await flush();
    const view = store.getSnapshot();
    expect(view).toMatchObject({ wallet: { partyId: HOLDER }, ready: false, state: null, loading: false, busy: false });
    expect(canAct(view, ACCEPT)).toBe(false);
    expect(canAct(view, PLAN)).toBe(false);
    expect(view.loadError).not.toBeNull();
    expect(view.notices).toEqual([expect.objectContaining({ key: 'load', level: 'error' })]);
    expect(view.notices[0]).not.toHaveProperty('retry');
    expect(await store.act(ACCEPT)).toBeNull();
    store.dispose();
  });

  it('resolves null when a listener ends the session while the store publishes how an action settled', async () => {
    const t = setup();
    await connectAndLoad(t);
    const ran = t.store.act(ACCEPT);
    const call = t.call();
    let ended = false;
    t.store.subscribe(() => {
      if (!ended && t.store.getSnapshot().running === null) {
        ended = true;
        t.session.disconnect();
      }
    });
    call.resolve(SUBMITTED);
    expect(await ran).toBeNull();
    expect(ended).toBe(true);
    expect(t.session.getSnapshot().status).toBe('disconnected');
  });

  it('refuses a second action in the same tick without calling the wallet', async () => {
    const t = setup();
    await connectAndLoad(t);
    const first = t.store.act(ACCEPT);
    expect(await t.store.act({ type: 'rejectMintOffer', mintOfferCid: 'mint-2' })).toBeNull();
    expect(t.calls.map((c) => c.method)).toEqual(['acceptMintOffer']);
    expect(t.store.getSnapshot()).toMatchObject({
      running: { action: ACCEPT, key: 'acceptMintOffer:mint-1' },
      busy: true,
    });
    t.call().resolve(SUBMITTED);
    expect(await first).toEqual(SUBMITTED);
  });

  it('refuses while disconnected and while a load is pending: the first one and a Retry', async () => {
    const t = setup();
    expect(await t.store.act(ACCEPT)).toBeNull();
    await t.session.connect(t.provider);
    expect(await t.store.act(PLAN)).toBeNull();
    t.answer();
    await flush();
    t.store.refresh();
    expect(t.store.getSnapshot()).toMatchObject({ loading: true, busy: true });
    expect(await t.store.act(PLAN)).toBeNull();
    expect(t.calls).toHaveLength(0);
  });

  it.each([
    ['disconnects', (t: Setup) => t.session.disconnect()],
    ['fails the session', (t: Setup) => t.session.fail(new Error('wallet setup failed'))],
    ['disposes the store', (t: Setup) => t.store.dispose()],
  ])('does not start an action when a listener of its running state %s', async (name, cancel) => {
    const t = setup();
    await connectAndLoad(t);
    let cancelled = false;
    t.store.subscribe(() => {
      if (!cancelled && t.store.getSnapshot().running !== null) {
        cancelled = true;
        cancel(t);
      }
    });
    expect(await t.store.act(ACCEPT)).toBeNull();
    expect(t.calls).toHaveLength(0);
    expect(t.loads).toHaveLength(0);
    if (name === 'disposes the store') return; // a disposed store publishes nothing more
    expect(t.store.getSnapshot()).toMatchObject({ running: null, busy: false, outcome: null, unknownOutcome: null });
    // The latch is free: after connecting again, an action runs.
    await connectAndLoad(t);
    const ran = t.store.act(ACCEPT);
    t.call().resolve(SUBMITTED);
    expect(await ran).toEqual(SUBMITTED);
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
        if (t.store.getSnapshot().running !== null) throw boom;
      });
      let seen = 0;
      t.store.subscribe(() => {
        seen += 1;
      });
      await acceptMintOffer(t);
      expect(rethrown).toContain(boom);
      expect(seen).toBeGreaterThan(0);
      expect(t.active()).toBe(0);
      expect(t.store.getSnapshot()).toMatchObject({ busy: false, running: null, outcome: { status: 'succeeded' } });
    } finally {
      timer.mockRestore();
    }
  });

  describe('actions', () => {
    const offerCases: Array<[WalletAction, string, unknown[], string]> = [
      [ACCEPT, 'acceptMintOffer', ['mint-1'], 'Mint offer accepted (update update-1).'],
      [
        { type: 'rejectMintOffer', mintOfferCid: 'mint-1' },
        'rejectMintOffer',
        ['mint-1'],
        'Mint offer rejected (update update-1).',
      ],
      [
        { type: 'acceptTransferOffer', transferOfferCid: 'offer-1' },
        'acceptTransferOffer',
        ['offer-1'],
        'Transfer accepted (update update-1).',
      ],
      [
        { type: 'rejectTransferOffer', transferOfferCid: 'offer-1' },
        'rejectTransferOffer',
        ['offer-1'],
        'Transfer offer rejected (update update-1).',
      ],
      [
        { type: 'withdrawTransferOffer', transferOfferCid: 'offer-1' },
        'withdrawTransferOffer',
        ['offer-1'],
        'Transfer offer withdrawn; its tokens are unlocked (update update-1).',
      ],
      [
        { type: 'cancelBurnRequest', burnRequestCid: 'burn-1' },
        'cancelBurnRequest',
        ['burn-1'],
        'Redemption cancelled; the amount is unlocked (update update-1).',
      ],
      [
        { type: 'createTransferPreapproval', instrumentAdmin: REGISTRAR, instrumentIds: ['XMPL'] },
        'createTransferPreapproval',
        [{ instrumentAdmin: REGISTRAR, instrumentIds: ['XMPL'] }],
        `Transfer preapproval created: transfers of XMPL by ${REGISTRAR} now complete at once (update update-1).`,
      ],
      [
        { type: 'createTransferPreapproval', instrumentAdmin: REGISTRAR },
        'createTransferPreapproval',
        [{ instrumentAdmin: REGISTRAR }],
        `Transfer preapproval created: transfers of ${REGISTRAR}'s instruments now complete at once (update update-1).`,
      ],
      [
        { type: 'removeTransferPreapproval', preapprovalCid: 'pre-1' },
        'removeTransferPreapproval',
        ['pre-1'],
        'Transfer preapproval removed (update update-1).',
      ],
    ];

    it.each(offerCases)('%j calls %s, records the SDK sentence and reloads', async (action, method, args, message) => {
      const t = setup();
      await connectAndLoad(t);
      const ran = t.store.act(action);
      const call = t.call();
      // Every call also gets the options carrying the store's cancellation signal.
      expect([call.method, call.args]).toEqual([method, [...args, { signal: expect.any(AbortSignal) }]]);
      call.resolve(SUBMITTED);
      expect(await ran).toEqual(SUBMITTED);
      const key = walletActionKey(action);
      expect(t.store.getSnapshot()).toMatchObject({
        running: null,
        busy: true,
        loading: true,
        outcome: { action, key, partyId: HOLDER, status: 'succeeded', message },
        notices: [{ key: 'outcome', level: 'success', message }],
      });
      t.answer(2);
      await flush();
      expect(t.store.getSnapshot()).toMatchObject({ busy: false, state: { offset: 2 } });
    });

    it('withdrawExpiredTransferOffers withdraws per token, counts the offers and reloads', async () => {
      const t = setup();
      await connectAndLoad(t);
      const action = { type: 'withdrawExpiredTransferOffers', instrumentId: INSTRUMENT } as const;
      expect(walletActionKey(action)).toBe('withdrawExpiredTransferOffers:XMPL@registrar::1220bb');
      const ran = t.store.act(action);
      const call = t.call();
      expect([call.method, call.args]).toEqual([
        'withdrawExpiredTransferOffers',
        [INSTRUMENT, { signal: expect.any(AbortSignal) }],
      ]);
      const result = {
        withdrawn: [
          { ...SUBMITTED, updateId: 'update-a', transferOfferCid: 'offer-a', amount: '1', registry: 'da' },
          { ...SUBMITTED, transferOfferCid: 'offer-b', amount: '2', registry: 'da' },
        ],
        released: [],
        notAttempted: [],
      };
      call.resolve(result);
      expect(await ran).toEqual(result);
      expect(t.store.getSnapshot()).toMatchObject({
        loading: true,
        outcome: {
          status: 'succeeded',
          message: 'Withdrew 2 expired transfer offers of XMPL; those tokens are unlocked (update update-1).',
        },
      });
    });

    it('reclaimLockedTokens names Canton Coin by its symbol and counts offers and locks', async () => {
      const t = setup();
      await connectAndLoad(t);
      const cc = { admin: 'DSO::1220dso', id: 'Amulet' } as const;
      const ran = t.store.act({ type: 'reclaimLockedTokens', instrumentId: cc });
      const call = t.call();
      expect(call.method).toBe('reclaimLockedTokens');
      const result = {
        withdrawn: [
          { ...SUBMITTED, updateId: 'update-a', transferOfferCid: 'offer-a', amount: '1', registry: 'amulet' },
        ],
        released: [{ ...SUBMITTED, updateId: 'update-b', lockedHoldingCid: 'lock-b', amount: '2' }],
        notAttempted: [],
      };
      call.resolve(result);
      expect(await ran).toEqual(result);
      expect(t.store.getSnapshot().outcome).toMatchObject({
        status: 'succeeded',
        message:
          'Withdrew 1 expired transfer offer and released 1 expired lock of CC; those tokens are unlocked (update update-b).',
      });
    });

    it("names a DA registrar's own 'Amulet' by its id, not as Canton Coin", async () => {
      const t = setup();
      await connectAndLoad(t);
      const daAmulet = { admin: REGISTRAR, id: 'Amulet' } as const;
      const ran = t.store.act({ type: 'withdrawExpiredTransferOffers', instrumentId: daAmulet });
      t.call().resolve({
        withdrawn: [{ ...SUBMITTED, transferOfferCid: 'offer-a', amount: '1', registry: 'da' }],
        released: [],
        notAttempted: [],
      });
      await ran;
      expect(t.store.getSnapshot().outcome).toMatchObject({
        status: 'succeeded',
        message: 'Withdrew 1 expired transfer offer of Amulet; those tokens are unlocked (update update-1).',
      });
    });

    it('counts the work a stopped reclaim did not get to without pluralising "more"', async () => {
      const t = setup();
      await connectAndLoad(t);
      const ran = t.store.act({ type: 'withdrawExpiredTransferOffers', instrumentId: INSTRUMENT });
      t.call().resolve({
        withdrawn: [{ ...SUBMITTED, transferOfferCid: 'offer-a', amount: '1', registry: 'da' }],
        released: [],
        failed: { contractId: 'offer-b', error: new WalletError('not-found', 'gone') },
        notAttempted: ['offer-c', 'offer-d'],
      });
      expect(await ran).toBeNull();
      const { outcome } = t.store.getSnapshot();
      expect(outcome?.status === 'failed' && outcome.error.message).toMatch(/ 2 more not attempted\.$/);
    });

    it('keeps the outcome of a reclaim that committed part of its work before the account switched', async () => {
      const t = setup();
      await connectAndLoad(t);
      const ran = t.store.act({ type: 'withdrawExpiredTransferOffers', instrumentId: INSTRUMENT });
      const call = t.call();
      await switchAccount(t, OTHER);
      call.resolve({
        withdrawn: [{ ...SUBMITTED, transferOfferCid: 'offer-a', amount: '1', registry: 'da' }],
        released: [],
        failed: {
          contractId: 'offer-b',
          error: new WalletError(
            'invalid-input',
            'The wallet session this action was prepared in has ended (the wallet disconnected or switched accounts); nothing was submitted. Start the action again.'
          ),
        },
        notAttempted: [],
      });
      expect(await ran).toBeNull();
      const view = t.store.getSnapshot();
      expect(view.outcome).toMatchObject({
        status: 'failed',
        partyId: HOLDER,
        error: {
          kind: 'refused',
          message: expect.stringMatching(/^The wallet withdrew 1 expired transfer offer of XMPL/),
        },
      });
      expect(view.notices.find((n) => n.key === 'outcome')?.message).toMatch(new RegExp(`\\(party ${HOLDER}\\)$`));
    });

    it('reports a reclaim that stopped part way as failed, naming what committed, and keeps an unknown outcome', async () => {
      const t = setup();
      await connectAndLoad(t);
      const ran = t.store.act({ type: 'reclaimLockedTokens', instrumentId: INSTRUMENT });
      t.call().resolve({
        withdrawn: [{ ...SUBMITTED, transferOfferCid: 'offer-a', amount: '1' }],
        released: [],
        failed: { contractId: 'offer-b', error: new WalletSubmitError('unknown', 'timed out', { commandId: 'c-2' }) },
        notAttempted: ['offer-c'],
      });
      expect(await ran).toBeNull();
      const view = t.store.getSnapshot();
      expect(view.unknownOutcome).toMatchObject({
        commandId: 'c-2',
        message: expect.stringMatching(
          /^The wallet withdrew 1 expired transfer offer of XMPL, then stopped: .*1 more not attempted\.$/
        ),
      });
    });

    it("drops 'nothing was submitted' from a partial reclaim's reason, since earlier steps committed", async () => {
      const t = setup();
      await connectAndLoad(t);
      const ran = t.store.act({ type: 'reclaimLockedTokens', instrumentId: INSTRUMENT });
      t.call().resolve({
        withdrawn: [{ ...SUBMITTED, transferOfferCid: 'offer-a', amount: '1' }],
        released: [],
        failed: {
          contractId: 'offer-b',
          error: new WalletError('invalid-input', 'The offer moved; nothing was submitted'),
        },
        notAttempted: [],
      });
      expect(await ran).toBeNull();
      const message = t.store.getSnapshot().outcome?.status === 'failed' ? t.store.getSnapshot().outcome : undefined;
      expect(message).toMatchObject({
        error: {
          message:
            'The wallet withdrew 1 expired transfer offer of XMPL, then stopped: The offer moved. Nothing after that was submitted.',
        },
      });
    });

    it('keeps the sentence break where it drops the clause from a reason with more after it', async () => {
      const t = setup();
      await connectAndLoad(t);
      const ran = t.store.act({ type: 'reclaimLockedTokens', instrumentId: INSTRUMENT });
      t.call().resolve({
        withdrawn: [{ ...SUBMITTED, transferOfferCid: 'offer-a', amount: '1' }],
        released: [],
        failed: {
          contractId: 'offer-b',
          error: new WalletError(
            'invalid-input',
            'Session ended (1.5 s); nothing was submitted. Start the action again.'
          ),
        },
        notAttempted: [],
      });
      expect(await ran).toBeNull();
      expect(t.store.getSnapshot().outcome).toMatchObject({
        error: {
          message:
            'The wallet withdrew 1 expired transfer offer of XMPL, then stopped: Session ended (1.5 s). Start the action again. Nothing after that was submitted.',
        },
      });
    });

    it('requestBurn passes its options on and names the reference', async () => {
      const t = setup();
      await connectAndLoad(t);
      const executeBefore = new Date('2030-01-01T00:00:00.000Z');
      const ran = t.store.act({ type: 'requestBurn', instrumentId: INSTRUMENT, amount: '2', executeBefore });
      const call = t.call();
      expect(call.args).toEqual([
        { instrumentId: INSTRUMENT, amount: '2', executeBefore },
        { signal: expect.any(AbortSignal) },
      ]);
      call.resolve({ ...SUBMITTED, reference: 'holder-burn-1' });
      expect(await ran).toEqual({ ...SUBMITTED, reference: 'holder-burn-1' });
      expect(t.store.getSnapshot().outcome).toMatchObject({
        status: 'succeeded',
        message: 'Redemption holder-burn-1 requested (update update-1). The registrar burns the amount or returns it.',
      });
    });

    it.each([
      ['direct', 'Sent: the tokens moved to the receiver (update update-1).'],
      ['offer', 'Transfer offer sent: the receiver must accept it before it expires (update update-1).'],
      ['self', 'Self-transfer done (update update-1).'],
    ] as const)('submitTransfer runs the plan and says what a %s transfer did', async (kind, message) => {
      const t = setup();
      await connectAndLoad(t);
      const { plan, submit } = await planThroughStore(t, kind);
      const ran = t.store.act({ type: 'submitTransfer', plan });
      submit.resolve({ ...SUBMITTED, kind });
      expect(await ran).toEqual({ ...SUBMITTED, kind });
      expect(t.store.getSnapshot().outcome).toMatchObject({ status: 'succeeded', message });
      expect(t.loads).toHaveLength(1);
    });

    it('submitTransfer refuses a plan another store on the same session made', async () => {
      const t = setup();
      await connectAndLoad(t);
      const { plan } = await planThroughStore(t);
      const other = createWalletStore({ session: t.session });
      await flush(); // its first load fails at once: the test provider serves no ledgerApi
      expect(other.getSnapshot()).toMatchObject({ ready: true, busy: false });
      expect(await other.act({ type: 'submitTransfer', plan })).toBeNull();
      expect(other.getSnapshot().outcome).toMatchObject({
        status: 'failed',
        error: { kind: 'refused', code: 'invalid-input' },
      });
      other.dispose();
    });

    it('submitTransfer refuses a plan the store did not make for the current wallet, before submitting', async () => {
      const t = setup();
      await connectAndLoad(t);
      // A plan made outside the store (another session, network or a standalone wallet).
      const foreign = fakePlan();
      let submitted = false;
      const outside: TransferPlan = {
        ...foreign.plan,
        submit: async () => {
          submitted = true;
          return foreign.submit.promise as Promise<never>;
        },
      };
      expect(await t.store.act({ type: 'submitTransfer', plan: outside })).toBeNull();
      expect(submitted).toBe(false);
      expect(t.store.getSnapshot().outcome).toMatchObject({
        status: 'failed',
        error: { kind: 'refused', code: 'invalid-input' },
      });
      t.answer(); // the reload after a write attempt
      await flush();

      // A plan this store made for the previous account.
      const { plan } = await planThroughStore(t);
      await switchAccount(t, OTHER);
      t.answer();
      await flush();
      expect(await t.store.act({ type: 'submitTransfer', plan })).toBeNull();
      expect(t.store.getSnapshot().outcome).toMatchObject({
        status: 'failed',
        partyId: OTHER,
        error: { kind: 'refused', code: 'invalid-input' },
      });
    });

    it('planTransfer only reads: it returns the plan, leaves the outcome alone, and records a failure', async () => {
      const t = setup();
      await connectAndLoad(t);
      await acceptMintOffer(t);
      const accepted = t.store.getSnapshot().outcome;
      const { plan } = fakePlan();
      const planning = t.store.act(PLAN);
      expect(t.store.getSnapshot().running).toEqual({ action: PLAN, key: `planTransfer:XMPL@${REGISTRAR}` });
      t.call().resolve(plan);
      const handed = await planning;
      // The plan's fields, but its submit refuses: only store.act({ type: 'submitTransfer' }) sends it.
      expect(handed).toMatchObject({ kind: plan.kind, description: plan.description, request: plan.request });
      expect(handed).not.toBe(plan);
      await expect(handed?.submit()).rejects.toMatchObject({ code: 'invalid-input' });
      expect(t.loads).toHaveLength(0);
      expect(t.store.getSnapshot()).toMatchObject({ busy: false, outcome: accepted });

      const refused = t.store.act(PLAN);
      t.call().reject(new WalletError('insufficient-balance', 'not enough'));
      expect(await refused).toBeNull();
      expect(t.loads).toHaveLength(0);
      expect(t.store.getSnapshot()).toMatchObject({
        busy: false,
        outcome: { action: PLAN, status: 'failed', error: { kind: 'refused', code: 'insufficient-balance' } },
        notices: [{ key: 'outcome', level: 'error', message: 'not enough' }],
      });
    });

    describe('proveOwnership', () => {
      const challenge = {
        domain: 'app.example.com',
        nonce: 'nonce-0123456789abcdef',
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2099-01-01T00:00:00.000Z',
        network: 'canton:devnet',
      };

      function ownershipSetup(verdict: unknown): { t: Setup; fetch: ReturnType<typeof fakeFetch> } {
        const t = setup();
        t.provider.answers.getPrimaryAccount = () => ({ primary: true, partyId: HOLDER, publicKey: 'pk' });
        t.provider.answers.signMessage = () => ({ signature: 'sig' });
        const fetch = fakeFetch((call) =>
          call.url === '/challenge' ? { json: { data: { challenge, token: 'token-1' } } } : { json: { data: verdict } }
        );
        return { t, fetch };
      }

      it('a verified verdict is its result, with a sentence; nothing is reloaded', async () => {
        const verdict = {
          verified: true,
          partyId: HOLDER,
          publicKeyFingerprint: '1220aa',
          claimedNetwork: 'canton:devnet',
          verifiedAt: '2026-11-18T00:00:00.000Z',
        };
        const { t, fetch } = ownershipSetup(verdict);
        await t.session.connect(t.provider);
        t.answer();
        await flush();
        const result = await t.store.act({
          type: 'proveOwnership',
          challengeUrl: '/challenge',
          verifyUrl: '/verify',
          fetch: fetch.fetch,
        });
        expect(result).toEqual(verdict);
        expect(fetch.calls.map((call) => [call.url, call.body])).toEqual([
          ['/challenge', { network: 'devnet', partyId: HOLDER }],
          ['/verify', { token: 'token-1', proof: expect.objectContaining({ partyId: HOLDER, signature: 'sig' }) }],
        ]);
        expect(t.loads).toHaveLength(0);
        expect(t.store.getSnapshot().outcome).toMatchObject({
          key: 'proveOwnership',
          status: 'succeeded',
          message: `Verified: this wallet holds the key of ${HOLDER} (key fingerprint 1220aa).`,
        });
      });

      it('a verdict that did not verify is a not-verified failure', async () => {
        const { t, fetch } = ownershipSetup({ verified: false, reason: 'bad-signature', message: 'Bad signature.' });
        await t.session.connect(t.provider);
        t.answer();
        await flush();
        const action: WalletAction = {
          type: 'proveOwnership',
          challengeUrl: '/challenge',
          verifyUrl: '/verify',
          fetch: fetch.fetch,
        };
        expect(await t.store.act(action)).toBeNull();
        expect(t.store.getSnapshot()).toMatchObject({
          outcome: { status: 'failed', error: { kind: 'not-verified', message: 'Bad signature.' } },
          notices: [{ key: 'outcome', level: 'error', message: 'Bad signature.' }],
        });
      });
    });

    it('walletActionKey names the type and what it acts on', () => {
      const { plan } = fakePlan();
      expect(
        [
          ACCEPT,
          { type: 'withdrawTransferOffer', transferOfferCid: 'o' },
          { type: 'requestBurn', instrumentId: INSTRUMENT, amount: '1' },
          { type: 'cancelBurnRequest', burnRequestCid: 'b' },
          PLAN,
          { type: 'submitTransfer', plan },
          { type: 'createTransferPreapproval', instrumentAdmin: REGISTRAR },
          { type: 'removeTransferPreapproval', preapprovalCid: 'p' },
          { type: 'proveOwnership', challengeUrl: '/c', verifyUrl: '/v' },
        ].map((action) => walletActionKey(action as WalletAction))
      ).toEqual([
        'acceptMintOffer:mint-1',
        'withdrawTransferOffer:o',
        `requestBurn:XMPL@${REGISTRAR}`,
        'cancelBurnRequest:b',
        `planTransfer:XMPL@${REGISTRAR}`,
        `submitTransfer:XMPL@${REGISTRAR}`,
        `createTransferPreapproval:${REGISTRAR}`,
        'removeTransferPreapproval:p',
        'proveOwnership',
      ]);
    });
  });

  describe('loads', () => {
    it('reloads after a failed write, and stays busy until that reload answers', async () => {
      const t = setup();
      await connectAndLoad(t);
      const ran = t.store.act(ACCEPT);
      t.call().reject(new WalletSubmitError('failed', 'ledger said no', { code: -32003, commandId: 'c' }));
      expect(await ran).toBeNull();
      expect(t.loads).toHaveLength(1);
      expect(t.store.getSnapshot()).toMatchObject({
        running: null,
        busy: true,
        loading: true,
        outcome: { status: 'failed', partyId: HOLDER, error: { kind: 'not-committed', code: -32003 } },
      });
      expect(await t.store.act(ACCEPT)).toBeNull();
      t.answer(2);
      await flush();
      expect(t.store.getSnapshot()).toMatchObject({ busy: false, loading: false, state: { offset: 2 } });
    });

    it('clears the state when a load fails, offers a retry, and refresh() loads again', async () => {
      const t = setup();
      await connectAndLoad(t);
      await acceptMintOffer(t);
      t.store.refresh();
      expect(t.store.getSnapshot()).toMatchObject({ loading: true, state: { offset: 1 } });
      t.fail(new WalletReadError('Limit exceeded', -32005));
      await flush();
      const view = t.store.getSnapshot();
      expect(view).toMatchObject({ busy: false, loading: false, state: null });
      expect(view.loadError).toMatchObject({ kind: 'rate-limited', code: -32005 });
      // The outcome stays.
      expect(view.outcome).toMatchObject({ status: 'succeeded' });
      expect(view.notices.map((n) => [n.key, n.level, n.title, n.retry])).toEqual([
        ['load', 'warning', 'The wallet is busy', true],
        ['outcome', 'success', undefined, undefined],
      ]);
      t.store.refresh();
      t.fail(new WalletReadError('not connected', 4100));
      await flush();
      expect(t.store.getSnapshot().notices[0]).toEqual({
        key: 'load',
        level: 'error',
        title: 'The wallet could not be read',
        message: 'The wallet did not answer a read: not connected',
        retry: true,
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
      const ran = t.store.act(ACCEPT);
      t.store.refresh();
      expect(t.loads).toHaveLength(0);
      t.call().resolve(SUBMITTED);
      await ran;
      expect(t.loads).toHaveLength(1);
    });

    it('drops the previous wallet’s load when the wallet changes', async () => {
      const t = setup();
      await t.session.connect(t.provider);
      const holderLoad = t.loads.shift();
      await switchAccount(t, OTHER);
      holderLoad?.resolve(snapshot(99));
      await flush();
      expect(t.store.getSnapshot()).toMatchObject({ wallet: { partyId: OTHER }, state: null, loading: true });
      expect(t.loads.map((l) => l.partyId)).toEqual([OTHER]);
      t.answer(5);
      await flush();
      expect(t.store.getSnapshot()).toMatchObject({ wallet: { partyId: OTHER }, state: { offset: 5 } });
    });
  });

  describe('unknown outcomes', () => {
    it('keeps an outcome-unknown write, and refuses writes, until acknowledged, across plans and wallet changes', async () => {
      const t = setup();
      await connectAndLoad(t);
      const burn: WalletAction = { type: 'requestBurn', instrumentId: INSTRUMENT, amount: '1' };
      const ran = t.store.act(burn);
      t.call().reject(
        new WalletSubmitError('unknown', 'The wallet did not confirm the transaction.', {
          code: -32002,
          commandId: 'command-9',
          burnReference: 'holder-burn-9',
        })
      );
      expect(await ran).toBeNull();
      const unknown = {
        action: burn,
        key: walletActionKey(burn),
        partyId: HOLDER,
        message: expect.stringContaining('Command id: command-9.'),
        commandId: 'command-9',
        burnReference: 'holder-burn-9',
      };
      expect(t.store.getSnapshot()).toMatchObject({ outcome: null, unknownOutcome: unknown });
      t.answer();
      await flush();
      expect(t.store.getSnapshot().notices).toEqual([
        {
          key: 'unknown-outcome',
          level: 'warning',
          title: 'Outcome unknown',
          message: expect.stringContaining('do not resubmit blindly'),
          acknowledge: true,
        },
      ]);

      // A plan runs and does not clear it; a write is refused before the wallet is asked, so it cannot repeat the
      // write whose outcome is unknown, nor replace its command id and burn reference.
      const planning = t.store.act(PLAN);
      const behind = fakePlan();
      let submitted = false;
      t.call().resolve({
        ...behind.plan,
        submit: async () => {
          submitted = true;
          return behind.submit.promise as Promise<never>;
        },
      });
      const handed = await planning;
      if (handed === null) throw new Error('planning was refused');
      // Neither through the store nor directly can that plan be sent meanwhile.
      expect(await t.store.act({ type: 'submitTransfer', plan: handed })).toBeNull();
      await expect(handed.submit()).rejects.toMatchObject({ code: 'invalid-input' });
      expect(submitted).toBe(false);
      expect(canAct(t.store.getSnapshot(), ACCEPT)).toBe(false);
      expect(canAct(t.store.getSnapshot(), PLAN)).toBe(true);
      expect(await t.store.act(ACCEPT)).toBeNull();
      expect(t.calls).toHaveLength(0);
      expect(t.store.getSnapshot()).toMatchObject({ outcome: null, unknownOutcome: unknown, busy: false });

      // Another wallet still sees it, naming its party, and is refused writes too.
      await switchAccount(t, OTHER);
      t.answer();
      await flush();
      const view = t.store.getSnapshot();
      expect(view).toMatchObject({ outcome: null, unknownOutcome: unknown });
      expect(view.notices[0]?.message).toMatch(new RegExp(`\\(party ${HOLDER}\\)$`));
      expect(await t.store.act(ACCEPT)).toBeNull();

      t.store.acknowledgeUnknownOutcome();
      expect(t.store.getSnapshot()).toMatchObject({ unknownOutcome: null });
      expect(canAct(t.store.getSnapshot(), ACCEPT)).toBe(true);
      expect(t.store.getSnapshot().notices.some((n) => n.key === 'unknown-outcome')).toBe(false);
      await acceptMintOffer(t);
      expect(t.store.getSnapshot()).toMatchObject({ outcome: { status: 'succeeded', partyId: OTHER } });
    });

    it.each([
      ['a result', { ok: SUBMITTED }, { outcome: { status: 'succeeded', partyId: HOLDER }, unknownOutcome: null }],
      [
        'a certain failure',
        { error: new WalletSubmitError('failed', 'ledger said no') },
        { outcome: { status: 'failed', partyId: HOLDER, error: { kind: 'not-committed' } }, unknownOutcome: null },
      ],
      [
        'a decline',
        { error: new WalletSubmitError('rejected-by-user', 'no') },
        { outcome: { status: 'failed', error: { kind: 'declined' } }, unknownOutcome: null },
      ],
      [
        'a refusal before anything was submitted',
        { error: new WalletError('invalid-input', 'The wallet session ... has ended; nothing was submitted.') },
        { outcome: null, unknownOutcome: null },
      ],
      [
        'an unknown outcome',
        { error: new WalletSubmitError('unknown', 'lost', { commandId: 'c' }) },
        { outcome: null, unknownOutcome: { partyId: HOLDER, commandId: 'c' } },
      ],
      [
        'a failed read before submitting (the provider ended the session meanwhile)',
        { error: new WalletReadError('The wallet did not answer: disconnected', 4900) },
        { outcome: null, unknownOutcome: null },
      ],
      [
        'a registry failure before submitting',
        { error: new RegistryApiError(503, 'unavailable', 'https://registry.example/x') },
        { outcome: null, unknownOutcome: null },
      ],
    ])('records a write that settles after its session ended by what is known: %s', async (_name, reply, expected) => {
      const t = setup();
      await connectAndLoad(t);
      const ran = t.store.act(ACCEPT);
      t.session.disconnect();
      expect(t.store.getSnapshot()).toMatchObject({ wallet: null, running: { action: ACCEPT }, busy: true });
      const call = t.call();
      if ('ok' in reply) call.resolve(reply.ok);
      else call.reject(reply.error);
      expect(await ran).toBeNull();
      expect(t.store.getSnapshot()).toMatchObject({ running: null, busy: false, ...expected });
      // No reload for an ended session.
      expect(t.loads).toHaveLength(0);
    });

    it('records nothing for a read-only action whose session ended before it settled', async () => {
      const t = setup();
      await connectAndLoad(t);
      const planning = t.store.act(PLAN);
      await switchAccount(t, OTHER);
      expect(t.store.getSnapshot()).toMatchObject({ running: { action: PLAN }, busy: true });
      t.call().reject(new Error('lost'));
      expect(await planning).toBeNull();
      expect(t.store.getSnapshot()).toMatchObject({ running: null, outcome: null, unknownOutcome: null });
      expect(t.loads.map((load) => load.partyId)).toEqual([OTHER]);
    });

    it('records a redemption whose session ended mid-submission with its burn reference', async () => {
      const t = setup();
      await connectAndLoad(t);
      const ran = t.store.act({ type: 'requestBurn', instrumentId: INSTRUMENT, amount: '1', reference: 'my-ref' });
      t.session.disconnect();
      t.call().reject(
        new WalletSubmitError('unknown', 'The wallet lost or changed its session during the request.', {
          code: 4900,
          commandId: 'command-7',
          burnReference: 'my-ref',
        })
      );
      await ran;
      expect(t.store.getSnapshot().unknownOutcome).toMatchObject({
        burnReference: 'my-ref',
        commandId: 'command-7',
        partyId: HOLDER,
      });
    });
  });

  describe('notices', () => {
    it('shows the session error, declined as info', async () => {
      const t = setup();
      t.provider.answers.connect = async () => Promise.reject(new Error('popup closed'));
      await t.session.connect(t.provider);
      expect(t.store.getSnapshot().notices).toEqual([
        { key: 'session', level: 'error', message: 'The wallet did not connect: popup closed' },
      ]);
      t.provider.answers.connect = async () => Promise.reject(Object.assign(new Error('no'), { code: 4001 }));
      await t.session.connect(t.provider);
      expect(t.store.getSnapshot().notices).toEqual([
        { key: 'session', level: 'info', message: 'You declined to connect in the wallet.' },
      ]);
    });

    it('names the party of an outcome that settled for a wallet that is no longer shown', async () => {
      const t = setup();
      await connectAndLoad(t);
      const ran = t.store.act(ACCEPT);
      await switchAccount(t, OTHER);
      t.call().resolve(SUBMITTED);
      await ran;
      expect(t.store.getSnapshot().notices).toEqual([
        { key: 'outcome', level: 'success', message: `Mint offer accepted (update update-1). (party ${HOLDER})` },
      ]);
    });
  });

  describe('one wallet call at a time', () => {
    it('runs a refresh asked during a load once after it, and stays busy until both answer', async () => {
      const t = setup();
      await connectAndLoad(t);
      t.store.refresh();
      t.store.refresh();
      t.store.refresh();
      expect(t.loads).toHaveLength(1);
      expect(await t.store.act(PLAN)).toBeNull();
      t.answer(10);
      await flush();
      expect(t.loads).toHaveLength(1);
      expect(t.active()).toBe(1);
      expect(t.store.getSnapshot()).toMatchObject({ state: { offset: 10 }, loading: true, busy: true });
      t.answer(20);
      await flush();
      expect(t.loads).toHaveLength(0);
      expect(t.store.getSnapshot()).toMatchObject({ state: { offset: 20 }, loading: false, busy: false });
    });

    it('queues the new wallet’s first load behind the previous wallet’s action, and starts it when that settles', async () => {
      const t = setup();
      await connectAndLoad(t);
      const ran = t.store.act(ACCEPT);
      const other = await switchAccount(t, OTHER);
      expect(t.loads).toHaveLength(0);
      expect(t.store.getSnapshot()).toMatchObject({
        wallet: other,
        state: null,
        loading: true,
        running: { action: ACCEPT },
        busy: true,
      });
      expect(await t.store.act(ACCEPT)).toBeNull();
      t.call().reject(new Error('lost'));
      expect(await ran).toBeNull();
      expect(t.loads.map((load) => load.partyId)).toEqual([OTHER]);
      expect(t.store.getSnapshot()).toMatchObject({ running: null, loading: true, busy: true, unknownOutcome: null });
      t.answer(4);
      await flush();
      expect(t.store.getSnapshot()).toMatchObject({ wallet: other, state: { offset: 4 }, busy: false });
    });

    it('queues the new wallet’s first load behind the previous wallet’s load, and drops that load’s reply', async () => {
      const t = setup();
      await t.session.connect(t.provider);
      await switchAccount(t, OTHER);
      expect(t.loads.map((load) => load.partyId)).toEqual([HOLDER]);
      expect(t.store.getSnapshot()).toMatchObject({ wallet: { partyId: OTHER }, loading: true, busy: true });
      t.fail(new Error('late'));
      await flush();
      expect(t.store.getSnapshot()).toMatchObject({ state: null, loadError: null, loading: true, busy: true });
      expect(t.loads.map((load) => load.partyId)).toEqual([OTHER]);
      t.answer(6);
      await flush();
      expect(t.store.getSnapshot()).toMatchObject({ state: { offset: 6 }, busy: false });
    });

    it('never has two wallet calls in flight across switches, refreshes, actions and reloads', async () => {
      const t = setup();
      let peak = 0;
      const probe = (): void => {
        peak = Math.max(peak, t.active());
      };
      await t.session.connect(t.provider);
      probe();
      t.store.refresh();
      probe();
      await switchAccount(t, OTHER);
      probe();
      while (t.loads.length > 0) {
        t.answer();
        await flush();
        probe();
      }
      const ran = t.store.act(ACCEPT);
      probe();
      t.store.refresh();
      await switchAccount(t, HOLDER);
      probe();
      t.call().resolve(SUBMITTED);
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
      const ran = t.store.act(ACCEPT);
      await switchAccount(t, OTHER);
      const newest = await switchAccount(t, HOLDER);
      t.store.refresh();
      expect(t.loads).toHaveLength(0);
      t.call().resolve(SUBMITTED);
      expect(await ran).toBeNull();
      expect(t.opened.map((wallet) => wallet.partyId)).toEqual([HOLDER, OTHER, HOLDER]);
      expect(t.loads.map((load) => load.partyId)).toEqual([HOLDER]);
      t.answer(8);
      await flush();
      expect(t.store.getSnapshot()).toMatchObject({ wallet: newest, state: { offset: 8 }, busy: false });
    });

    it('drops a queued load when the session ends, and starts nothing after dispose', async () => {
      const t = setup();
      await connectAndLoad(t);
      const ran = t.store.act(ACCEPT);
      await switchAccount(t, OTHER);
      t.session.disconnect();
      expect(t.store.getSnapshot()).toMatchObject({ wallet: null, loading: false, busy: true });
      t.call().resolve(SUBMITTED);
      expect(await ran).toBeNull();
      expect(t.loads).toHaveLength(0);
      expect(t.store.getSnapshot()).toMatchObject({ wallet: null, loading: false, busy: false });

      await connectAndLoad(t, OTHER);
      const second = t.store.act(ACCEPT);
      t.store.refresh();
      t.store.dispose();
      const before = t.published();
      t.call().resolve(SUBMITTED);
      expect(await second).toBeNull();
      await flush();
      expect(t.loads).toHaveLength(0);
      expect(t.published()).toBe(before);
    });
  });

  it('drops a queued load when the session is disposed before the store, and settles busy and loading', async () => {
    const t = setup();
    await connectAndLoad(t);
    const ran = t.store.act(ACCEPT);
    t.store.refresh();
    expect(t.store.getSnapshot()).toMatchObject({ busy: true, loading: true });
    t.session.dispose();
    t.call().resolve(SUBMITTED);
    expect(await ran).toBeNull();
    await flush();
    expect(t.loads).toHaveLength(0);
    expect(t.store.getSnapshot()).toMatchObject({
      running: null,
      busy: false,
      loading: false,
      outcome: { status: 'succeeded', partyId: HOLDER },
    });
  });

  it('drops a load that answers after the session was disposed, and settles loading', async () => {
    const t = setup();
    await connectAndLoad(t);
    const before = t.store.getSnapshot().state;
    t.store.refresh();
    t.session.dispose();
    t.answer(99);
    await flush();
    expect(t.store.getSnapshot().state).toBe(before);
    expect(t.store.getSnapshot()).toMatchObject({ loading: false, busy: false, loadError: null });
  });

  it('ignores a refresh() that a session listener ahead of the store asks for a wallet the session left', async () => {
    const session = createCip103Session({ network: 'devnet' });
    const provider = new TestProvider();
    let store: WalletStore | null = null;
    session.subscribe(() => {
      store?.refresh();
    });
    const loads: string[] = [];
    const openWallet = (options: WalletOptions): Wallet =>
      ({
        loadState: async () => {
          loads.push(options.partyId);
          return snapshot(loads.length);
        },
      }) as unknown as Wallet;
    const internal: WalletStoreInternalOptions = { session, openWallet };
    store = createWalletStore(internal);
    await session.connect(provider);
    await flush();
    expect(loads).toEqual([HOLDER]);
    session.disconnect();
    await flush();
    expect(loads).toEqual([HOLDER]);
    expect(store.getSnapshot()).toMatchObject({ wallet: null, loading: false, busy: false });
    await session.connect(provider);
    await flush();
    provider.setParty(OTHER);
    provider.emit('accountsChanged', [{ partyId: OTHER, primary: true }]);
    await flush();
    expect(loads).toEqual([HOLDER, HOLDER, OTHER]);
    expect(store.getSnapshot()).toMatchObject({ wallet: { partyId: OTHER }, busy: false });
  });

  describe('cancellation', () => {
    const signalOf = (pending: PendingCall, index: number): AbortSignal | undefined =>
      (pending.args[index] as { signal?: AbortSignal } | undefined)?.signal;

    it("passes act()'s signal to the wallet call, combined with the store's own", async () => {
      const t = setup();
      await connectAndLoad(t);
      const caller = new AbortController();
      const ran = t.store.act(ACCEPT, { signal: caller.signal });
      const call = t.call();
      const signal = signalOf(call, 1);
      expect(signal).toBeDefined();
      expect(signal?.aborted).toBe(false);
      caller.abort();
      expect(signal?.aborted).toBe(true);
      call.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      await expect(ran).resolves.toBeNull();
      expect(t.store.getSnapshot().outcome).toMatchObject({ status: 'failed', error: { kind: 'cancelled' } });
      t.store.dispose();
    });

    it('records an action whose signal had already aborted as cancelled, and resolves null', async () => {
      const t = setup();
      await connectAndLoad(t);
      const controller = new AbortController();
      controller.abort();
      const ran = t.store.act(ACCEPT, { signal: controller.signal });
      const call = t.call();
      expect(signalOf(call, 1)?.aborted).toBe(true);
      call.reject(controller.signal.reason);
      await expect(ran).resolves.toBeNull();
      t.store.dispose();
    });

    it('dispose() aborts the action and the load in flight', async () => {
      const t = setup();
      await connectAndLoad(t);
      const ran = t.store.act(ACCEPT);
      const call = t.call();
      const actionSignal = signalOf(call, 1);
      expect(actionSignal?.aborted).toBe(false);
      t.store.dispose();
      expect(actionSignal?.aborted).toBe(true);
      call.resolve(SUBMITTED);
      await ran;
    });

    it('dispose() aborts the signal a load in flight was given', async () => {
      const t = setup();
      await t.session.connect(t.provider);
      await flush();
      const load = t.loads[0];
      expect(load).toBeDefined();
      const signal = signalOf(load as PendingCall, 0);
      expect(signal?.aborted).toBe(false);
      t.store.dispose();
      expect(signal?.aborted).toBe(true);
    });
  });

  it('stops publishing after dispose and drops pending replies', async () => {
    const t = setup();
    await t.session.connect(t.provider);
    const before = t.published();
    const view = t.store.getSnapshot();
    t.store.dispose();
    t.answer();
    await flush();
    t.session.disconnect();
    t.store.acknowledgeUnknownOutcome();
    expect(t.published()).toBe(before);
    expect(t.store.getSnapshot()).toBe(view);
    expect(await t.store.act(ACCEPT)).toBeNull();
  });
});

describe('actionState', () => {
  const READ: WalletAction = {
    type: 'planTransfer',
    request: { receiver: OTHER, instrumentId: { admin: REGISTRAR, id: 'X' }, amount: '1' },
  };
  const WRITE: WalletAction = { type: 'acceptMintOffer', mintOfferCid: 'mint-1' };
  const wallet = { partyId: HOLDER } as ConnectedWallet;
  const view = (overrides: Partial<WalletView>): WalletView => ({
    session: { status: 'connected', wallet },
    wallet,
    ready: true,
    state: null,
    loading: false,
    loadError: null,
    running: null,
    busy: false,
    busyReason: null,
    busyLabel: null,
    shown: null,
    stale: false,
    readOnly: null,
    outcome: null,
    unknownOutcome: null,
    notices: [],
    ...overrides,
  });

  it('enables what canAct allows, with no reason', () => {
    expect(actionState(view({}), WRITE)).toEqual({ enabled: true, reason: null });
    expect(canAct(view({}), WRITE)).toBe(true);
  });

  it('gives the first reason, in order', () => {
    expect(actionState(null, WRITE)).toEqual({ enabled: false, reason: 'disconnected' });
    expect(
      actionState(view({ session: { status: 'disconnected', error: null }, wallet: null, ready: false }), WRITE)
    ).toEqual({
      enabled: false,
      reason: 'disconnected',
    });
    expect(actionState(view({ session: { status: 'connecting' }, busy: true }), WRITE).reason).toBe('reconnecting');
    expect(actionState(view({ ready: false, busy: true }), WRITE).reason).toBe('not-ready');
    expect(actionState(view({ busy: true }), WRITE).reason).toBe('busy');
    const unknownOutcome = { action: WRITE, key: walletActionKey(WRITE), partyId: HOLDER, message: 'unknown' };
    expect(actionState(view({ unknownOutcome }), WRITE)).toEqual({ enabled: false, reason: 'unknown-outcome' });
    // A read still runs while a write's outcome is unknown.
    expect(actionState(view({ unknownOutcome }), READ)).toEqual({ enabled: true, reason: null });
  });
});

describe('createWalletStore: shared latch, read-only gate and held snapshots', () => {
  it('names why it is busy: a load, its own action, or another writer run', async () => {
    const latch = createWriteLatch();
    const t = setup({ latch });
    await t.session.connect(t.provider);
    expect(t.store.getSnapshot()).toMatchObject({ busy: true, busyReason: 'load', busyLabel: null });
    t.answer();
    await flush();
    expect(t.store.getSnapshot()).toMatchObject({ busy: false, busyReason: null, busyLabel: null });

    const acting = t.store.act(ACCEPT);
    expect(t.store.getSnapshot()).toMatchObject({ busy: true, busyReason: 'action', busyLabel: 'acceptMintOffer' });
    expect(latch.getSnapshot().holder?.label).toBe('acceptMintOffer');
    t.call().resolve(SUBMITTED);
    await acting;
    expect(latch.getSnapshot().holder).toBeNull();
    expect(t.store.getSnapshot()).toMatchObject({ busy: true, busyReason: 'load' });
    t.answer();
    await flush();

    const send = deferred<string>();
    const running = latch.run('canton-coin', async () => send.promise);
    expect(t.store.getSnapshot()).toMatchObject({ busy: true, busyReason: 'run', busyLabel: 'canton-coin' });
    expect(canAct(t.store.getSnapshot(), ACCEPT)).toBe(false);
    expect(actionState(t.store.getSnapshot(), ACCEPT).reason).toBe('busy');
    send.resolve('sent');
    await running;
    expect(t.store.getSnapshot()).toMatchObject({ busy: false, busyReason: null });
  });

  it('refuses act() while a run holds the latch, and run() while an action is in flight', async () => {
    const t = setup();
    await connectAndLoad(t);
    const send = deferred<string>();
    const running = t.store.run('canton-coin', async () => send.promise);
    expect(await t.store.act(ACCEPT)).toBeNull();
    expect(t.calls).toHaveLength(0);
    send.resolve('sent');
    expect(await running).toEqual({ status: 'done', value: 'sent' });

    const acting = t.store.act(ACCEPT);
    const refused = await t.store.run('canton-coin', async () => 'never');
    expect(refused).toMatchObject({ status: 'refused', reason: 'busy', holder: { label: 'acceptMintOffer' } });
    t.call().resolve(SUBMITTED);
    expect(await acting).toEqual(SUBMITTED);
  });

  it("aborts a run's signal when the wallet changes and on dispose, reporting dropped or unknown-outcome", async () => {
    const t = setup();
    await connectAndLoad(t);
    let context: WriteRunContext | null = null;
    const reply = deferred<string>();
    const running = t.store.run('canton-coin', async (ctx) => {
      context = ctx;
      return reply.promise;
    });
    const started = context as unknown as WriteRunContext;
    expect(started.signal.aborted).toBe(false);
    expect(started.isCurrent()).toBe(true);
    await switchAccount(t, OTHER);
    expect(started.signal.aborted).toBe(true);
    expect(started.isCurrent()).toBe(false);
    reply.resolve('late');
    expect(await running).toEqual({ status: 'dropped' });

    t.answer();
    await flush();
    const submitted = deferred<string>();
    const second = t.store.run('canton-coin', async (ctx) => {
      context = ctx;
      ctx.markSubmitted();
      return submitted.promise;
    });
    const secondContext = context as unknown as WriteRunContext;
    t.store.dispose();
    expect(secondContext.signal.aborted).toBe(true);
    expect(secondContext.isCurrent()).toBe(false);
    submitted.resolve('late');
    // The private latch survives the store: the run settled in its epoch, but the store reports it is gone.
    expect((await second).status).toBe('done');
    expect(await t.store.run('x', async () => 1)).toEqual({ status: 'refused', reason: 'disposed' });
  });

  it('refuses run() as a write act() is refused: read-only, and while an unknown outcome is unchecked', async () => {
    const t = setup({ readOnly: 'production' });
    await connectAndLoad(t);
    let ran = false;
    const write = async (): Promise<number> => {
      ran = true;
      return 1;
    };
    expect(await t.store.run('canton-coin', write)).toEqual({ status: 'refused', reason: 'read-only' });
    t.store.setReadOnly(null);
    const acting = t.store.act(ACCEPT);
    t.call().reject(
      new WalletSubmitError('unknown', 'The wallet did not confirm the transaction.', { commandId: 'c' })
    );
    expect(await acting).toBeNull();
    expect(t.store.getSnapshot().unknownOutcome).not.toBeNull();
    t.answer();
    await flush();
    expect(await t.store.run('canton-coin', write)).toEqual({ status: 'refused', reason: 'unknown-outcome' });
    expect(ran).toBe(false);
    t.store.acknowledgeUnknownOutcome();
    expect(await t.store.run('canton-coin', write)).toEqual({ status: 'done', value: 1 });
  });

  it('never applies a snapshot a load read before a run, and loads again once the run ends', async () => {
    const t = setup();
    await t.session.connect(t.provider);
    expect(t.loads).toHaveLength(1);
    const send = deferred<string>();
    const running = t.store.run('canton-coin', async () => send.promise);
    // The load read the ledger before the write: its reply is dropped.
    t.answer(1);
    await flush();
    expect(t.store.getSnapshot().state).toBeNull();
    expect(t.store.getSnapshot().busy).toBe(true);
    // A refresh meanwhile waits for the run.
    t.store.refresh();
    await flush();
    expect(t.loads).toHaveLength(0);
    send.resolve('sent');
    expect(await running).toEqual({ status: 'done', value: 'sent' });
    await flush();
    expect(t.loads).toHaveLength(1);
    t.answer(2);
    await flush();
    expect(t.store.getSnapshot().state?.offset).toBe(2);
  });

  it('refuses writes while read-only and still runs reads; setReadOnly opens it again', async () => {
    const t = setup({ readOnly: 'production' });
    await connectAndLoad(t);
    const view = t.store.getSnapshot();
    expect(view.readOnly).toBe('production');
    expect(canAct(view, ACCEPT)).toBe(false);
    expect(actionState(view, ACCEPT)).toEqual({ enabled: false, reason: 'read-only' });
    expect(canAct(view, PLAN)).toBe(true);
    expect(await t.store.act(ACCEPT)).toBeNull();
    expect(t.calls).toHaveLength(0);
    const planning = t.store.act(PLAN);
    expect(t.calls).toHaveLength(1);
    t.call().resolve(fakePlan().plan);
    expect(await planning).not.toBeNull();

    const before = t.published();
    t.store.setReadOnly('production');
    expect(t.published()).toBe(before);
    t.store.setReadOnly(null);
    expect(t.published()).toBe(before + 1);
    expect(t.store.getSnapshot().readOnly).toBeNull();
    expect(canAct(t.store.getSnapshot(), ACCEPT)).toBe(true);
  });

  it('shows the live state and holds it for its key while the same key reloads after a reconnect', async () => {
    const t = setup({ retainKey: () => 'privy:party', connectingRetainKey: () => 'privy:party' });
    await connectAndLoad(t);
    const first = t.store.getSnapshot();
    expect(first).toMatchObject({ shown: first.state, stale: false });
    expect(first.shown).not.toBeNull();

    // A rebuilt provider for the same party: the session reconnects (no wallet for a moment), then loads again.
    const rebuilt = new TestProvider(HOLDER);
    const connecting = t.session.connect(rebuilt);
    expect(t.store.getSnapshot()).toMatchObject({ state: null, shown: first.state, stale: true });
    await connecting;
    expect(t.store.getSnapshot()).toMatchObject({ state: null, loading: true, shown: first.state, stale: true });
    t.answer(9);
    await flush();
    expect(t.store.getSnapshot()).toMatchObject({ state: { offset: 9 }, shown: { offset: 9 }, stale: false });
  });

  it('shows nothing for a new key, or once a load ended with no state', async () => {
    const t = setup();
    await connectAndLoad(t);
    const held = t.store.getSnapshot().state;
    // The default key is the wallet's own: another connection shows nothing until it loads.
    const connecting = t.session.connect(new TestProvider(HOLDER));
    expect(t.store.getSnapshot()).toMatchObject({ shown: null, stale: false });
    await connecting;
    expect(t.store.getSnapshot()).toMatchObject({ loading: true, shown: null, stale: false });
    t.fail(new WalletReadError('down'));
    await flush();
    expect(t.store.getSnapshot()).toMatchObject({ state: null, shown: null, stale: false });
    expect(held).not.toBeNull();

    // The same key, a failed reload: nothing is shown once it ended.
    const same = setup({ retainKey: () => 'k' });
    await connectAndLoad(same);
    same.store.refresh();
    same.fail(new WalletReadError('down'));
    await flush();
    expect(same.store.getSnapshot()).toMatchObject({ state: null, loading: false, shown: null, stale: false });
  });

  it("never shows one party's snapshot as another's across an accountsChanged switch", async () => {
    for (const retainKey of [undefined, (wallet: ConnectedWallet) => `privy:${wallet.partyId}`]) {
      const t = setup(retainKey === undefined ? {} : { retainKey });
      await connectAndLoad(t);
      expect(t.store.getSnapshot().state).not.toBeNull();
      const views: WalletView[] = [];
      t.store.subscribe(() => views.push(t.store.getSnapshot()));
      await switchAccount(t, OTHER);
      // Every view published for the new party carries none of the old party's state or outcome.
      const forOther = views.filter((seen) => seen.wallet?.partyId === OTHER);
      expect(forOther.length).toBeGreaterThan(0);
      for (const seen of forOther) {
        expect(seen).toMatchObject({ state: null, shown: null, stale: false, outcome: null });
      }
      expect(t.store.getSnapshot()).toMatchObject({ wallet: { partyId: OTHER }, loading: true, shown: null });
      t.answer(5);
      await flush();
      expect(t.store.getSnapshot()).toMatchObject({ shown: { offset: 5 }, stale: false });
    }
  });

  it('holds a snapshot while connecting only for a connection with the same retain key', async () => {
    let connectingTo: string | null = null;
    const t = setup({ retainKey: () => 'privy:party', connectingRetainKey: () => connectingTo });
    await connectAndLoad(t);
    expect(t.store.getSnapshot().state).not.toBeNull();

    // Another connection (another wallet or party): nothing is held while it signs in.
    connectingTo = 'privy:other';
    const other = t.session.connect(new TestProvider(OTHER));
    expect(t.store.getSnapshot()).toMatchObject({ state: null, shown: null, stale: false });
    await other;
    t.answer();
    await flush();

    // A connection the store is told nothing about: nothing is held either.
    connectingTo = null;
    const unnamed = t.session.connect(new TestProvider(HOLDER));
    expect(t.store.getSnapshot()).toMatchObject({ shown: null, stale: false });
    await unnamed;
    t.answer();
    await flush();

    // Without `connectingRetainKey`, nothing is held while connecting.
    const plain = setup({ retainKey: () => 'privy:party' });
    await connectAndLoad(plain);
    const connecting = plain.session.connect(new TestProvider(HOLDER));
    expect(plain.store.getSnapshot()).toMatchObject({ shown: null, stale: false });
    await connecting;
  });

  it('drops a held snapshot on disconnect', async () => {
    const t = setup({ retainKey: () => 'k' });
    await connectAndLoad(t);
    t.session.disconnect();
    await flush();
    const connecting = t.session.connect(t.provider);
    expect(t.store.getSnapshot()).toMatchObject({ shown: null, stale: false });
    await connecting;
  });
});
