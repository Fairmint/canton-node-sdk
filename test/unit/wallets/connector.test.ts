/**
 * `createWalletConnector`: restoring the remembered wallet (ported from apiv2's `runRestore` tests, each retired run
 * now a disposed connector or a superseding call), remembering and selecting, loaded and live options, the shared
 * latch, and dispose. Also ported: apiv2's wallet-options tests and the connect cases of its page model.
 */
import {
  createWalletConnector,
  createWriteLatch,
  DEFAULT_RESTORE_TIMEOUT_MS,
  loopWalletOption,
  type Cip103Provider,
  type Cip103Request,
  type LiveWalletOption,
  type LoadedWalletOption,
  type StorageLike,
  type WalletConnector,
  type WalletAvailability,
  type WalletConnectorInput,
  type Wallet,
  type WalletOption,
  type WalletOptions,
  type WalletState,
} from '../../../src/wallets';
import { fakeFetch, RpcError } from './helpers';
import { deferred, flush, TestProvider } from './session-helpers';

type Deferred<T> = ReturnType<typeof deferred<T>>;

type DeferredMethod = 'isConnected' | 'getPrimaryAccount' | 'connect';

/**
 * A CIP-0103 provider whose `isConnected`, `getPrimaryAccount` and `connect` answers wait on the test; every other
 * request (a `disconnect`, a ledger read) answers at once. Every request method is recorded.
 */
function fakeProvider(name: string): {
  provider: Cip103Provider;
  requests: string[];
  pendingCount: (method: DeferredMethod) => number;
  answer: (method: DeferredMethod, which?: 'newest' | 'oldest') => void;
  answerAll: () => void;
} {
  const requests: string[] = [];
  const pending: Record<DeferredMethod, Array<Deferred<unknown>>> = {
    isConnected: [],
    getPrimaryAccount: [],
    connect: [],
  };
  const provider: Cip103Provider = {
    async request(args: Cip103Request): Promise<unknown> {
      requests.push(args.method);
      if (args.method === 'isConnected' || args.method === 'getPrimaryAccount' || args.method === 'connect') {
        const answer = deferred<unknown>();
        pending[args.method].push(answer);
        return answer.promise;
      }
      return null;
    },
    on: () => undefined,
    removeListener: () => undefined,
  };
  const answers: Record<DeferredMethod, unknown> = {
    isConnected: { isConnected: true },
    getPrimaryAccount: { primary: true, partyId: `${name}::1220abc` },
    connect: { isConnected: true },
  };
  const answer = (method: DeferredMethod, which: 'newest' | 'oldest' = 'newest'): void => {
    const next = which === 'newest' ? pending[method].pop() : pending[method].shift();
    if (next === undefined) throw new Error(`no ${method} request is pending`);
    next.resolve(answers[method]);
  };
  return {
    provider,
    requests,
    pendingCount: (method) => pending[method].length,
    /** Answer the newest pending `method` request (the run being driven), or the oldest (a late answer). */
    answer,
    /** Answer every pending request, oldest first. */
    answerAll() {
      for (const method of ['isConnected', 'getPrimaryAccount', 'connect'] as const) {
        while (pending[method].length > 0) answer(method, 'oldest');
      }
    },
  };
}

type FakeProvider = ReturnType<typeof fakeProvider>;

