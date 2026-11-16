/** `createCip103Session`: which CIP-0103 wallet is connected, as which party, and whether a reply is still current. */
import { createCip103Session, type Cip103Session } from '../../../src/wallets';
import { HOLDER, OTHER, RpcError } from './helpers';
import { connectedWallet, deferred, flush, TestProvider } from './session-helpers';

/** A provider that answers each new listener at once, inside `on()`, with the event set in `sticky` (a sticky event). */
class StickyProvider extends TestProvider {
  readonly sticky: Partial<Record<string, readonly unknown[]>> = {};

  override on(event: string, listener: (...args: unknown[]) => void): this {
    super.on(event, listener);
    const args = this.sticky[event];
    if (args !== undefined) listener(...args);
    return this;
  }
}

/** The session's states as short labels, in the order it published them. */
function statuses(session: Cip103Session): string[] {
  const seen: string[] = [];
  session.subscribe(() => {
    const state = session.getSnapshot();
    seen.push(state.status === 'disconnected' ? `disconnected:${String(state.endedBy)}` : state.status);
  });
  return seen;
}

/** A session, and how many times it published a new state. */
function observed(): { session: Cip103Session; changes: () => number } {
  const session = createCip103Session();
  let changes = 0;
  session.subscribe(() => {
    changes += 1;
  });
  return { session, changes: () => changes };
}

