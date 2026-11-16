/** `createCip103Session`: which CIP-0103 wallet is connected, as which party, and whether a reply is still current. */
import { createCip103Session, type Cip103Session } from '../../../src/wallets';
import { HOLDER, OTHER, RpcError } from './helpers';
import { connectedWallet, deferred, flush, TestProvider } from './session-helpers';

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