/** A storage in memory, with the key/value pairs it holds. */
function memoryStorage(initial: Record<string, string> = {}): StorageLike & { readonly items: Map<string, string> } {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

const KEY = 'extension:fake';
const WALLET = 'test.wallet';
const SELECTED = 'test.selected';
const TIMEOUT_MS = 15_000;
const AVAILABLE = { available: true } as const;

/** No network calls: a registry that answers 503, and no Canton Coin. */
const OFFLINE_STORE: NonNullable<WalletConnectorInput['store']> = {
  registry: { baseUrl: 'https://registry.example', fetch: fakeFetch(() => ({ status: 503, text: 'down' })).fetch },
  cantonCoin: false,
};

function connector(
  input: Partial<WalletConnectorInput> & { local?: StorageLike | null; tab?: StorageLike | null }
): WalletConnector {
  const { local = null, tab = null, ...rest } = input;
  return createWalletConnector({
    network: 'devnet',
    options: [],
    storageKey: 'test',
    storage: { local, session: tab },
    restoreTimeoutMs: TIMEOUT_MS,
    store: OFFLINE_STORE,
    ...rest,
  });
}

/** A loaded option whose loads wait on the test. */
function loadedOption(
  key: string,
  loads: Array<Deferred<Cip103Provider>> = []
): LoadedWalletOption & { loads: Array<Deferred<Cip103Provider>> } {
  return {
    mode: 'load',
    key,
    kind: 'extension',
    name: key,
    availability: () => AVAILABLE,
    loads,
    load: async () => {
      const load = deferred<Cip103Provider>();
      loads.push(load);
      return load.promise;
    },
  };
}

/** A loaded option that answers at once with `provider`. */
function readyOption(key: string, provider: Cip103Provider): LoadedWalletOption {
  return { mode: 'load', key, kind: 'extension', name: key, availability: () => AVAILABLE, load: async () => provider };
}

/** A live option (Privy-shaped) whose provider the test sets. */
function liveOption(key = 'privy'): {
  option: LiveWalletOption;
  offer: (provider: Cip103Provider | null, retainKey?: string | null) => void;
  restores: () => number;
  subscribers: () => number;
} {
  let provider: Cip103Provider | null = null;
  let retainKey: string | null = null;
  let restores = 0;
  const listeners = new Set<() => void>();
  return {
    option: {
      mode: 'live',
      key,
      kind: 'privy',
      name: 'Privy',
      availability: () => AVAILABLE,
      live: {
        subscribe: (listener) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        getProvider: () => provider,
        getRetainKey: () => retainKey,
        restore: () => {
          restores += 1;
        },
      },
    },
    offer(next, nextRetainKey = null) {
      provider = next;
      retainKey = nextRetainKey;
      for (const listener of [...listeners]) listener();
    },
    restores: () => restores,
    subscribers: () => listeners.size,
  };
}

function connectedProvider(c: WalletConnector): Cip103Provider | null {
  const state = c.session?.getSnapshot();
  return state?.status === 'connected' ? state.wallet.provider : null;
}

/** Count every publish of a `connected` state. */
function countConnects(c: WalletConnector): () => number {
  let connects = 0;
  const { session } = c;
  if (session === null) throw new Error('no session');
  let last = session.getSnapshot();
  session.subscribe(() => {
    const next = session.getSnapshot();
    if (next !== last && next.status === 'connected') connects += 1;
    last = next;
  });
  return () => connects;
}

afterEach(() => {
  jest.useRealTimers();
});

// ----- restore (apiv2's runRestore cases) -----

/** One connector restoring the remembered extension wallet, with its discovery and load answers held. */
interface DrivenRun {
  readonly connector: WalletConnector;
  readonly option: LoadedWalletOption;
  readonly discovered: Deferred<readonly WalletOption[]>;
  readonly loaded: Deferred<Cip103Provider>;
}

/** A page mounting: a connector whose remembered wallet is found by discovery (`resolve`), then loaded. */
function start(storage: StorageLike, extra: Partial<WalletConnectorInput> = {}): DrivenRun {
  const discovered = deferred<readonly WalletOption[]>();
  const loaded = deferred<Cip103Provider>();
  const option: LoadedWalletOption = {
    mode: 'load',
    key: KEY,
    kind: 'extension',
    name: 'Fake',
    availability: () => AVAILABLE,
    load: async () => loaded.promise,
  };
  const c = connector({ local: storage, discover: async () => discovered.promise, ...extra });
  return { connector: c, option, discovered, loaded };
}

type Stage = 'resolve' | 'load' | 'isConnected' | 'getPrimaryAccount';
const STAGES: readonly Stage[] = ['resolve', 'load', 'isConnected', 'getPrimaryAccount'];

/** Drive `run` from its start until it waits at `stage`. */
async function advanceTo(run: DrivenRun, fake: FakeProvider, stage: Stage): Promise<void> {
  await flush();
  if (stage === 'resolve') return;
  run.discovered.resolve([run.option]);
  await flush();
  if (stage === 'load') return;
  run.loaded.resolve(fake.provider);
  await flush();
  if (stage === 'isConnected') return;
  fake.answer('isConnected');
  await flush();
}

/** Finish a run waiting at `stage`. */
async function complete(run: DrivenRun, fake: FakeProvider, from: Stage): Promise<void> {
  const order = STAGES.indexOf(from);
  if (order <= 0) {
    run.discovered.resolve([run.option]);
    await flush();
  }
  if (order <= 1) {
    run.loaded.resolve(fake.provider);
    await flush();
  }
  if (order <= 2) {
    fake.answer('isConnected');
    await flush();
  }
  fake.answer('getPrimaryAccount');
  await flush();
}

/** The late answer for a retired run waiting at `stage`, and nothing else (another run may be waiting too). */
async function answerLateOnly(run: DrivenRun, fake: FakeProvider, stage: Stage): Promise<void> {
  if (stage === 'resolve') run.discovered.resolve([run.option]);
  else if (stage === 'load') run.loaded.resolve(fake.provider);
  else fake.answer(stage, 'oldest');
  await flush();
}

describe('createWalletConnector: restore', () => {
  it('restores the remembered wallet silently, showing restoring until it connects', async () => {
    const fake = fakeProvider('p');
    const storage = memoryStorage({ [WALLET]: KEY });
    const run = start(storage);
    expect(run.connector.getSnapshot()).toMatchObject({ status: 'restoring', target: null, discovering: true });
    await advanceTo(run, fake, 'isConnected');
    expect(run.connector.getSnapshot()).toMatchObject({ status: 'restoring', target: { key: KEY, name: 'Fake' } });
    await complete(run, fake, 'isConnected');
    const snapshot = run.connector.getSnapshot();
    expect(snapshot).toMatchObject({ status: 'connected', target: { key: KEY }, error: null, stale: false });
    expect(snapshot.connection?.wallet.provider).toBe(fake.provider);
    expect(snapshot.connection?.key).toBe(snapshot.connection?.wallet.key);
    expect(snapshot.connection?.option).toEqual({ key: KEY, kind: 'extension', name: 'Fake' });
    expect(fake.requests).not.toContain('connect');
  });

  it('never connects for a run retired in isConnected after the next run is retired while resolving', async () => {
    const fake = fakeProvider('p');
    const storage = memoryStorage({ [WALLET]: KEY });
    const a = start(storage);
    const aConnects = countConnects(a.connector);
    await advanceTo(a, fake, 'isConnected');
    a.connector.dispose();
    const b = start(storage);
    const bConnects = countConnects(b.connector);
    await advanceTo(b, fake, 'resolve');
    b.connector.dispose();
    fake.answer('isConnected', 'oldest');
    await flush();
    expect(fake.pendingCount('getPrimaryAccount')).toBe(0);
    fake.answerAll();
    await flush();
    expect(aConnects() + bConnects()).toBe(0);
    expect(fake.requests).not.toContain('disconnect');
    expect(storage.getItem(WALLET)).toBe(KEY);
  });

  for (const stage of STAGES) {
    for (const timing of ['before', 'after'] as const) {
      it(`lets the next connector connect after a switch away and back at ${stage} (late answer ${timing} its restore)`, async () => {
        const fake = fakeProvider('p');
        const storage = memoryStorage({ [WALLET]: KEY });
        const a = start(storage);
        await advanceTo(a, fake, stage);
        a.connector.dispose();
        const b = start(storage);
        if (timing === 'before') {
          await flush();
          await answerLateOnly(a, fake, stage);
          await advanceTo(b, fake, 'isConnected');
        } else {
          await advanceTo(b, fake, 'isConnected');
          await answerLateOnly(a, fake, stage);
        }
        await complete(b, fake, 'isConnected');
        expect(connectedProvider(b.connector)).toBe(fake.provider);
        expect(b.connector.getSnapshot().status).toBe('connected');
        expect(connectedProvider(a.connector)).toBeNull();
        expect(fake.requests).not.toContain('disconnect');
      });
    }
  }

  it('connects only the live connector after many retirements', async () => {
    const fake = fakeProvider('p');
    const storage = memoryStorage({ [WALLET]: KEY });
    const counts: Array<() => number> = [];
    const mount = (): DrivenRun => {
      const run = start(storage);
      counts.push(countConnects(run.connector));
      return run;
    };
    const a = mount();
    await advanceTo(a, fake, 'load');
    a.connector.dispose();
    const b = mount();
    await advanceTo(b, fake, 'isConnected');
    b.connector.dispose();
    const c = mount();
    await advanceTo(c, fake, 'getPrimaryAccount');
    c.connector.dispose();
    const d = mount();
    await advanceTo(d, fake, 'isConnected');
    // The retired runs' answers arrive while D waits on the wallet.
    a.loaded.resolve(fake.provider);
    fake.answer('isConnected', 'oldest'); // B's
    fake.answer('getPrimaryAccount', 'oldest'); // C's
    await flush();
    await complete(d, fake, 'isConnected');
    fake.answerAll();
    await flush();
    expect(counts.reduce((sum, count) => sum + count(), 0)).toBe(1);
    expect(connectedProvider(d.connector)).toBe(fake.provider);
    expect(fake.requests).not.toContain('disconnect');
  });

  it('connects nothing when the last connector is retired too', async () => {
    const fake = fakeProvider('p');
    const storage = memoryStorage({ [WALLET]: KEY });
    const runs: DrivenRun[] = [];
    const counts: Array<() => number> = [];
    for (const stage of ['resolve', 'isConnected', 'getPrimaryAccount'] as const) {
      const run = start(storage);
      runs.push(run);
      counts.push(countConnects(run.connector));
      await advanceTo(run, fake, stage);
      run.connector.dispose();
    }
    runs[0]?.discovered.resolve([runs[0].option]);
    await flush();
    fake.answerAll();
    await flush();
    expect(counts.reduce((sum, count) => sum + count(), 0)).toBe(0);
    expect(fake.requests).not.toContain('disconnect');
  });

  it("restores once under Strict Mode's double effect", async () => {
    const fake = fakeProvider('p');
    const storage = memoryStorage({ [WALLET]: KEY });
    const first = start(storage);
    first.connector.dispose();
    const second = start(storage);
    first.discovered.resolve([first.option]);
    first.loaded.resolve(fake.provider);
    await complete(second, fake, 'resolve');
    expect(fake.requests.filter((method) => method === 'isConnected')).toHaveLength(1);
    expect(connectedProvider(second.connector)).toBe(fake.provider);
    expect(second.connector.getSnapshot().status).toBe('connected');
  });

  for (const via of ['extension', 'privy'] as const) {
    for (const order of ['answer first', 'timeout first'] as const) {
      it(`keeps a ${via} connect the user made during a restore (${order})`, async () => {
        jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask', 'nextTick'] });
        const fake = fakeProvider('p');
        const user = fakeProvider(via);
        const privy = liveOption();
        const userKey = via === 'privy' ? 'privy' : 'extension:user';
        const storage = memoryStorage({ [WALLET]: KEY });
        const run = start(storage, {
          options: via === 'privy' ? [privy.option] : [readyOption('extension:user', user.provider)],
        });
        await advanceTo(run, fake, 'isConnected');
        if (via === 'privy') privy.offer(user.provider, `${via}::1220abc`);
        const connecting = run.connector.connect(userKey);
        await flush();
        user.answer('connect');
        await flush();
        user.answer('getPrimaryAccount');
        expect(await connecting).toEqual({ status: 'connected' });
        expect(connectedProvider(run.connector)).toBe(user.provider);
        if (order === 'answer first') {
          fake.answer('isConnected');
          await flush();
          jest.advanceTimersByTime(TIMEOUT_MS);
        } else {
          jest.advanceTimersByTime(TIMEOUT_MS);
          fake.answer('isConnected');
        }
        fake.answerAll();
        await flush();
        expect(connectedProvider(run.connector)).toBe(user.provider);
        expect(run.connector.getSnapshot()).toMatchObject({ status: 'connected', target: { key: userKey } });
        expect(user.requests).not.toContain('disconnect');
        expect(fake.requests).not.toContain('disconnect');
        expect(storage.getItem(WALLET)).toBe(userKey);
      });
    }
  }

  it('forgets the wallet on Cancel and restores it again once remembered', async () => {
    const fake = fakeProvider('p');
    const storage = memoryStorage({ [WALLET]: KEY });
    const a = start(storage);
    await advanceTo(a, fake, 'isConnected');
    expect(a.connector.getSnapshot().status).toBe('restoring');
    a.connector.cancel();
    expect(a.connector.getSnapshot()).toMatchObject({ status: 'disconnected', target: null, error: null });
    fake.answer('isConnected');
    fake.answerAll();
    await flush();
    expect(a.connector.session?.getSnapshot().status).toBe('disconnected');
    expect(fake.requests).not.toContain('disconnect');
    expect(storage.getItem(WALLET)).toBeNull();

    storage.setItem(WALLET, KEY);
    const b = start(storage);
    await complete(b, fake, 'resolve');
    expect(connectedProvider(b.connector)).toBe(fake.provider);
  });

  it('forgets the wallet on a timeout in getPrimaryAccount and restores it again once remembered', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask', 'nextTick'] });
    const fake = fakeProvider('p');
    const storage = memoryStorage({ [WALLET]: KEY });
    const a = start(storage);
    await advanceTo(a, fake, 'getPrimaryAccount');
    jest.advanceTimersByTime(TIMEOUT_MS);
    expect(a.connector.getSnapshot().status).toBe('disconnected');
    fake.answer('getPrimaryAccount');
    await flush();
    expect(a.connector.session?.getSnapshot().status).toBe('disconnected');
    expect(fake.requests).not.toContain('disconnect');
    expect(storage.getItem(WALLET)).toBeNull();

    storage.setItem(WALLET, KEY);
    const b = start(storage);
    await complete(b, fake, 'resolve');
    expect(connectedProvider(b.connector)).toBe(fake.provider);
  });

  it('keeps the wallet remembered when the user picked another before the timeout', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask', 'nextTick'] });
    const fake = fakeProvider('p');
    const storage = memoryStorage({ [WALLET]: KEY });
    const a = start(storage);
    await advanceTo(a, fake, 'getPrimaryAccount');
    storage.setItem(WALLET, 'loop');
    jest.advanceTimersByTime(TIMEOUT_MS);
    expect(storage.getItem(WALLET)).toBe('loop');
  });

  for (const failure of ['no remembered option', 'load throws'] as const) {
    it(`ends the restore with no wallet request and no error when ${failure}`, async () => {
      const fake = fakeProvider('p');
      const storage = memoryStorage({ [WALLET]: KEY });
      const a = start(storage);
      const { session } = a.connector;
      session?.fail(new Error('earlier failure'));
      const failed = session?.getSnapshot();
      expect(a.connector.getSnapshot().status).toBe('restoring');
      await flush();
      if (failure === 'no remembered option') {
        a.discovered.resolve([]);
      } else {
        a.discovered.resolve([a.option]);
        await flush();
        a.loaded.reject(new Error('extension gone'));
      }
      await flush();
      expect(a.connector.getSnapshot()).toMatchObject({ status: 'disconnected', error: null });
      expect(fake.requests).toEqual([]);
      // A wallet that is not installed now may be on the next visit.
      expect(storage.getItem(WALLET)).toBe(KEY);
      // Nothing is in flight: cancel touches nothing.
      a.connector.cancel();
      expect(session?.getSnapshot()).toBe(failed);
    });
  }

  it('keeps a shown session error when a restore is cancelled while loading', async () => {
    const fake = fakeProvider('p');
    const a = start(memoryStorage({ [WALLET]: KEY }));
    a.connector.session?.fail(new Error('earlier failure'));
    const failed = a.connector.session?.getSnapshot();
    await advanceTo(a, fake, 'load');
    a.connector.cancel();
    expect(a.connector.session?.getSnapshot()).toBe(failed);
  });

  it("cancels the user's sign-in and retires the restore from the connecting Cancel", async () => {
    const fake = fakeProvider('p');
    const user = fakeProvider('user');
    const storage = memoryStorage({ [WALLET]: KEY });
    const a = start(storage, { options: [readyOption('extension:user', user.provider)] });
    await advanceTo(a, fake, 'isConnected');
    const release = a.connector.preload();
    await flush();
    const connecting = a.connector.connect('extension:user');
    expect(a.connector.getSnapshot()).toMatchObject({ status: 'connecting', target: { key: 'extension:user' } });
    a.connector.cancel();
    expect(a.connector.getSnapshot()).toMatchObject({ status: 'disconnected', target: null });
    expect(a.connector.session?.getSnapshot().status).toBe('disconnected');
    expect(await connecting).toEqual({ status: 'cancelled' });
    user.answerAll();
    fake.answerAll();
    await flush();
    expect(a.connector.session?.getSnapshot().status).toBe('disconnected');
    // The CIP-0103 disconnect ends the wallet's own sign-in window.
    expect(user.requests).toContain('disconnect');
    release();
  });

  it('keeps a restore that completed, and skips Loop set up for another network in this page load', async () => {
    const fake = fakeProvider('p');
    const a = start(memoryStorage({ [WALLET]: KEY }));
    await complete(a, fake, 'resolve');
    a.connector.cancel();
    expect(a.connector.getSnapshot().status).toBe('connected');

    const loop = loopWalletOption({
      appName: 'App',
      load: async () => ({ init: () => undefined, getCip103Provider: () => new TestProvider() }),
    });
    await loop.load('devnet', new AbortController().signal);
    const mainnet = connector({
      network: 'mainnet',
      options: [loop],
      local: memoryStorage({ [WALLET]: 'loop' }),
    });
    await flush();
    expect(mainnet.getSnapshot()).toMatchObject({ status: 'disconnected' });
    expect(mainnet.getSnapshot().options[0]?.availability).toEqual({
      available: false,
      reason: 'reload-required',
      setUpFor: 'devnet',
    });
    expect(await mainnet.connect('loop')).toEqual({ status: 'refused', reason: 'unavailable' });
    expect(mainnet.getSnapshot().error).toMatchObject({
      code: 'unavailable',
      key: 'loop',
      availability: { reason: 'reload-required' },
    });
  });

  it('bounds a restore to a short wait by default, and refuses an unusable timeout', () => {
    expect(DEFAULT_RESTORE_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
    expect(DEFAULT_RESTORE_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
    expect(() => connector({ restoreTimeoutMs: -1 })).toThrow(RangeError);
    expect(() => connector({ restoreTimeoutMs: Number.POSITIVE_INFINITY })).toThrow(RangeError);
  });
});

// ----- remembered keys (apiv2's wallet-options and parseWalletKey cases) -----

describe('createWalletConnector: remembered and selected wallets', () => {
  it('resolves a remembered extension key through discovery, and nothing for one no longer installed', async () => {
    const provider = new TestProvider();
    const installed = connector({
      local: memoryStorage({ [WALLET]: 'extension:injected' }),
      discover: async () => [readyOption('extension:injected', provider)],
    });
    await flush();
    expect(connectedProvider(installed)).toBe(provider);

    const gone = connector({
      local: memoryStorage({ [WALLET]: 'extension:gone' }),
      discover: async () => [readyOption('extension:injected', provider)],
    });
    await flush();
    expect(gone.getSnapshot()).toMatchObject({ status: 'disconnected', error: null });
    // A key no option has (an old or foreign value) is no restore either.
    const foreign = connector({ local: memoryStorage({ [WALLET]: 'metamask' }) });
    await flush();
    expect(foreign.getSnapshot().status).toBe('disconnected');
  });

  it('opens a remembered live option: selected, preparing, and its own recovery once', () => {
    const privy = liveOption();
    const local = memoryStorage({ [WALLET]: 'privy' });
    const c = connector({ local, options: [privy.option] });
    expect(c.getSnapshot()).toMatchObject({ status: 'preparing', selected: 'privy', target: { key: 'privy' } });
    expect(privy.restores()).toBe(1);
    c.dispose();
    expect(privy.subscribers()).toBe(0);
  });

  it("brings the live option's setup UI back after a redirect in this tab (session flag), without connecting", () => {
    const privy = liveOption();
    const tab = memoryStorage({ [SELECTED]: 'privy' });
    const c = connector({ tab, options: [privy.option] });
    expect(c.getSnapshot()).toMatchObject({ status: 'disconnected', selected: 'privy' });
    expect(privy.restores()).toBe(0);
    // An old or foreign flag value is ignored.
    expect(connector({ tab: memoryStorage({ [SELECTED]: '1' }), options: [privy.option] }).getSnapshot().selected).toBe(
      null
    );
  });

  it('select() writes the flag at once; select(null) closes it and forgets that remembered option', () => {
    const privy = liveOption();
    const local = memoryStorage({ [WALLET]: 'privy' });
    const tab = memoryStorage();
    const c = connector({ local, tab, options: [privy.option, readyOption('loop', new TestProvider())] });
    expect(c.select('loop')).toBe(false);
    expect(c.select('nope')).toBe(false);
    expect(c.select('privy')).toBe(true);
    expect(tab.getItem(SELECTED)).toBe('privy');
    expect(c.select(null)).toBe(true);
    expect(tab.getItem(SELECTED)).toBeNull();
    expect(local.getItem(WALLET)).toBeNull();
    expect(c.getSnapshot()).toMatchObject({ status: 'disconnected', selected: null, target: null });

    // Another option remembered stays.
    local.setItem(WALLET, 'loop');
    c.select('privy');
    c.select(null);
    expect(local.getItem(WALLET)).toBe('loop');
  });

  it('remembers a connect, and disconnect() forgets both keys', async () => {
    const local = memoryStorage();
    const tab = memoryStorage({ [SELECTED]: 'privy' });
    const privy = liveOption();
    const provider = new TestProvider();
    const c = connector({ local, tab, options: [privy.option, readyOption('loop', provider)] });
    expect(await c.connect('loop')).toEqual({ status: 'connected' });
    expect(local.getItem(WALLET)).toBe('loop');
    expect(tab.getItem(SELECTED)).toBeNull();
    c.select('privy');
    c.disconnect();
    expect(local.getItem(WALLET)).toBeNull();
    expect(tab.getItem(SELECTED)).toBeNull();
    expect(c.getSnapshot()).toMatchObject({ status: 'disconnected', connection: null, selected: null });
    expect(provider.requests).toContain('disconnect');
  });

  it('works without storage, and when the storage accessor throws', async () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    const provider = new TestProvider();
    const c = connector({
      local: throwing,
      tab: throwing,
      options: [readyOption('loop', provider), liveOption().option],
    });
    expect(c.getSnapshot().status).toBe('disconnected');
    expect(await c.connect('loop')).toEqual({ status: 'connected' });
    expect(c.select('privy')).toBe(true);
    c.disconnect();
    expect(c.getSnapshot().status).toBe('disconnected');
    // The defaults read the page's storages; outside a browser there are none.
    const defaults = createWalletConnector({ network: 'devnet', options: [], store: OFFLINE_STORE });
    expect(defaults.getSnapshot().status).toBe('disconnected');
    defaults.dispose();
  });
});