describe('createCip103Session', () => {
  it('starts disconnected, and connects as the primary account when the wallet reports a session', async () => {
    const { session, changes } = observed();
    expect(session.getSnapshot()).toEqual({ status: 'disconnected', endedBy: null, error: null });
    const provider = new TestProvider();
    await session.connected(provider, { network: 'devnet' });
    const wallet = connectedWallet(session);
    expect(wallet).toEqual({ provider, partyId: HOLDER, key: expect.any(String), network: 'devnet' });
    expect(session.isCurrent(wallet)).toBe(true);
    expect(changes()).toBe(1);
    // It follows the provider's events while connected.
    expect(provider.listenerCount()).toBe(2);
    // The snapshot is stable between changes.
    expect(session.getSnapshot()).toBe(session.getSnapshot());
  });

  it('drops a party lookup that answers after end()', async () => {
    const { session } = observed();
    const lookup = deferred<unknown>();
    const provider = new TestProvider(HOLDER, { getPrimaryAccount: async () => lookup.promise });
    const pending = session.connected(provider);
    session.end('wallet');
    lookup.resolve({ partyId: HOLDER });
    await pending;
    expect(session.getSnapshot()).toEqual({ status: 'disconnected', endedBy: 'wallet', error: null });
    expect(provider.listenerCount()).toBe(0);
  });

  it('drops a party lookup that answers after dispose(), and publishes nothing more', async () => {
    const { session, changes } = observed();
    const lookup = deferred<unknown>();
    const provider = new TestProvider(HOLDER, { getPrimaryAccount: async () => lookup.promise });
    const pending = session.connected(provider);
    session.dispose();
    lookup.resolve({ partyId: HOLDER });
    await pending;
    expect(session.getSnapshot().status).toBe('disconnected');
    expect(changes()).toBe(0);
    await session.connected(provider);
    session.end('user');
    expect(changes()).toBe(0);
  });

  it('keeps the same wallet object when the wallet repeats its connect callback', async () => {
    const { session, changes } = observed();
    const provider = new TestProvider();
    await session.connected(provider, { network: 'devnet' });
    const wallet = connectedWallet(session);
    await session.connected(provider, { network: 'devnet' });
    await session.connected(provider, { network: 'devnet', ifConnected: true });
    expect(connectedWallet(session)).toBe(wallet);
    expect(session.isCurrent(wallet)).toBe(true);
    expect(changes()).toBe(1);
    // Another party, network or provider is a new session.
    provider.setParty(OTHER);
    await session.connected(provider, { network: 'devnet' });
    expect(connectedWallet(session)).not.toBe(wallet);
    expect(connectedWallet(session).partyId).toBe(OTHER);
    expect(session.isCurrent(wallet)).toBe(false);
    const other = connectedWallet(session);
    await session.connected(provider, { network: 'mainnet' });
    expect(connectedWallet(session)).not.toBe(other);
    expect(connectedWallet(session).network).toBe('mainnet');
  });

  it('applies only the newest of overlapping party lookups', async () => {
    const { session } = observed();
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const replies = [first, second];
    const provider = new TestProvider(HOLDER, {
      getPrimaryAccount: async () => (replies.shift() ?? deferred<unknown>()).promise,
    });
    const older = session.connected(provider);
    const newer = session.connected(provider);
    second.resolve({ partyId: OTHER });
    await newer;
    first.resolve({ partyId: HOLDER });
    await older;
    expect(connectedWallet(session).partyId).toBe(OTHER);
  });

  it('ignores connected() after end() until the user connects again', async () => {
    const { session } = observed();
    const provider = new TestProvider();
    await session.connected(provider);
    session.end('wallet');
    await session.connected(provider);
    await session.connected(provider, { ifConnected: true });
    expect(session.getSnapshot()).toEqual({ status: 'disconnected', endedBy: 'wallet', error: null });
    expect(provider.requests.filter((m) => m === 'getPrimaryAccount')).toHaveLength(1);

    await session.connect(provider);
    expect(connectedWallet(session).partyId).toBe(HOLDER);
    // Re-armed: a repeated callback is followed again.
    await session.connected(provider);
    expect(session.getSnapshot().status).toBe('connected');
  });

  it.each([
    ['4200 (no isConnected method)', async (): Promise<unknown> => Promise.reject(new RpcError(4200, 'unsupported'))],
    ['a failure', async (): Promise<unknown> => Promise.reject(new Error('network down'))],
    ['isConnected false', (): unknown => ({ isConnected: false, isNetworkConnected: true })],
    ['an answer without isConnected', (): unknown => ({ connected: true })],
  ])('with ifConnected, treats %s as not connected', async (_name, isConnected) => {
    const { session, changes } = observed();
    const provider = new TestProvider(HOLDER, { isConnected });
    await session.connected(provider, { ifConnected: true });
    expect(session.getSnapshot()).toEqual({ status: 'disconnected', endedBy: null, error: null });
    expect(provider.requests).toEqual(['isConnected']);
    expect(changes()).toBe(0);
  });

  it('with ifConnected, connects when the wallet answers isConnected true', async () => {
    const { session } = observed();
    const provider = new TestProvider();
    await session.connected(provider, { network: 'devnet', ifConnected: true });
    expect(provider.requests).toEqual(['isConnected', 'getPrimaryAccount']);
    expect(connectedWallet(session).network).toBe('devnet');
  });

  it('drops an isConnected answer that arrives after the session changed', async () => {
    const { session } = observed();
    const answer = deferred<unknown>();
    const provider = new TestProvider(HOLDER, { isConnected: async () => answer.promise });
    const restoring = session.connected(provider, { ifConnected: true });
    session.end('wallet');
    answer.resolve({ isConnected: true });
    await restoring;
    expect(session.getSnapshot()).toEqual({ status: 'disconnected', endedBy: 'wallet', error: null });
    expect(provider.requests).toEqual(['isConnected']);
  });

  it.each([
    ['the older answers first', true],
    ['the newer answers first', false],
  ])('with ifConnected, the most recently started restore decides (%s)', async (_name, olderFirst) => {
    const { session } = observed();
    const olderAnswer = deferred<unknown>();
    const newerAnswer = deferred<unknown>();
    const older = new TestProvider(OTHER, { isConnected: async () => olderAnswer.promise });
    const newer = new TestProvider(HOLDER, { isConnected: async () => newerAnswer.promise });
    const restoringOlder = session.connected(older, { ifConnected: true });
    const restoringNewer = session.connected(newer, { ifConnected: true });
    if (olderFirst) {
      olderAnswer.resolve({ isConnected: true });
      await flush();
      newerAnswer.resolve({ isConnected: true });
    } else {
      newerAnswer.resolve({ isConnected: true });
      await flush();
      olderAnswer.resolve({ isConnected: true });
    }
    await Promise.all([restoringOlder, restoringNewer]);
    expect(connectedWallet(session).provider).toBe(newer);
    expect(connectedWallet(session).partyId).toBe(HOLDER);
    expect(older.requests).toEqual(['isConnected']);
    expect(older.listenerCount()).toBe(0);
  });

  it('with ifConnected, a newer restore that finds no session drops an older one that answers late', async () => {
    const { session, changes } = observed();
    const olderAnswer = deferred<unknown>();
    const older = new TestProvider(OTHER, { isConnected: async () => olderAnswer.promise });
    const newer = new TestProvider(HOLDER, { isConnected: () => ({ isConnected: false }) });
    const restoringOlder = session.connected(older, { ifConnected: true });
    await session.connected(newer, { ifConnected: true });
    olderAnswer.resolve({ isConnected: true });
    await restoringOlder;
    expect(session.getSnapshot()).toEqual({ status: 'disconnected', endedBy: null, error: null });
    expect(older.requests).toEqual(['isConnected']);
    expect(changes()).toBe(0);
  });

  it('a restore that finds no session does not cancel a pending connect() or accountsChanged lookup', async () => {
    const { session } = observed();
    // connect(): the wallet signed in, its party lookup is still pending when a restore of another wallet starts.
    const lookup = deferred<unknown>();
    const provider = new TestProvider(HOLDER, { getPrimaryAccount: async () => lookup.promise });
    const connecting = session.connect(provider, { network: 'devnet' });
    await flush();
    expect(provider.requests).toEqual(['connect', 'getPrimaryAccount']);
    const notConnected = new TestProvider(OTHER, { isConnected: () => ({ isConnected: false }) });
    await session.connected(notConnected, { ifConnected: true });
    lookup.resolve({ primary: true, partyId: HOLDER });
    await connecting;
    // Not left in 'connecting'.
    expect(connectedWallet(session)).toMatchObject({ provider, partyId: HOLDER, network: 'devnet' });

    // accountsChanged: the new party's read is pending when the restore starts.
    const switched = deferred<unknown>();
    provider.answers.getPrimaryAccount = async () => switched.promise;
    provider.emit('accountsChanged', []);
    await session.connected(notConnected, { ifConnected: true });
    switched.resolve({ primary: true, partyId: OTHER });
    await flush();
    expect(connectedWallet(session)).toMatchObject({ provider, partyId: OTHER, network: 'devnet' });
  });

  it('a restore that finds a session while connect() reads the party connects; the session is not left connecting', async () => {
    const { session } = observed();
    const lookup = deferred<unknown>();
    const provider = new TestProvider(HOLDER, { getPrimaryAccount: async () => lookup.promise });
    const connecting = session.connect(provider, { network: 'devnet' });
    await flush();
    const restored = new TestProvider(OTHER);
    await session.connected(restored, { network: 'devnet', ifConnected: true });
    // The restore started last, so it decides; connect()'s late party reply is dropped.
    lookup.resolve({ primary: true, partyId: HOLDER });
    await connecting;
    expect(connectedWallet(session)).toMatchObject({ provider: restored, partyId: OTHER });
  });

  it('reads the account again on accountsChanged: the same party keeps its object, another is a new wallet', async () => {
    const { session, changes } = observed();
    const provider = new TestProvider();
    await session.connected(provider, { network: 'devnet' });
    const wallet = connectedWallet(session);

    provider.emit('accountsChanged', [{ partyId: HOLDER, primary: true }]);
    await flush();
    expect(connectedWallet(session)).toBe(wallet);
    expect(changes()).toBe(1);

    provider.setParty(OTHER);
    provider.emit('accountsChanged', [{ partyId: OTHER, primary: true }]);
    await flush();
    const switched = connectedWallet(session);
    expect(switched).not.toBe(wallet);
    expect(switched).toEqual({ provider, partyId: OTHER, key: expect.any(String), network: 'devnet' });
    // A UI key per session: the new wallet's differs, the kept one's stays.
    expect(switched.key).not.toBe(wallet.key);
    expect(session.isCurrent(wallet)).toBe(false);
    // Still one set of listeners on the same provider.
    expect(provider.listenerCount()).toBe(2);
  });

  it('a failed account read after accountsChanged leaves the session disconnected with the error', async () => {
    const { session } = observed();
    const provider = new TestProvider();
    await session.connected(provider);
    provider.answers.getPrimaryAccount = async () => Promise.reject(new RpcError(4100, 'No authorized account'));
    provider.emit('accountsChanged', []);
    await flush();
    expect(session.getSnapshot()).toEqual({
      status: 'disconnected',
      endedBy: null,
      error: {
        kind: 'read-failed',
        code: 4100,
        message:
          'The wallet has no signed-in account: connect again. Details: The wallet did not return its primary account: No authorized account (CIP-0103 4100 Unauthorized)',
      },
    });
    expect(provider.listenerCount()).toBe(0);
  });

  it('refuses a wallet whose account reports another network than the dApp connects for', async () => {
    const { session } = observed();
    const onMainnet = new TestProvider(HOLDER, {
      getPrimaryAccount: () => ({ primary: true, partyId: HOLDER, networkId: 'canton:mainnet' }),
    });
    await session.connected(onMainnet, { network: 'devnet' });
    expect(session.getSnapshot()).toEqual({
      status: 'disconnected',
      endedBy: null,
      error: {
        kind: 'other',
        message:
          'The wallet is on canton:mainnet, not canton:devnet: switch networks in the wallet, then connect again.',
      },
    });
    expect(onMainnet.listenerCount()).toBe(0);
    // The same network connects, and so does a wallet that reports none.
    await session.connected(onMainnet, { network: 'mainnet' });
    expect(connectedWallet(session)).toMatchObject({ partyId: HOLDER, network: 'mainnet' });
    await session.connected(new TestProvider(), { network: 'devnet' });
    expect(connectedWallet(session)).toMatchObject({ partyId: HOLDER, network: 'devnet' });
    // A spelling the session does not recognise is not proof of another network.
    const otherSpelling = new TestProvider(HOLDER, {
      getPrimaryAccount: () => ({ primary: true, partyId: HOLDER, networkId: 'canton:dev-net' }),
    });
    await session.connected(otherSpelling, { network: 'devnet' });
    expect(connectedWallet(session)).toMatchObject({ partyId: HOLDER, network: 'devnet' });
  });

  it('a callback whose account cannot be read, or is on the other network, leaves a connected wallet alone', async () => {
    const { session } = observed();
    const live = new TestProvider(HOLDER);
    await session.connected(live, { network: 'devnet' });
    const wallet = connectedWallet(session);

    const unreadable = new TestProvider(OTHER, {
      getPrimaryAccount: async () => Promise.reject(new RpcError(4100, 'No authorized account')),
    });
    await session.connected(unreadable, { network: 'devnet' });
    const onMainnet = new TestProvider(OTHER, {
      getPrimaryAccount: () => ({ primary: true, partyId: OTHER, networkId: 'canton:mainnet' }),
    });
    await session.connected(onMainnet, { network: 'devnet' });
    // A stale callback of the live wallet that fails its read does not drop it either.
    live.answers.getPrimaryAccount = async () => Promise.reject(new RpcError(-32603, 'busy'));
    await session.connected(live, { network: 'devnet' });

    expect(connectedWallet(session)).toBe(wallet);
    expect(live.listenerCount()).toBe(2);
    expect(unreadable.listenerCount() + onMainnet.listenerCount()).toBe(0);
  });

  it('ends the session when the connected wallet itself answers a callback with an account on the other network', async () => {
    const { session } = observed();
    const live = new TestProvider(HOLDER);
    await session.connected(live, { network: 'devnet' });
    // The user switched the same wallet to MainNet, and it repeats its connect callback.
    live.answers.getPrimaryAccount = () => ({ primary: true, partyId: HOLDER, networkId: 'canton:mainnet' });
    await session.connected(live, { network: 'devnet' });
    expect(session.getSnapshot()).toEqual({
      status: 'disconnected',
      endedBy: null,
      error: {
        kind: 'other',
        message:
          'The wallet is on canton:mainnet, not canton:devnet: switch networks in the wallet, then connect again.',
      },
    });
    expect(live.listenerCount()).toBe(0);
  });

  it.each([
    ['another wallet that cannot be read', 'other'],
    ['a stale callback of the same wallet that fails its read', 'same'],
    ['a restore of the same wallet whose read fails', 'restore'],
  ] as const)('a pending accountsChanged lookup still decides after %s while connected', async (_name, callback) => {
    const { session } = observed();
    const live = new TestProvider(HOLDER);
    await session.connected(live, { network: 'devnet' });
    const switched = deferred<unknown>();
    live.answers.getPrimaryAccount = async () => switched.promise;
    live.emit('accountsChanged', []);
    if (callback === 'other') {
      const unreadable = new TestProvider(OTHER, {
        getPrimaryAccount: async () => Promise.reject(new RpcError(4100, 'No authorized account')),
      });
      await session.connected(unreadable, { network: 'devnet' });
    } else {
      live.answers.getPrimaryAccount = async () => Promise.reject(new RpcError(-32603, 'busy'));
      await session.connected(live, { network: 'devnet', ifConnected: callback === 'restore' });
    }
    expect(connectedWallet(session).partyId).toBe(HOLDER);
    // The account switch the wallet announced first still lands.
    switched.resolve({ primary: true, partyId: OTHER });
    await flush();
    expect(connectedWallet(session)).toMatchObject({ provider: live, partyId: OTHER, network: 'devnet' });
  });

  it('a pending accountsChanged lookup that finds the other network still ends the session after an ignored callback', async () => {
    const { session } = observed();
    const live = new TestProvider(HOLDER);
    await session.connected(live, { network: 'devnet' });
    const switched = deferred<unknown>();
    live.answers.getPrimaryAccount = async () => switched.promise;
    live.emit('accountsChanged', []);
    const unreadable = new TestProvider(OTHER, {
      getPrimaryAccount: async () => Promise.reject(new RpcError(4100, 'No authorized account')),
    });
    await session.connected(unreadable, { network: 'devnet' });
    switched.resolve({ primary: true, partyId: HOLDER, networkId: 'canton:mainnet' });
    await flush();
    const state = session.getSnapshot();
    expect(state.status === 'disconnected' && state.error?.message).toMatch(/^The wallet is on canton:mainnet/);
  });

  it.each([
    ['cannot read its account', async () => Promise.reject(new RpcError(4100, 'No authorized account'))],
    ['reports the other network', () => ({ primary: true, partyId: HOLDER, networkId: 'canton:mainnet' })],
  ])('a callback that %s while connect() is pending leaves connect() to decide', async (_case, failingRead) => {
    const { session } = observed();
    const approval = deferred<unknown>();
    const provider = new TestProvider(HOLDER, { connect: async () => approval.promise });
    const connecting = session.connect(provider, { network: 'devnet' });
    provider.answers.getPrimaryAccount = async () => failingRead();
    await session.connected(provider, { network: 'devnet' });
    expect(session.getSnapshot()).toEqual({ status: 'connecting' });
    // The wallet's own sign-in completes and its account reads normally: connect() connects.
    provider.setParty(HOLDER);
    approval.resolve({ isConnected: true });
    await connecting;
    expect(connectedWallet(session)).toMatchObject({ partyId: HOLDER, network: 'devnet' });
  });

  it('ends the session when statusChanged says the wallet disconnected', async () => {
    const { session } = observed();
    const provider = new TestProvider();
    await session.connected(provider);
    const wallet = connectedWallet(session);
    // Connected, or a status without a connection, changes nothing.
    provider.emit('statusChanged', { connection: { isConnected: true, isNetworkConnected: true } });
    provider.emit('statusChanged', { provider: { id: 'loop' } });
    provider.emit('statusChanged', 'nonsense');
    expect(connectedWallet(session)).toBe(wallet);

    provider.emit('statusChanged', { connection: { isConnected: false, reason: 'No authorized wallet session' } });
    expect(session.getSnapshot()).toEqual({ status: 'disconnected', endedBy: 'wallet', error: null });
    expect(session.isCurrent(wallet)).toBe(false);
    expect(provider.listenerCount()).toBe(0);
    // The wallet ended it: no disconnect is sent back.
    expect(provider.requests).not.toContain('disconnect');
  });

  it.each(['connected', 'connect'] as const)(
    'a provider that answers its new statusChanged listener at once with disconnected ends the session; %s() does not publish connected over it',
    async (how) => {
      const session = createCip103Session();
      const seen = statuses(session);
      const provider = new StickyProvider();
      provider.sticky['statusChanged'] = [{ connection: { isConnected: false } }];
      if (how === 'connected') await session.connected(provider, { network: 'devnet' });
      else await session.connect(provider, { network: 'devnet' });
      expect(session.getSnapshot()).toEqual({ status: 'disconnected', endedBy: 'wallet', error: null });
      expect(seen).toEqual(how === 'connected' ? ['disconnected:wallet'] : ['connecting', 'disconnected:wallet']);
      expect(provider.listenerCount()).toBe(0);
      // The wallet ended it: a repeated callback is ignored until the user connects again.
      await session.connected(provider, { network: 'devnet' });
      expect(session.getSnapshot().status).toBe('disconnected');
    }
  );

  it("a provider that answers its new accountsChanged listener at once is read for its own network, not the previous wallet's", async () => {
    const { session } = observed();
    const first = new TestProvider(HOLDER);
    await session.connected(first, { network: 'devnet' });
    const second = new StickyProvider(OTHER, {
      getPrimaryAccount: () => ({ primary: true, partyId: OTHER, networkId: 'canton:mainnet' }),
    });
    second.sticky['accountsChanged'] = [[{ partyId: OTHER, primary: true }]];
    await session.connected(second, { network: 'mainnet' });
    await flush();
    const wallet = connectedWallet(session);
    expect(wallet).toEqual({ provider: second, partyId: OTHER, key: expect.any(String), network: 'mainnet' });
    // The sticky event came before its wallet was published: it started no lookup for devnet.
    expect(second.requests).toEqual(['getPrimaryAccount']);
    expect(first.listenerCount()).toBe(0);
    expect(second.listenerCount()).toBe(2);
    // A later accountsChanged reads the account again for the wallet's own network.
    second.emit('accountsChanged', [{ partyId: OTHER, primary: true }]);
    await flush();
    expect(connectedWallet(session)).toBe(wallet);
    expect(second.requests).toEqual(['getPrimaryAccount', 'getPrimaryAccount']);
  });

  it('removes its listeners on end and on dispose, and ignores events sent after', async () => {
    const provider = new TestProvider();
    const ended = createCip103Session();
    await ended.connected(provider);
    expect(provider.listenerCount()).toBe(2);
    ended.end('user');
    expect(provider.listenerCount()).toBe(0);

    const disposed = createCip103Session();
    await disposed.connected(provider);
    expect(provider.listenerCount()).toBe(2);
    disposed.dispose();
    expect(provider.listenerCount()).toBe(0);
    expect(disposed.isCurrent(connectedWallet(disposed))).toBe(false);

    // A provider whose removeListener does nothing still cannot reach an ended session.
    const sticky = new TestProvider();
    sticky.removeListener = () => sticky;
    const session = createCip103Session();
    await session.connected(sticky);
    session.end('wallet');
    await session.connect(sticky);
    const wallet = connectedWallet(session);
    session.end('user');
    sticky.setParty(OTHER);
    sticky.emit('accountsChanged', []);
    sticky.emit('statusChanged', { connection: { isConnected: false } });
    await flush();
    expect(session.getSnapshot()).toEqual({ status: 'disconnected', endedBy: 'user', error: null });
    expect(session.isCurrent(wallet)).toBe(false);
  });

  it('moves its listeners when another provider connects', async () => {
    const { session } = observed();
    const first = new TestProvider();
    const second = new TestProvider(OTHER);
    await session.connected(first);
    await session.connected(second);
    expect(first.listenerCount()).toBe(0);
    expect(second.listenerCount()).toBe(2);
    expect(connectedWallet(session).provider).toBe(second);
  });

  describe('connect()', () => {
    it('sends CIP-0103 connect, shows connecting, then reads the primary account', async () => {
      const { session } = observed();
      const approval = deferred<unknown>();
      const provider = new TestProvider(HOLDER, { connect: async () => approval.promise });
      const connecting = session.connect(provider, { network: 'mainnet' });
      expect(session.getSnapshot()).toEqual({ status: 'connecting' });
      expect(provider.requests).toEqual(['connect']);
      approval.resolve({ isConnected: true });
      await connecting;
      expect(provider.requests).toEqual(['connect', 'getPrimaryAccount']);
      expect(connectedWallet(session)).toEqual({
        provider,
        partyId: HOLDER,
        key: expect.any(String),
        network: 'mainnet',
      });
    });

    it('recovers a failed party lookup while the wallet stayed connected (no new accept callback)', async () => {
      const { session } = observed();
      const provider = new TestProvider(HOLDER, {
        getPrimaryAccount: async () =>
          Promise.reject(new RpcError(-32603, 'Session verification failed with status 500.')),
      });
      // The wallet restored its session, but the party read failed: the page shows Connect.
      await session.connected(provider, { network: 'devnet', ifConnected: true });
      const failed = session.getSnapshot();
      expect(failed.status).toBe('disconnected');
      expect(failed.status === 'disconnected' && failed.error?.kind).toBe('read-failed');

      // Connect: the wallet answers at once that it is already connected and sends no accept callback. The session
      // still reads the party again.
      provider.setParty(HOLDER);
      await session.connect(provider, { network: 'devnet' });
      expect(provider.requests).toEqual(['isConnected', 'getPrimaryAccount', 'connect', 'getPrimaryAccount']);
      expect(connectedWallet(session)).toEqual({
        provider,
        partyId: HOLDER,
        key: expect.any(String),
        network: 'devnet',
      });
    });

    it('recovers a party lookup that never answered, and drops its late reply', async () => {
      const { session } = observed();
      const stuck = deferred<unknown>();
      const provider = new TestProvider(HOLDER);
      provider.answers.getPrimaryAccount = async () => stuck.promise;
      const restoring = session.connected(provider, { network: 'devnet' });
      await flush();
      expect(session.getSnapshot().status).toBe('disconnected');

      provider.setParty(HOLDER);
      await session.connect(provider, { network: 'devnet' });
      const wallet = connectedWallet(session);
      expect(wallet.partyId).toBe(HOLDER);

      // The lookup that hung answers late, for another party: dropped.
      stuck.resolve({ partyId: OTHER });
      await restoring;
      expect(connectedWallet(session)).toBe(wallet);
    });

    it('reads the party again when the wallet was already connected', async () => {
      const { session, changes } = observed();
      const provider = new TestProvider();
      await session.connected(provider, { network: 'devnet' });
      provider.setParty(OTHER); // the wallet switched account without telling
      await session.connect(provider, { network: 'devnet' });
      expect(connectedWallet(session).partyId).toBe(OTHER);
      expect(changes()).toBe(3); // connected, connecting, connected
    });

    it('reports a declined or failed connect, and ignores one that end() superseded', async () => {
      const { session } = observed();
      const declined = new TestProvider(HOLDER, {
        connect: async () => Promise.reject(new RpcError(4001, 'User rejected')),
      });
      await session.connect(declined);
      expect(session.getSnapshot()).toEqual({
        status: 'disconnected',
        endedBy: null,
        error: { kind: 'declined', code: 4001, message: 'You declined to connect in the wallet.' },
      });

      const failing = new TestProvider(HOLDER, {
        connect: async () => Promise.reject(new RpcError(4100, 'Session is not authorized')),
      });
      await session.connect(failing);
      expect(session.getSnapshot()).toEqual({
        status: 'disconnected',
        endedBy: null,
        error: {
          kind: 'other',
          code: 4100,
          message: 'The wallet did not connect: Session is not authorized (CIP-0103 4100 Unauthorized)',
        },
      });
      await session.connect(
        new TestProvider(HOLDER, { connect: async () => Promise.reject(new Error('popup closed')) })
      );
      expect(session.getSnapshot()).toEqual({
        status: 'disconnected',
        endedBy: null,
        error: { kind: 'other', message: 'The wallet did not connect: popup closed' },
      });

      // The wallet rejects the sign-in through its own callback (end('wallet')) before connect settles.
      const approval = deferred<unknown>();
      const rejected = new TestProvider(HOLDER, { connect: async () => approval.promise });
      const connecting = session.connect(rejected);
      session.end('wallet');
      approval.reject(new RpcError(4001, 'User rejected'));
      await connecting;
      expect(session.getSnapshot()).toEqual({ status: 'disconnected', endedBy: 'wallet', error: null });

      // A newer connect() supersedes an older one.
      const slow = deferred<unknown>();
      const older = new TestProvider(OTHER, { connect: async () => slow.promise });
      const first = session.connect(older);
      await session.connect(new TestProvider(HOLDER));
      slow.resolve({ isConnected: true });
      await first;
      expect(connectedWallet(session).partyId).toBe(HOLDER);
      expect(older.requests).toEqual(['connect']);
    });

    it('a connect that fails after the accept callback connected leaves the session disconnected and detached', async () => {
      const { session } = observed();
      const approval = deferred<unknown>();
      const provider = new TestProvider(HOLDER, { connect: async () => approval.promise });
      const connecting = session.connect(provider, { network: 'devnet' });
      // The wallet's accept callback connects first.
      await session.connected(provider, { network: 'devnet' });
      expect(connectedWallet(session).partyId).toBe(HOLDER);
      expect(provider.listenerCount()).toBe(2);
      // An account read (accountsChanged) is still pending when connect fails.
      const lookup = deferred<unknown>();
      provider.answers.getPrimaryAccount = async () => lookup.promise;
      provider.emit('accountsChanged', []);
      approval.reject(new RpcError(-32603, 'timeout'));
      await connecting;
      const failed = {
        status: 'disconnected',
        endedBy: null,
        error: {
          kind: 'other',
          code: -32603,
          message: 'The wallet did not connect: timeout (CIP-0103 -32603 Internal error)',
        },
      };
      expect(session.getSnapshot()).toEqual(failed);
      expect(provider.listenerCount()).toBe(0);
      // The late account read does not reconnect over the error.
      lookup.resolve({ primary: true, partyId: OTHER });
      await flush();
      expect(session.getSnapshot()).toEqual(failed);
    });
  });

  describe('end() and fail()', () => {
    it("end('user') sends CIP-0103 disconnect best-effort; end('wallet') sends nothing", async () => {
      const { session } = observed();
      const provider = new TestProvider(HOLDER, {
        disconnect: async () => Promise.reject(new RpcError(4900, 'already gone')),
      });
      await session.connected(provider);
      const wallet = connectedWallet(session);
      session.end('user');
      await flush();
      expect(session.getSnapshot()).toEqual({ status: 'disconnected', endedBy: 'user', error: null });
      expect(session.isCurrent(wallet)).toBe(false);
      expect(provider.requests).toEqual(['getPrimaryAccount', 'disconnect']);

      await session.connect(provider);
      session.end('wallet');
      expect(provider.requests).toEqual(['getPrimaryAccount', 'disconnect', 'connect', 'getPrimaryAccount']);
    });

    it("end('user') disconnects the wallet the session is on, not a provider whose restore found no session", async () => {
      const { session } = observed();
      const live = new TestProvider(HOLDER);
      await session.connected(live);
      const notConnected = new TestProvider(OTHER, { isConnected: () => ({ isConnected: false }) });
      await session.connected(notConnected, { ifConnected: true });
      session.end('user');
      await flush();
      expect(live.requests).toEqual(['getPrimaryAccount', 'disconnect']);
      expect(notConnected.requests).toEqual(['isConnected']);
    });

    it("end('user') while connect() is pending disconnects the wallet it signs in to", async () => {
      const { session } = observed();
      const approval = deferred<unknown>();
      const provider = new TestProvider(HOLDER, { connect: async () => approval.promise });
      const connecting = session.connect(provider);
      await flush();
      session.end('user');
      approval.resolve({ isConnected: true });
      await connecting;
      expect(provider.requests).toEqual(['connect', 'disconnect']);
      expect(session.getSnapshot()).toEqual({ status: 'disconnected', endedBy: 'user', error: null });
    });

    it("end('user') disconnects the wallet a pending connect() signs in to, also after a callback's account read failed", async () => {
      const { session } = observed();
      const approval = deferred<unknown>();
      const provider = new TestProvider(HOLDER, {
        connect: async () => approval.promise,
        getPrimaryAccount: async () => Promise.reject(new RpcError(4100, 'No authorized account')),
      });
      const connecting = session.connect(provider);
      // The wallet's accept callback fires first, and its account read fails: ignored, connect() still decides.
      await session.connected(provider);
      expect(session.getSnapshot()).toEqual({ status: 'connecting' });
      session.end('user');
      approval.resolve({ isConnected: true });
      await connecting;
      expect(provider.requests).toEqual(['connect', 'getPrimaryAccount', 'disconnect']);
      expect(session.getSnapshot()).toEqual({ status: 'disconnected', endedBy: 'user', error: null });
    });

    it("end('user') sends the disconnect before it publishes, so a listener that connects again waits for it", async () => {
      const { session } = observed();
      const disconnected = deferred<unknown>();
      const provider = new TestProvider(HOLDER, { disconnect: async () => disconnected.promise });
      await session.connected(provider);
      const reconnecting: Array<Promise<void>> = [];
      session.subscribe(() => {
        const state = session.getSnapshot();
        if (reconnecting.length === 0 && state.status === 'disconnected' && state.endedBy === 'user') {
          reconnecting.push(session.connect(provider));
        }
      });
      session.end('user');
      expect(provider.requests).toEqual(['getPrimaryAccount', 'disconnect']);
      disconnected.resolve(null);
      expect(reconnecting).toHaveLength(1);
      await Promise.all(reconnecting);
      expect(provider.requests).toEqual(['getPrimaryAccount', 'disconnect', 'connect', 'getPrimaryAccount']);
      expect(connectedWallet(session).partyId).toBe(HOLDER);
    });

    it('a connect() that the disconnect request itself sets off waits for that disconnect, and end() does not publish over it', async () => {
      const { session } = observed();
      const disconnected = deferred<unknown>();
      const reconnecting: Array<Promise<void>> = [];
      // A wallet whose disconnect synchronously runs the dApp's own handler, which signs in again.
      const provider: TestProvider = new TestProvider(HOLDER, {
        disconnect: async () => {
          reconnecting.push(session.connect(provider));
          return disconnected.promise;
        },
      });
      await session.connected(provider);
      session.end('user');
      expect(reconnecting).toHaveLength(1);
      // The disconnect is unanswered: no connect yet, and the pending connect() owns the state.
      expect(provider.requests).toEqual(['getPrimaryAccount', 'disconnect']);
      expect(session.getSnapshot()).toEqual({ status: 'connecting' });
      disconnected.resolve(null);
      await Promise.all(reconnecting);
      expect(provider.requests).toEqual(['getPrimaryAccount', 'disconnect', 'connect', 'getPrimaryAccount']);
      expect(connectedWallet(session).partyId).toBe(HOLDER);
    });

    it('connect() waits for each wallet its own disconnect, not only the most recent one', async () => {
      const { session } = observed();
      const disconnected = deferred<unknown>();
      const first = new TestProvider(HOLDER, { disconnect: async () => disconnected.promise });
      const second = new TestProvider(OTHER);
      await session.connected(first);
      session.end('user');
      await session.connect(second);
      session.end('user');
      await flush();
      const connecting = session.connect(first);
      // first's disconnect is still in flight: no connect in the same tick.
      expect(first.requests).toEqual(['getPrimaryAccount', 'disconnect']);
      disconnected.resolve(null);
      await connecting;
      expect(first.requests).toEqual(['getPrimaryAccount', 'disconnect', 'connect', 'getPrimaryAccount']);
      expect(connectedWallet(session).provider).toBe(first);
    });

    it("connect() waits for an end('user') disconnect of the same wallet before it signs in again", async () => {
      const { session } = observed();
      const disconnected = deferred<unknown>();
      const provider = new TestProvider(HOLDER, { disconnect: async () => disconnected.promise });
      await session.connected(provider);
      session.end('user');
      const connecting = session.connect(provider);
      await flush();
      expect(provider.requests).toEqual(['getPrimaryAccount', 'disconnect']);
      expect(session.getSnapshot()).toEqual({ status: 'connecting' });
      // Another wallet is not held up: it is asked to connect in the same tick, inside the user's click.
      const other = new TestProvider(OTHER);
      const switching = session.connect(other);
      expect(other.requests).toEqual(['connect']);
      await switching;
      expect(connectedWallet(session).partyId).toBe(OTHER);
      session.end('wallet');
      const again = session.connect(provider);

      disconnected.resolve(null);
      await Promise.all([connecting, again]);
      // The superseded connect() never signs in; the latest one does, after the disconnect settled.
      expect(provider.requests).toEqual(['getPrimaryAccount', 'disconnect', 'connect', 'getPrimaryAccount']);
      expect(connectedWallet(session).partyId).toBe(HOLDER);
    });

    it('connect() stops waiting for a disconnect that never answers after three seconds', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate'] });
      try {
        const { session } = observed();
        const provider = new TestProvider(HOLDER, { disconnect: async () => new Promise<never>(() => undefined) });
        await session.connected(provider);
        session.end('user');
        const connecting = session.connect(provider);
        await jest.advanceTimersByTimeAsync(2999);
        expect(provider.requests).not.toContain('connect');
        await jest.advanceTimersByTimeAsync(1);
        await connecting;
        expect(connectedWallet(session).partyId).toBe(HOLDER);
      } finally {
        jest.useRealTimers();
      }
    });

    it('waits for a disconnect that never answers only once: a later connect() signs in at once', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate'] });
      try {
        const { session } = observed();
        const provider = new TestProvider(HOLDER, { disconnect: async () => new Promise<never>(() => undefined) });
        await session.connected(provider);
        session.end('user');
        const connecting = session.connect(provider);
        await jest.advanceTimersByTimeAsync(3000);
        await connecting;
        expect(connectedWallet(session).partyId).toBe(HOLDER);
        // The wallet ends the session, and the user clicks Connect again: connect is sent inside the click.
        session.end('wallet');
        const again = session.connect(provider);
        expect(provider.requests.filter((m) => m === 'connect')).toHaveLength(2);
        await again;
        expect(connectedWallet(session).partyId).toBe(HOLDER);
        // A connect() that comes after the deadline, with no wait before, does not wait either.
        session.end('user');
        await jest.advanceTimersByTimeAsync(3000);
        session.end('wallet');
        void session.connect(provider);
        expect(provider.requests.filter((m) => m === 'connect')).toHaveLength(3);
      } finally {
        jest.useRealTimers();
      }
    });

    it('a disconnect that never answered is not waited for again once its deadline passed, also after a later disconnect', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate'] });
      try {
        const { session } = observed();
        let disconnects = 0;
        // The first disconnect never answers; later ones answer at once.
        const provider = new TestProvider(HOLDER, {
          disconnect: async () => {
            disconnects += 1;
            return disconnects === 1 ? new Promise<never>(() => undefined) : null;
          },
        });
        await session.connected(provider);
        session.end('user');
        const connecting = session.connect(provider);
        await jest.advanceTimersByTimeAsync(3000);
        await connecting;
        expect(connectedWallet(session).partyId).toBe(HOLDER);
        // A second disconnect, which answers, and the user clicks Connect again: connect is sent inside the click.
        session.end('user');
        await flush();
        expect(disconnects).toBe(2);
        void session.connect(provider);
        expect(provider.requests.filter((m) => m === 'connect')).toHaveLength(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('a disconnect that never answers delays a later connect() only until its own deadline, also when chained', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate'] });
      try {
        const { session } = observed();
        let disconnects = 0;
        // The first disconnect never answers; later ones answer at once.
        const provider = new TestProvider(HOLDER, {
          disconnect: async () => {
            disconnects += 1;
            return disconnects === 1 ? new Promise<never>(() => undefined) : null;
          },
        });
        const connects = (): number => provider.requests.filter((m) => m === 'connect').length;
        await session.connected(provider);
        // t=0: the first disconnect, and a connect() that waits for it.
        session.end('user');
        void session.connect(provider);
        await jest.advanceTimersByTimeAsync(1000);
        expect(connects()).toBe(0);
        // t=1000: the user cancels the pending sign-in (a second disconnect, which answers), then clicks Connect.
        session.end('user');
        await flush();
        expect(disconnects).toBe(2);
        const connecting = session.connect(provider);
        await jest.advanceTimersByTimeAsync(1999);
        expect(connects()).toBe(0);
        // t=3000: the first disconnect's own deadline. connect is sent then, not at the second one's (t=4000).
        await jest.advanceTimersByTimeAsync(1);
        expect(connects()).toBe(1);
        await connecting;
        expect(connectedWallet(session).partyId).toBe(HOLDER);
      } finally {
        jest.useRealTimers();
      }
    });

    it.each([
      ["end('wallet')", (session: Cip103Session) => session.end('wallet')],
      ['fail()', (session: Cip103Session) => session.fail(new Error('wallet gone'))],
    ])(
      "end('user') still reports the user's disconnect when the wallet's disconnect synchronously calls %s",
      async (_case, nested) => {
        const session = createCip103Session();
        const provider: TestProvider = new TestProvider(HOLDER, {
          disconnect: () => {
            nested(session);
            return null;
          },
        });
        await session.connected(provider, { network: 'devnet' });
        expect(session.getSnapshot().status).toBe('connected');
        const seen = statuses(session);
        session.end('user');
        expect(seen[seen.length - 1]).toBe('disconnected:user');
        expect(session.getSnapshot()).toEqual({ status: 'disconnected', endedBy: 'user', error: null });
        await flush();
        expect(provider.requests).toEqual(['getPrimaryAccount', 'disconnect']);
        // Still ended: a late connect callback is ignored until the user connects again.
        await session.connected(provider, { network: 'devnet' });
        expect(session.getSnapshot()).toEqual({ status: 'disconnected', endedBy: 'user', error: null });
      }
    );

    it.each([
      ['ends the session', (session: Cip103Session) => session.end('wallet')],
      ['disposes the session', (session: Cip103Session) => session.dispose()],
    ])('sends no connect when a listener of the connecting state %s', async (_case, cancel) => {
      const session = createCip103Session();
      session.subscribe(() => {
        if (session.getSnapshot().status === 'connecting') cancel(session);
      });
      const provider = new TestProvider();
      await session.connect(provider);
      expect(provider.requests).toEqual([]);
    });

    it("end('user') before any wallet sends nothing", () => {
      const { session } = observed();
      session.end('user');
      expect(session.getSnapshot()).toEqual({ status: 'disconnected', endedBy: 'user', error: null });
    });

    it('fail() drops the wallet with the error, and a later connect callback still connects', async () => {
      const { session } = observed();
      const provider = new TestProvider();
      await session.connected(provider);
      const wallet = connectedWallet(session);
      session.fail(new Error('Loop is set up for devnet in this tab. Reload the page to use mainnet.'));
      expect(session.getSnapshot()).toEqual({
        status: 'disconnected',
        endedBy: null,
        error: { kind: 'other', message: 'Loop is set up for devnet in this tab. Reload the page to use mainnet.' },
      });
      expect(session.isCurrent(wallet)).toBe(false);
      expect(provider.listenerCount()).toBe(0);
      await session.connected(provider);
      expect(session.getSnapshot().status).toBe('connected');
    });

    it('unsubscribes a listener', async () => {
      const session = createCip103Session();
      let calls = 0;
      const unsubscribe = session.subscribe(() => {
        calls += 1;
      });
      unsubscribe();
      await session.connected(new TestProvider());
      expect(calls).toBe(0);
    });
  });
});