// ----- loaded options -----

describe('createWalletConnector: loaded options', () => {
  it("connects a preloaded provider synchronously inside the click (Loop's sign-in window needs it)", async () => {
    const provider = new TestProvider();
    const c = connector({ options: [readyOption('loop', provider)] });
    expect(c.getSnapshot().options[0]).toMatchObject({ key: 'loop', mode: 'load', provider: 'idle', loadError: null });
    const release = c.preload();
    expect(c.getSnapshot().options[0]?.provider).toBe('loading');
    await flush();
    expect(c.getSnapshot().options[0]?.provider).toBe('ready');
    const connecting = c.connect('loop');
    expect(provider.requests).toEqual(['connect']);
    expect(c.getSnapshot()).toMatchObject({ status: 'connecting', target: { key: 'loop' } });
    expect(await connecting).toEqual({ status: 'connected' });
    release();
    expect(c.getSnapshot().options[0]?.provider).toBe('ready');
  });

  it('loads first without a preload; a failed load is load-failed, and the next click tries again', async () => {
    const option = loadedOption('extension:x');
    const c = connector({ options: [option] });
    const first = c.connect('extension:x');
    expect(c.getSnapshot()).toMatchObject({ status: 'connecting', target: { key: 'extension:x' } });
    option.loads[0]?.reject(new Error('not installed'));
    expect(await first).toEqual({ status: 'failed' });
    expect(c.getSnapshot()).toMatchObject({
      status: 'disconnected',
      error: { code: 'load-failed', key: 'extension:x', description: { kind: 'other', message: 'not installed' } },
    });
    expect(c.getSnapshot().options[0]).toMatchObject({ provider: 'failed', loadError: { message: 'not installed' } });
    const provider = new TestProvider();
    const second = c.connect('extension:x');
    expect(c.getSnapshot().error).toBeNull();
    option.loads[1]?.resolve(provider);
    expect(await second).toEqual({ status: 'connected' });
  });

  it("reports a declined connect as connect-failed with the session's own error", async () => {
    const provider = new TestProvider(undefined, {
      connect: () => {
        throw new RpcError(4001, 'User rejected');
      },
    });
    const c = connector({ options: [readyOption('loop', provider)] });
    expect(await c.connect('loop')).toEqual({ status: 'failed' });
    expect(c.getSnapshot().error).toMatchObject({
      code: 'connect-failed',
      key: 'loop',
      description: { kind: 'declined' },
    });
    // A click after a failure is a new attempt.
    provider.answers.connect = () => ({ isConnected: true });
    expect(await c.connect('loop')).toEqual({ status: 'connected' });
    expect(c.getSnapshot().error).toBeNull();
  });

  it('cancels a connect superseded by another connect, a disconnect or dispose', async () => {
    const slow = loadedOption('extension:slow');
    const c = connector({ options: [slow, readyOption('loop', new TestProvider())] });
    const superseded = c.connect('extension:slow');
    expect(await c.connect('loop')).toEqual({ status: 'connected' });
    slow.loads[0]?.resolve(new TestProvider());
    expect(await superseded).toEqual({ status: 'cancelled' });
    expect(c.getSnapshot().target?.key).toBe('loop');

    const disconnected = c.connect('extension:slow');
    c.disconnect();
    slow.loads[1]?.resolve(new TestProvider());
    expect(await disconnected).toEqual({ status: 'cancelled' });

    const disposed = c.connect('extension:slow');
    c.dispose();
    slow.loads[2]?.resolve(new TestProvider());
    expect(await disposed).toEqual({ status: 'cancelled' });
    expect(await c.connect('loop')).toEqual({ status: 'refused', reason: 'disposed' });
  });

  it('reports a connect still loading its provider as connecting while another wallet is connected; cancel() ends it and keeps that wallet', async () => {
    const first = new TestProvider('first::1220abc');
    const slow = loadedOption('extension:slow');
    const c = connector({ options: [readyOption('loop', first), slow] });
    expect(await c.connect('loop')).toEqual({ status: 'connected' });

    const pending = c.connect('extension:slow');
    expect(c.getSnapshot()).toMatchObject({
      status: 'connecting',
      target: { key: 'extension:slow' },
      connection: null,
    });
    c.cancel();
    // The load was stopped (its signal aborted) and the previous wallet, which the connect had not left yet, stays.
    const late = new TestProvider('late::1220abc');
    slow.loads[0]?.resolve(late);
    expect(await pending).toEqual({ status: 'cancelled' });
    await flush();
    expect(late.requests).toEqual([]);
    expect(first.requests).not.toContain('disconnect');
    expect(connectedProvider(c)).toBe(first);
    expect(c.getSnapshot()).toMatchObject({ status: 'connected', target: { key: 'loop' } });
  });

  it('refuses an unknown option, a connect without a DA network, and one while the latch is held', async () => {
    const latch = createWriteLatch();
    const c = connector({ latch, options: [readyOption('loop', new TestProvider())] });
    expect(await c.connect('nope')).toEqual({ status: 'refused', reason: 'unknown-option' });
    const write = deferred<undefined>();
    const running = latch.run('canton-coin', async () => write.promise);
    expect(await c.connect('loop')).toEqual({ status: 'refused', reason: 'busy' });
    expect(c.select(null)).toBe(false);
    write.resolve(undefined);
    await running;

    const staging = connector({
      network: null,
      options: [readyOption('loop', new TestProvider()), liveOption().option],
    });
    expect(staging.session).toBeNull();
    expect(staging.store).toBeNull();
    expect(staging.getSnapshot().options.map((option) => option.availability)).toEqual([
      { available: false, reason: 'unsupported-network' },
      { available: false, reason: 'unsupported-network' },
    ]);
    expect(await staging.connect('loop')).toEqual({ status: 'refused', reason: 'no-network' });
    expect(staging.preload()).toEqual(expect.any(Function));
  });

  it("passes an option's own availability through (not-configured)", async () => {
    const option: LoadedWalletOption = {
      ...readyOption('wallet', new TestProvider()),
      availability: () => ({ available: false, reason: 'not-configured' }),
    };
    const c = connector({ options: [option] });
    expect(c.getSnapshot().options[0]?.availability).toEqual({ available: false, reason: 'not-configured' });
    expect(await c.connect('wallet')).toEqual({ status: 'refused', reason: 'unavailable' });
  });

  it('releases pending preloads, keeps finished ones, and drops the preload of an option that disappears', async () => {
    const slow = loadedOption('extension:slow');
    let found: WalletOption[] = [slow, readyOption('extension:quick', new TestProvider())];
    const c = connector({ discover: async () => found });
    await flush();
    expect(c.getSnapshot().options.map((option) => option.key)).toEqual(['extension:slow', 'extension:quick']);
    const release = c.preload();
    await flush();
    expect(c.getSnapshot().options.map((option) => option.provider)).toEqual(['loading', 'ready']);
    release();
    expect(c.getSnapshot().options.map((option) => option.provider)).toEqual(['idle', 'ready']);
    slow.loads[0]?.resolve(new TestProvider());
    await flush();
    expect(c.getSnapshot().options[0]?.provider).toBe('idle');

    found = [slow];
    await c.rediscover();
    expect(c.getSnapshot()).toMatchObject({ discovering: false, options: [{ key: 'extension:slow' }] });
    found = [slow, readyOption('extension:quick', new TestProvider())];
    await c.rediscover();
    expect(c.getSnapshot().options[1]).toMatchObject({ key: 'extension:quick', provider: 'idle' });
  });

  it('keeps fixed options first and ignores a discovered option with a fixed key', async () => {
    const c = connector({
      options: [readyOption('loop', new TestProvider())],
      discover: async () => [readyOption('loop', new TestProvider()), readyOption('extension:a', new TestProvider())],
    });
    await flush();
    expect(c.getSnapshot().options.map((option) => option.key)).toEqual(['loop', 'extension:a']);
  });
});

// ----- live options (Privy) -----

describe('createWalletConnector: live options', () => {
  const PARTY = 'alice::1220abc';

  it('prepares until the option offers a provider, then connects on its own', async () => {
    const privy = liveOption();
    const c = connector({ options: [privy.option] });
    expect(c.getSnapshot().options[0]).toMatchObject({ key: 'privy', mode: 'live', provider: 'idle' });
    expect(await c.connect('privy')).toEqual({ status: 'preparing' });
    expect(c.getSnapshot()).toMatchObject({ status: 'preparing', target: { key: 'privy' } });
    const provider = new TestProvider(PARTY);
    privy.offer(provider, PARTY);
    expect(c.getSnapshot().status).toBe('connecting');
    await flush();
    const snapshot = c.getSnapshot();
    expect(snapshot).toMatchObject({ status: 'connected', stale: false, options: [{ provider: 'ready' }] });
    expect(snapshot.connection?.key).toBe(`privy:${PARTY}`);
    expect(snapshot.connection?.option).toEqual({ key: 'privy', kind: 'privy', name: 'Privy' });
  });

  it('holds the connection while a rebuilt provider for the same party reconnects (reconnecting, stale)', async () => {
    const privy = liveOption();
    const c = connector({ options: [privy.option] });
    privy.offer(new TestProvider(PARTY), PARTY);
    await c.connect('privy');
    const before = c.getSnapshot().connection;
    const rebuilt = new TestProvider(PARTY);
    privy.offer(rebuilt, PARTY);
    expect(c.getSnapshot()).toMatchObject({ status: 'reconnecting', stale: true });
    expect(c.getSnapshot().connection).toBe(before);
    await flush();
    expect(c.getSnapshot()).toMatchObject({ status: 'connected', stale: false });
    expect(c.getSnapshot().connection?.key).toBe(before?.key);
    expect(c.getSnapshot().connection?.wallet.provider).toBe(rebuilt);

    // Another party is a new connection: connecting, nothing held.
    privy.offer(new TestProvider('bob::1220abc'), 'bob::1220abc');
    expect(c.getSnapshot()).toMatchObject({ status: 'connecting', connection: null, stale: false });
    await flush();
    expect(c.getSnapshot().connection?.key).toBe('privy:bob::1220abc');
  });

  it('leaves the wallet when the option tears its provider down, then prepares', async () => {
    const privy = liveOption();
    const c = connector({ options: [privy.option] });
    const provider = new TestProvider(PARTY);
    privy.offer(provider, PARTY);
    await c.connect('privy');
    privy.offer(null);
    expect(c.getSnapshot()).toMatchObject({ status: 'preparing', connection: null });
    expect(provider.requests).toContain('disconnect');
  });

  it('connects a provider only once until a new connect() asks again (after a cancel or a failure)', async () => {
    const privy = liveOption();
    const c = connector({ options: [privy.option] });
    const provider = fakeProvider('alice');
    privy.offer(provider.provider, PARTY);
    const first = c.connect('privy');
    expect(c.getSnapshot().status).toBe('connecting');
    c.cancel();
    expect(await first).toEqual({ status: 'cancelled' });
    // The same provider published again does not reconnect by itself.
    privy.offer(provider.provider, PARTY);
    expect(c.getSnapshot().status).toBe('preparing');
    expect(provider.requests.filter((method) => method === 'connect')).toHaveLength(1);
    // A new click does.
    const second = c.connect('privy');
    await flush();
    provider.answer('connect');
    await flush();
    provider.answer('getPrimaryAccount');
    expect(await second).toEqual({ status: 'connected' });
  });

  it('defers a reconnect while a write holds the latch, and connects once it is free', async () => {
    const latch = createWriteLatch();
    const privy = liveOption();
    const c = connector({ latch, options: [privy.option] });
    privy.offer(new TestProvider(PARTY), PARTY);
    await c.connect('privy');
    const write = deferred<undefined>();
    const running = latch.run('canton-coin', async () => write.promise);
    const rebuilt = new TestProvider(PARTY);
    privy.offer(rebuilt, PARTY);
    expect(c.getSnapshot().status).toBe('connected');
    expect(rebuilt.requests).toEqual([]);
    write.resolve(undefined);
    await running;
    await flush();
    expect(rebuilt.requests).toContain('connect');
    expect(c.getSnapshot().connection?.wallet.provider).toBe(rebuilt);
  });

  it('bumps the latch when the connection changes, so runs for the previous party are abandoned', async () => {
    const privy = liveOption();
    const c = connector({ options: [privy.option] });
    privy.offer(new TestProvider(PARTY), PARTY);
    await c.connect('privy');
    const reply = deferred<string>();
    const running = c.latch.run('canton-coin', async () => reply.promise);
    c.disconnect();
    reply.resolve('late');
    expect(await running).toEqual({ status: 'dropped' });
  });

  it('cancel() while preparing stops wanting the option but keeps it selected', async () => {
    const privy = liveOption();
    const c = connector({ options: [privy.option] });
    c.select('privy');
    await c.connect('privy');
    c.cancel();
    expect(c.getSnapshot()).toMatchObject({ status: 'disconnected', selected: 'privy' });
    privy.offer(new TestProvider(PARTY), PARTY);
    expect(c.getSnapshot().status).toBe('disconnected');
  });

  it('switching to a loaded option clears the live one and signs it out', async () => {
    const privy = liveOption();
    const live = new TestProvider(PARTY);
    const c = connector({ options: [privy.option, readyOption('loop', new TestProvider())] });
    privy.offer(live, PARTY);
    c.select('privy');
    await c.connect('privy');
    expect(c.getSnapshot().selected).toBe('privy');
    expect(await c.connect('loop')).toEqual({ status: 'connected' });
    expect(c.getSnapshot()).toMatchObject({ selected: null, target: { key: 'loop' } });
    expect(live.requests).toContain('disconnect');
    privy.offer(new TestProvider(PARTY), PARTY);
    expect(c.getSnapshot().target?.key).toBe('loop');
  });
});

describe('createWalletConnector: store and dispose', () => {
  it("holds the store's snapshot only while the same live connection reconnects, never while another wallet connects", async () => {
    const privy = liveOption();
    const loop = new TestProvider('loop::1220abc', {
      // Loop's sign-in stays open until the test answers it.
      connect: async () => signIn.promise,
    });
    let signIn = deferred<unknown>();
    const snapshotFor = (partyId: string): WalletState => ({
      offset: partyId.length,
      holdings: [],
      balances: [],
      transferOffers: { incoming: [], outgoing: [] },
      mintOffers: [],
      burnRequests: [],
      transferPreapprovals: [],
      cantonCoinUnavailable: false,
    });
    const openWallet = (options: WalletOptions): Wallet =>
      ({
        partyId: options.partyId,
        network: options.network,
        loadState: async () => snapshotFor(options.partyId),
      }) as unknown as Wallet;
    const c = connector({
      options: [privy.option, readyOption('loop', loop)],
      store: { ...OFFLINE_STORE, openWallet } as NonNullable<WalletConnectorInput['store']>,
    });
    const { store } = c;
    if (store === null) throw new Error('no store');
    privy.offer(new TestProvider(PARTY_A), PARTY_A);
    await c.connect('privy');
    await flush();
    const held = store.getSnapshot().state;
    expect(held).not.toBeNull();

    // A rebuilt provider for the same party: reconnecting, and the store keeps the snapshot (stale).
    privy.offer(new TestProvider(PARTY_A), PARTY_A);
    expect(c.getSnapshot()).toMatchObject({ status: 'reconnecting' });
    expect(store.getSnapshot()).toMatchObject({ shown: held, stale: true });
    await flush();
    expect(store.getSnapshot()).toMatchObject({ shown: held, stale: false });

    // Another wallet (Loop) signing in: connecting, and the Privy party's holdings are not shown meanwhile.
    signIn = deferred<unknown>();
    const toLoop = c.connect('loop');
    expect(c.getSnapshot()).toMatchObject({ status: 'connecting', connection: null });
    await flush(); // Loop's provider loaded: the session left the Privy wallet and waits for Loop's sign-in
    expect(c.session?.getSnapshot().status).toBe('connecting');
    expect(c.getSnapshot()).toMatchObject({ status: 'connecting', connection: null });
    expect(store.getSnapshot()).toMatchObject({ state: null, shown: null, stale: false });
    signIn.resolve({ isConnected: true, isNetworkConnected: true });
    expect(await toLoop).toEqual({ status: 'connected' });
  });

  it('opens the store over the connector session', async () => {
    const privy = liveOption();
    const c = connector({ options: [privy.option] });
    privy.offer(new TestProvider(PARTY_A), PARTY_A);
    await c.connect('privy');
    await flush();
    expect(c.store?.getSnapshot().wallet?.partyId).toBe(PARTY_A);
  });

  it('disposes everything once, disconnecting a connected wallet, and leaves storage alone', async () => {
    const privy = liveOption();
    const local = memoryStorage();
    const provider = new TestProvider();
    const c = connector({ local, options: [privy.option, readyOption('loop', provider)] });
    await c.connect('loop');
    let published = 0;
    c.subscribe(() => {
      published += 1;
    });
    c.dispose();
    c.dispose();
    expect(provider.requests).toContain('disconnect');
    expect(local.getItem(WALLET)).toBe('loop');
    expect(privy.subscribers()).toBe(0);
    expect(c.latch.getSnapshot()).toBeDefined();
    expect(await c.latch.run('x', async () => 1)).toEqual({ status: 'refused', reason: 'disposed' });
    expect(c.select('privy')).toBe(false);
    c.cancel();
    c.disconnect();
    expect(published).toBe(0);
  });

  it('does not dispose a latch it was given', async () => {
    const latch = createWriteLatch();
    connector({ latch }).dispose();
    expect(await latch.run('x', async () => 1)).toEqual({ status: 'done', value: 1 });
  });
});

const PARTY_A = 'alice::1220abc';

describe('createWalletConnector: review fixes', () => {
  const PARTY_B = 'bob::1220abc';

  it("drops the retain key when the live provider's account changes to another party, so its snapshot is not shown", async () => {
    const privy = liveOption();
    const loads = new Map<string, Deferred<WalletState>>();
    const openWallet = (options: WalletOptions): Wallet =>
      ({
        partyId: options.partyId,
        network: options.network,
        loadState: async () => {
          const load = deferred<WalletState>();
          loads.set(options.partyId, load);
          return load.promise;
        },
      }) as unknown as Wallet;
    const c = connector({
      options: [privy.option],
      store: { ...OFFLINE_STORE, openWallet } as NonNullable<WalletConnectorInput['store']>,
    });
    const { store } = c;
    if (store === null) throw new Error('no store');
    const provider = new TestProvider(PARTY_A);
    privy.offer(provider, PARTY_A);
    await c.connect('privy');
    await flush();
    loads.get(PARTY_A)?.resolve({
      offset: 1,
      holdings: [],
      balances: [],
      transferOffers: { incoming: [], outgoing: [] },
      mintOffers: [],
      burnRequests: [],
      transferPreapprovals: [],
      cantonCoinUnavailable: false,
    });
    await flush();
    expect(store.getSnapshot().shown).not.toBeNull();
    expect(c.getSnapshot().connection?.key).toBe(`privy:${PARTY_A}`);

    provider.setParty(PARTY_B);
    provider.emit('accountsChanged', [{ partyId: PARTY_B, primary: true }]);
    await flush();
    const { connection } = c.getSnapshot();
    expect(connection?.wallet.partyId).toBe(PARTY_B);
    expect(connection?.key).not.toBe(`privy:${PARTY_A}`);
    // B's state is still loading: nothing of A's is shown meanwhile.
    expect(store.getSnapshot()).toMatchObject({ shown: null });
  });

  it('refuses to connect a loaded option whose load finished while a write took the latch, and keeps its provider', async () => {
    const latch = createWriteLatch();
    const first = new TestProvider('first::1220abc');
    const slow = loadedOption('extension:slow');
    const c = connector({ latch, options: [readyOption('loop', first), slow] });
    expect(await c.connect('loop')).toEqual({ status: 'connected' });
    const pending = c.connect('extension:slow');
    const write = deferred<undefined>();
    const running = latch.run('canton-coin', async (context) => {
      await write.promise;
      return context.signal.aborted;
    });
    const late = new TestProvider('late::1220abc');
    slow.loads[0]?.resolve(late);
    expect(await pending).toEqual({ status: 'refused', reason: 'busy' });
    await flush();
    expect(late.requests).toEqual([]);
    expect(first.requests).not.toContain('disconnect');
    expect(connectedProvider(c)).toBe(first);
    expect(c.getSnapshot().options[1]?.provider).toBe('ready');
    write.resolve(undefined);
    expect(await running).toEqual({ status: 'done', value: false });
  });

  it('restores a remembered live option that discovery found, as a fixed one', async () => {
    const privy = liveOption('privy:discovered');
    const local = memoryStorage({ [WALLET]: 'privy:discovered' });
    const c = connector({ local, discover: async () => [privy.option] });
    await flush();
    expect(privy.restores()).toBe(1);
    expect(c.getSnapshot()).toMatchObject({ status: 'preparing', selected: 'privy:discovered' });
    privy.offer(new TestProvider(PARTY_A), PARTY_A);
    await flush();
    expect(c.getSnapshot()).toMatchObject({ status: 'connected', target: { key: 'privy:discovered' } });
  });

  it('never connects a remembered live option on its own while it is unavailable', async () => {
    const privy = liveOption();
    let availability: WalletAvailability = { available: false, reason: 'not-configured' };
    const option: LiveWalletOption = { ...privy.option, availability: () => availability };
    const c = connector({ local: memoryStorage({ [WALLET]: 'privy' }), options: [option] });
    const provider = new TestProvider(PARTY_A);
    privy.offer(provider, PARTY_A);
    await flush();
    expect(provider.requests).toEqual([]);
    expect(c.getSnapshot().status).toBe('preparing');
    availability = AVAILABLE;
    privy.offer(provider, PARTY_A);
    await flush();
    expect(c.getSnapshot().status).toBe('connected');
  });

  it('subscribes to a rediscovered live option that replaces one with the same key, and wants the replacement', async () => {
    const before = liveOption('privy:x');
    const after = liveOption('privy:x');
    let found: WalletOption[] = [before.option];
    const c = connector({ discover: async () => found });
    await flush();
    expect(await c.connect('privy:x')).toEqual({ status: 'preparing' });
    found = [after.option];
    await c.rediscover();
    expect(before.subscribers()).toBe(0);
    expect(after.subscribers()).toBe(1);
    after.offer(new TestProvider(PARTY_A), PARTY_A);
    await flush();
    expect(c.getSnapshot()).toMatchObject({ status: 'connected', target: { key: 'privy:x' } });
  });

  describe('a discover that returns a new live option object per call, with the same key', () => {
    async function connectedThenRediscovered(): Promise<{
      c: WalletConnector;
      local: ReturnType<typeof memoryStorage>;
      made: Array<ReturnType<typeof liveOption>>;
      provider: TestProvider;
      connects: () => number;
    }> {
      const made: Array<ReturnType<typeof liveOption>> = [];
      const local = memoryStorage();
      const c = connector({
        local,
        discover: async () => {
          const next = liveOption('privy:x');
          made.push(next);
          return [next.option];
        },
      });
      await flush();
      const provider = new TestProvider(PARTY_A);
      made[0]?.offer(provider, PARTY_A);
      expect(await c.connect('privy:x')).toEqual({ status: 'connected' });
      await flush();
      const connects = countConnects(c);
      await c.rediscover();
      await flush();
      expect(made).toHaveLength(2);
      return { c, local, made, provider, connects };
    }

    it('keeps the wallet connected on rediscover() before the replacement offers a provider', async () => {
      const { c, local, provider, connects } = await connectedThenRediscovered();
      expect(c.getSnapshot()).toMatchObject({ status: 'connected', target: { key: 'privy:x' } });
      expect(connectedProvider(c)).toBe(provider);
      expect(provider.requests).not.toContain('disconnect');
      expect(local.getItem(WALLET)).toBe('privy:x');
      expect(connects()).toBe(0);
    });

    it('changes nothing when the replacement offers the same provider', async () => {
      const { c, made, provider, connects } = await connectedThenRediscovered();
      made[1]?.offer(provider, PARTY_A);
      await flush();
      expect(connectedProvider(c)).toBe(provider);
      expect(provider.requests).not.toContain('disconnect');
      expect(connects()).toBe(0);
      // The replacement speaks for the wallet now: the earlier object is no longer listened to.
      expect(made[0]?.subscribers()).toBe(0);
    });

    it('disconnects when the earlier object withdraws its provider before the replacement offers', async () => {
      const { c, local, made, provider } = await connectedThenRediscovered();
      expect(made[0]?.subscribers()).toBe(1);
      made[0]?.offer(null);
      await flush();
      expect(c.session?.getSnapshot().status).toBe('disconnected');
      expect(provider.requests).toContain('disconnect');
      expect(made[0]?.subscribers()).toBe(0);
      expect(local.getItem(WALLET)).toBe('privy:x');
    });

    it('disconnects when the replacement withdraws its provider after offering it', async () => {
      const { c, local, made, provider } = await connectedThenRediscovered();
      made[1]?.offer(provider, PARTY_A);
      await flush();
      expect(connectedProvider(c)).toBe(provider);
      expect(provider.requests).not.toContain('disconnect');
      made[1]?.offer(null);
      await flush();
      expect(c.session?.getSnapshot().status).toBe('disconnected');
      expect(provider.requests).toContain('disconnect');
      expect(local.getItem(WALLET)).toBe('privy:x');
    });

    it('reconnects when the replacement offers a different provider', async () => {
      const { c, made, provider, connects } = await connectedThenRediscovered();
      const rebuilt = new TestProvider(PARTY_A);
      made[1]?.offer(rebuilt, PARTY_A);
      expect(c.getSnapshot()).toMatchObject({ status: 'reconnecting' });
      await flush();
      expect(connectedProvider(c)).toBe(rebuilt);
      expect(c.getSnapshot()).toMatchObject({ status: 'connected', target: { key: 'privy:x' } });
      expect(connects()).toBe(1);
      expect(provider).not.toBe(rebuilt);
    });
  });

  it('reconnects a re-offered provider after a rediscover when the session had left it (a cancelled connect)', async () => {
    const made: Array<ReturnType<typeof liveOption>> = [];
    const c = connector({
      discover: async () => {
        const next = liveOption('privy:x');
        made.push(next);
        return [next.option];
      },
    });
    await flush();
    const wallet = fakeProvider('alice');
    made[0]?.offer(wallet.provider);
    void c.connect('privy:x');
    expect(c.getSnapshot().status).toBe('connecting');
    c.cancel();
    expect(c.getSnapshot().status).toBe('preparing');
    await c.rediscover();
    await flush();
    expect(made).toHaveLength(2);
    expect(made[0]?.subscribers()).toBe(0);
    const before = wallet.requests.length;
    made[1]?.offer(null);
    await flush();
    made[1]?.offer(wallet.provider);
    await flush();
    expect(c.getSnapshot().status).toBe('connecting');
    expect(wallet.requests.length).toBeGreaterThan(before);
  });

  it('ends discovering when discover throws synchronously', async () => {
    const c = connector({
      discover: () => {
        throw new Error('boom');
      },
    });
    await flush();
    expect(c.getSnapshot().discovering).toBe(false);
    await c.rediscover();
    expect(c.getSnapshot().discovering).toBe(false);
  });

  it('leaves the previous wallet, and its pending sign-in, when a live option without a provider is chosen', async () => {
    const privy = liveOption();
    const loop = new TestProvider('loop::1220abc');
    const c = connector({ options: [privy.option, readyOption('loop', loop)] });
    expect(await c.connect('loop')).toEqual({ status: 'connected' });
    expect(await c.connect('privy')).toEqual({ status: 'preparing' });
    expect(c.getSnapshot()).toMatchObject({ status: 'preparing', connection: null, target: { key: 'privy' } });
    expect(connectedProvider(c)).toBeNull();
    expect(loop.requests).toContain('disconnect');

    const signIn = deferred<unknown>();
    const slow = new TestProvider('slow::1220abc', { connect: async () => signIn.promise });
    const d = connector({ options: [privy.option, readyOption('slow', slow)] });
    const pending = d.connect('slow');
    await flush();
    expect(d.session?.getSnapshot().status).toBe('connecting');
    expect(await d.connect('privy')).toEqual({ status: 'preparing' });
    expect(await pending).toEqual({ status: 'cancelled' });
    signIn.resolve({ isConnected: true, isNetworkConnected: true });
    await flush();
    expect(d.session?.getSnapshot().status).toBe('disconnected');
    expect(d.getSnapshot().status).toBe('preparing');
  });

  it('remembers a loaded option only once connected: a cancelled or failed connect keeps the previous key', async () => {
    const local = memoryStorage({ [WALLET]: 'loop' });
    const slow = loadedOption('extension:slow');
    const c = connector({ local, options: [slow] });
    const cancelled = c.connect('extension:slow');
    c.cancel();
    slow.loads[0]?.resolve(new TestProvider());
    expect(await cancelled).toEqual({ status: 'cancelled' });
    expect(local.getItem(WALLET)).toBe('loop');

    const failed = c.connect('extension:slow');
    slow.loads[1]?.reject(new Error('not installed'));
    expect(await failed).toEqual({ status: 'failed' });
    expect(local.getItem(WALLET)).toBe('loop');

    const connected = c.connect('extension:slow');
    slow.loads[2]?.resolve(new TestProvider());
    expect(await connected).toEqual({ status: 'connected' });
    expect(local.getItem(WALLET)).toBe('extension:slow');
  });

  it('forgets a cancelled live reconnect when its key is still the remembered one', async () => {
    const local = memoryStorage();
    const privy = liveOption();
    const c = connector({ local, options: [privy.option] });
    const provider = fakeProvider('alice');
    privy.offer(provider.provider, PARTY_A);
    const pending = c.connect('privy');
    expect(local.getItem(WALLET)).toBe('privy');
    c.cancel();
    expect(local.getItem(WALLET)).toBeNull();
    expect(await pending).toEqual({ status: 'cancelled' });
  });

  it('keeps the previous live wallet wanted when a loaded connect fails, and reconnects its rebuilt provider', async () => {
    const local = memoryStorage();
    const privy = liveOption();
    const slow = loadedOption('extension:slow');
    const c = connector({ local, options: [privy.option, slow] });
    privy.offer(new TestProvider(PARTY_A), PARTY_A);
    expect(await c.connect('privy')).toEqual({ status: 'connected' });
    const failed = c.connect('extension:slow');
    slow.loads[0]?.reject(new Error('not installed'));
    expect(await failed).toEqual({ status: 'failed' });
    expect(local.getItem(WALLET)).toBe('privy');
    expect(c.getSnapshot()).toMatchObject({ status: 'connected', target: { key: 'privy' } });
    const rebuilt = new TestProvider(PARTY_A);
    privy.offer(rebuilt, PARTY_A);
    await flush();
    expect(c.getSnapshot().connection?.wallet.provider).toBe(rebuilt);
  });

  it('select(null) and cancel() dismiss a live option a connect() is only preparing', async () => {
    const local = memoryStorage();
    const privy = liveOption();
    const c = connector({ local, options: [privy.option] });
    expect(await c.connect('privy')).toEqual({ status: 'preparing' });
    expect(c.getSnapshot().selected).toBeNull();
    expect(c.select(null)).toBe(true);
    expect(c.getSnapshot().status).toBe('disconnected');
    expect(local.getItem(WALLET)).toBeNull();
    privy.offer(new TestProvider(PARTY_A), PARTY_A);
    await flush();
    expect(c.getSnapshot().status).toBe('disconnected');

    privy.offer(null);
    expect(await c.connect('privy')).toEqual({ status: 'preparing' });
    c.cancel();
    expect(c.getSnapshot().status).toBe('disconnected');
    expect(local.getItem(WALLET)).toBeNull();
  });
});

describe('createWalletConnector: races with a write and a superseding call', () => {
  /** Run `fn` after `depth` microtasks. */
  function afterMicrotasks(depth: number, fn: () => void): void {
    if (depth === 0) {
      queueMicrotask(fn);
      return;
    }
    queueMicrotask(() => {
      afterMicrotasks(depth - 1, fn);
    });
  }

  /** On the latch's next change, start a write (once), as a page's subscriber might. */
  function writeOnNextBump(latch: ReturnType<typeof createWriteLatch>): {
    readonly started: () => boolean;
    readonly finish: () => void;
  } {
    const write = deferred<undefined>();
    let started = false;
    const unsubscribe = latch.subscribe(() => {
      if (started) return;
      started = true;
      unsubscribe();
      void latch.run('canton-coin', async () => write.promise);
    });
    return { started: () => started, finish: () => write.resolve(undefined) };
  }

  it('refuses a live connect when a latch subscriber starts a write during its bump, and keeps the previous wallet', async () => {
    const local = memoryStorage();
    const latch = createWriteLatch();
    const first = new TestProvider('first::1220abc');
    const privy = liveOption();
    const live = new TestProvider(PARTY_A);
    const c = connector({ local, latch, options: [readyOption('loop', first), privy.option] });
    expect(await c.connect('loop')).toEqual({ status: 'connected' });
    privy.offer(live, PARTY_A);
    const write = writeOnNextBump(latch);
    expect(await c.connect('privy')).toEqual({ status: 'refused', reason: 'busy' });
    expect(write.started()).toBe(true);
    await flush();
    expect(live.requests).toEqual([]);
    expect(first.requests).not.toContain('disconnect');
    expect(connectedProvider(c)).toBe(first);
    expect(local.getItem(WALLET)).toBe('loop');
    write.finish();
    await flush();
    expect(connectedProvider(c)).toBe(first);
  });

  it('refuses a preloaded connect when a latch subscriber starts a write during its bump, and keeps the previous wallet', async () => {
    const local = memoryStorage();
    const latch = createWriteLatch();
    const first = new TestProvider('first::1220abc');
    const other = new TestProvider('other::1220abc');
    const c = connector({ local, latch, options: [readyOption('loop', first), readyOption('other', other)] });
    expect(await c.connect('loop')).toEqual({ status: 'connected' });
    c.preload(['other']);
    await flush();
    expect(c.getSnapshot().options[1]?.provider).toBe('ready');
    const write = writeOnNextBump(latch);
    expect(await c.connect('other')).toEqual({ status: 'refused', reason: 'busy' });
    expect(write.started()).toBe(true);
    await flush();
    expect(other.requests).toEqual([]);
    expect(first.requests).not.toContain('disconnect');
    expect(connectedProvider(c)).toBe(first);
    expect(local.getItem(WALLET)).toBe('loop');
    write.finish();
  });

  const DEPTHS = Array.from({ length: 40 }, (_, depth) => depth);

  /** A connector connecting `loop` (preloaded, or loaded first), with `race` run `depth` microtasks after the call. */
  async function raceLoopConnect(
    preloaded: boolean,
    depth: number,
    race: (c: WalletConnector) => void
  ): Promise<{ local: ReturnType<typeof memoryStorage>; c: WalletConnector }> {
    const local = memoryStorage();
    const privy = liveOption();
    const c = connector({ local, options: [readyOption('loop', new TestProvider()), privy.option] });
    if (preloaded) {
      c.preload(['loop']);
      await flush();
    }
    const pending = c.connect('loop');
    afterMicrotasks(depth, () => {
      race(c);
    });
    await pending;
    await flush();
    return { local, c };
  }

  for (const preloaded of [true, false]) {
    const path = preloaded ? 'preloaded' : 'loaded-first';

    it(`never remembers a ${path} connect that a disconnect() superseded`, async () => {
      for (const depth of DEPTHS) {
        const { local, c } = await raceLoopConnect(preloaded, depth, (connector_) => {
          connector_.disconnect();
        });
        expect([depth, local.getItem(WALLET)]).toEqual([depth, null]);
        c.dispose();
      }
    });

    it(`never overwrites the key of a connect that superseded a ${path} connect`, async () => {
      for (const depth of DEPTHS) {
        const { local, c } = await raceLoopConnect(preloaded, depth, (connector_) => {
          void connector_.connect('privy');
        });
        // The live option is remembered at once, and is preparing (no provider yet).
        expect([depth, local.getItem(WALLET)]).toEqual([depth, 'privy']);
        c.dispose();
      }
    });
  }
});
