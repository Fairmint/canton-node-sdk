/** `createCip103Session`: which CIP-0103 wallet is connected, as which party, and whether a reply is still current. */
import { createCip103Session, type Cip103Session, type DaNetwork } from '../../../src/wallets';
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
    seen.push(
      state.status === 'disconnected' && state.error !== null ? `disconnected:${state.error.kind}` : state.status
    );
  });
  return seen;
}

/** A session on `network`, and how many times it published a new state. */
function observed(network: DaNetwork = 'devnet'): { session: Cip103Session; changes: () => number } {
  const session = createCip103Session({ network });
  let changes = 0;
  session.subscribe(() => {
    changes += 1;
  });
  return { session, changes: () => changes };
}

const DISCONNECTED = { status: 'disconnected', error: null };
const OTHER_NETWORK_ERROR = {
  status: 'disconnected',
  error: {
    kind: 'other',
    message: 'The wallet is on canton:mainnet, not canton:devnet: switch networks in the wallet, then connect again.',
  },
};
const onMainnet = (party: string = HOLDER): TestProvider =>
  new TestProvider(party, {
    getPrimaryAccount: () => ({ primary: true, partyId: party, networkId: 'canton:mainnet' }),
  });

describe('createCip103Session', () => {
  it('refuses a network other than devnet or mainnet', () => {
    expect(() => createCip103Session({ network: 'testnet' as DaNetwork })).toThrow(
      'createCip103Session: network must be devnet or mainnet'
    );
  });

  describe('connect()', () => {
    it('sends CIP-0103 connect, shows connecting, then connects as the primary account on its network', async () => {
      const { session, changes } = observed('mainnet');
      expect(session.network).toBe('mainnet');
      expect(session.getSnapshot()).toEqual(DISCONNECTED);
      const approval = deferred<unknown>();
      const provider = new TestProvider(HOLDER, { connect: async () => approval.promise });
      const connecting = session.connect(provider);
      expect(session.getSnapshot()).toEqual({ status: 'connecting' });
      expect(provider.requests).toEqual(['connect']);
      approval.resolve({ isConnected: true });
      await connecting;
      expect(provider.requests).toEqual(['connect', 'getPrimaryAccount']);
      const wallet = connectedWallet(session);
      expect(wallet).toEqual({ provider, partyId: HOLDER, network: 'mainnet', key: expect.any(String) });
      expect(session.isCurrent(wallet)).toBe(true);
      expect(changes()).toBe(2);
      // It follows the provider's events while connected.
      expect(provider.listenerCount()).toBe(2);
      // The snapshot is stable between changes.
      expect(session.getSnapshot()).toBe(session.getSnapshot());
    });

    it('reads the party again when the wallet was already connected, as a new wallet object', async () => {
      const { session, changes } = observed();
      const provider = new TestProvider();
      await session.connect(provider);
      const wallet = connectedWallet(session);
      provider.setParty(OTHER); // the wallet switched account without telling
      await session.connect(provider);
      expect(connectedWallet(session).partyId).toBe(OTHER);
      expect(connectedWallet(session).key).not.toBe(wallet.key);
      expect(session.isCurrent(wallet)).toBe(false);
      expect(changes()).toBe(4); // connecting, connected, connecting, connected
    });

    it('refuses a wallet on the other DA network, and accepts no network id or one it does not recognise', async () => {
      const { session } = observed();
      const mainnet = onMainnet();
      await session.connect(mainnet);
      expect(session.getSnapshot()).toEqual(OTHER_NETWORK_ERROR);
      expect(mainnet.listenerCount()).toBe(0);

      await session.connect(new TestProvider());
      expect(connectedWallet(session)).toMatchObject({ partyId: HOLDER, network: 'devnet' });
      const otherSpelling = new TestProvider(HOLDER, {
        getPrimaryAccount: () => ({ primary: true, partyId: HOLDER, networkId: 'canton:dev-net' }),
      });
      await session.connect(otherSpelling);
      expect(connectedWallet(session)).toMatchObject({ provider: otherSpelling, network: 'devnet' });
      const devnet = new TestProvider(HOLDER, {
        getPrimaryAccount: () => ({ primary: true, partyId: HOLDER, networkId: 'canton:devnet' }),
      });
      await session.connect(devnet);
      expect(connectedWallet(session)).toMatchObject({ provider: devnet, network: 'devnet' });
    });

    it('reports a declined or failed connect, and a failed account read', async () => {
      const { session } = observed();
      await session.connect(
        new TestProvider(HOLDER, { connect: async () => Promise.reject(new RpcError(4001, 'User rejected')) })
      );
      expect(session.getSnapshot()).toEqual({
        status: 'disconnected',
        error: { kind: 'declined', code: 4001, message: 'You declined to connect in the wallet.' },
      });
      await session.connect(
        new TestProvider(HOLDER, {
          connect: async () => Promise.reject(new RpcError(4100, 'Session is not authorized')),
        })
      );
      expect(session.getSnapshot()).toEqual({
        status: 'disconnected',
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
        error: { kind: 'other', message: 'The wallet did not connect: popup closed' },
      });
      const unreadable = new TestProvider(HOLDER, {
        getPrimaryAccount: async () => Promise.reject(new RpcError(4100, 'No authorized account')),
      });
      await session.connect(unreadable);
      expect(session.getSnapshot()).toEqual({
        status: 'disconnected',
        error: {
          kind: 'read-failed',
          code: 4100,
          message:
            'The wallet has no signed-in account: connect again. Details: The wallet did not return its primary account: No authorized account (CIP-0103 4100 Unauthorized)',
        },
      });
      expect(unreadable.listenerCount()).toBe(0);
    });

    it('is superseded by disconnect() and by a newer connect(), which signs the older sign-in out', async () => {
      const { session } = observed();
      const approval = deferred<unknown>();
      const rejected = new TestProvider(HOLDER, { connect: async () => approval.promise });
      const connecting = session.connect(rejected);
      session.disconnect();
      approval.reject(new RpcError(4001, 'User rejected'));
      await connecting;
      expect(session.getSnapshot()).toEqual(DISCONNECTED);

      const slow = deferred<unknown>();
      const older = new TestProvider(OTHER, { connect: async () => slow.promise });
      const first = session.connect(older);
      await session.connect(new TestProvider(HOLDER));
      slow.resolve({ isConnected: true });
      await first;
      expect(connectedWallet(session).partyId).toBe(HOLDER);
      expect(older.requests).toEqual(['connect', 'disconnect']);
    });

    it('drops an account read that answers after a newer connect(), disconnect() or dispose()', async () => {
      const { session, changes } = observed();
      const lookup = deferred<unknown>();
      const provider = new TestProvider(HOLDER, { getPrimaryAccount: async () => lookup.promise });
      const pending = session.connect(provider);
      await flush();
      session.disconnect();
      lookup.resolve({ partyId: HOLDER });
      await pending;
      expect(session.getSnapshot()).toEqual(DISCONNECTED);
      expect(provider.listenerCount()).toBe(0);

      const stuck = deferred<unknown>();
      provider.answers.getPrimaryAccount = async () => stuck.promise;
      const hanging = session.connect(provider);
      await flush();
      provider.setParty(HOLDER);
      await session.connect(provider);
      const wallet = connectedWallet(session);
      stuck.resolve({ partyId: OTHER });
      await hanging;
      expect(connectedWallet(session)).toBe(wallet);

      provider.answers.getPrimaryAccount = async () => stuck.promise;
      const before = changes();
      const disposedLookup = session.connect(provider);
      session.dispose();
      await disposedLookup;
      expect(changes()).toBe(before + 1); // connecting, then nothing after dispose
    });

    it('signs the previous wallet out when the user connects another one, and not when they connect the same one', async () => {
      const { session } = observed();
      const first = new TestProvider(HOLDER);
      await session.connect(first);
      await session.connect(first);
      expect(first.requests).not.toContain('disconnect');
      const second = new TestProvider(OTHER);
      await session.connect(second);
      await flush();
      expect(first.requests.filter((method) => method === 'disconnect')).toHaveLength(1);
      expect(first.listenerCount()).toBe(0);
      expect(second.listenerCount()).toBe(2);
      expect(connectedWallet(session).partyId).toBe(OTHER);
      // A wallet still signing in is signed out too when the user picks another.
      const slow = deferred<unknown>();
      const third = new TestProvider(HOLDER, { connect: async () => slow.promise });
      const signingIn = session.connect(third);
      await session.connect(first);
      await flush();
      expect(third.requests).toEqual(['connect', 'disconnect']);
      expect(second.requests).toContain('disconnect');
      slow.resolve({ isConnected: true });
      await signingIn;
      expect(connectedWallet(session).provider).toBe(first);
    });

    it.each([
      ['disconnects', (session: Cip103Session) => session.disconnect()],
      ['disposes the session', (session: Cip103Session) => session.dispose()],
    ])('sends no connect when a listener of the connecting state %s', async (_case, cancel) => {
      const { session } = observed();
      session.subscribe(() => {
        if (session.getSnapshot().status === 'connecting') cancel(session);
      });
      const provider = new TestProvider();
      await session.connect(provider);
      expect(provider.requests).toEqual([]);
    });

    it('notifies every listener and finishes connecting when one listener throws', async () => {
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
        const { session } = observed();
        const boom = new Error('listener bug');
        session.subscribe(() => {
          throw boom;
        });
        const seen: string[] = [];
        session.subscribe(() => seen.push(session.getSnapshot().status));
        const provider = new TestProvider();
        await session.connect(provider);
        expect(seen).toEqual(['connecting', 'connected']);
        expect(provider.requests).toEqual(['connect', 'getPrimaryAccount']);
        expect(rethrown).toEqual([boom, boom]);
      } finally {
        timer.mockRestore();
      }
    });
  });

  describe('restore()', () => {
    it('connects silently when the wallet answers isConnected true', async () => {
      const { session } = observed();
      const seen = statuses(session);
      const provider = new TestProvider();
      await session.restore(provider);
      expect(provider.requests).toEqual(['isConnected', 'getPrimaryAccount']);
      expect(connectedWallet(session)).toMatchObject({ provider, partyId: HOLDER, network: 'devnet' });
      expect(seen).toEqual(['connected']);
    });

    it.each([
      ['4200 (no isConnected method)', async (): Promise<unknown> => Promise.reject(new RpcError(4200, 'unsupported'))],
      ['a failure', async (): Promise<unknown> => Promise.reject(new Error('network down'))],
      ['isConnected false', (): unknown => ({ isConnected: false, isNetworkConnected: true })],
      ['an answer without isConnected', (): unknown => ({ connected: true })],
    ])('treats %s as not connected', async (_name, isConnected) => {
      const { session, changes } = observed();
      const provider = new TestProvider(HOLDER, { isConnected });
      await session.restore(provider);
      expect(session.getSnapshot()).toEqual(DISCONNECTED);
      expect(provider.requests).toEqual(['isConnected']);
      expect(changes()).toBe(0);
    });

    it.each([
      [
        'an account read that fails',
        new TestProvider(HOLDER, { getPrimaryAccount: async () => Promise.reject(new RpcError(4100, 'no account')) }),
      ],
      ['an account on the other network', onMainnet()],
    ])('never publishes an error: %s leaves the session as it was', async (_name, provider) => {
      const { session, changes } = observed();
      await session.restore(provider);
      expect(session.getSnapshot()).toEqual(DISCONNECTED);
      expect(changes()).toBe(0);
      expect(provider.listenerCount()).toBe(0);
    });

    it('does nothing while connecting or connected', async () => {
      const { session } = observed();
      const approval = deferred<unknown>();
      const provider = new TestProvider(HOLDER, { connect: async () => approval.promise });
      const connecting = session.connect(provider);
      const restored = new TestProvider(OTHER);
      await session.restore(restored);
      approval.resolve({ isConnected: true });
      await connecting;
      const wallet = connectedWallet(session);
      await session.restore(restored);
      await session.restore(provider);
      expect(restored.requests).toEqual([]);
      expect(connectedWallet(session)).toBe(wallet);
    });

    it('is dropped when the session changed while isConnected or the account read was pending', async () => {
      const { session } = observed();
      const answer = deferred<unknown>();
      const slow = new TestProvider(OTHER, { isConnected: async () => answer.promise });
      const restoring = session.restore(slow);
      await session.connect(new TestProvider(HOLDER));
      answer.resolve({ isConnected: true });
      await restoring;
      expect(connectedWallet(session).partyId).toBe(HOLDER);
      expect(slow.requests).toEqual(['isConnected']);

      session.disconnect();
      const account = deferred<unknown>();
      const reading = new TestProvider(OTHER, { getPrimaryAccount: async () => account.promise });
      const restoringAgain = session.restore(reading);
      await flush();
      session.fail(new Error('wallet setup failed'));
      account.resolve({ primary: true, partyId: OTHER });
      await restoringAgain;
      expect(session.getSnapshot()).toEqual({
        status: 'disconnected',
        error: { kind: 'other', message: 'wallet setup failed' },
      });
      expect(reading.listenerCount()).toBe(0);
    });

    it.each([
      ['the older answers first', true],
      ['the newer answers first', false],
    ])('the most recently started restore decides (%s)', async (_name, olderFirst) => {
      const { session } = observed();
      const olderAnswer = deferred<unknown>();
      const newerAnswer = deferred<unknown>();
      const older = new TestProvider(OTHER, { isConnected: async () => olderAnswer.promise });
      const newer = new TestProvider(HOLDER, { isConnected: async () => newerAnswer.promise });
      const restoringOlder = session.restore(older);
      const restoringNewer = session.restore(newer);
      const [first, second] = olderFirst ? [olderAnswer, newerAnswer] : [newerAnswer, olderAnswer];
      first.resolve({ isConnected: true });
      await flush();
      second.resolve({ isConnected: true });
      await Promise.all([restoringOlder, restoringNewer]);
      expect(connectedWallet(session).provider).toBe(newer);
      expect(older.requests).toEqual(['isConnected']);
      expect(older.listenerCount()).toBe(0);
    });

    it('a newer restore that finds no session drops an older one whose account read is pending', async () => {
      const { session } = observed();
      const account = deferred<unknown>();
      const provider = new TestProvider(HOLDER, { getPrimaryAccount: async () => account.promise });
      const older = session.restore(provider);
      await flush();
      expect(provider.requests).toEqual(['isConnected', 'getPrimaryAccount']);
      provider.answers.isConnected = () => ({ isConnected: false });
      await session.restore(provider);
      account.resolve({ primary: true, partyId: HOLDER });
      await older;
      expect(session.getSnapshot()).toEqual(DISCONNECTED);
      expect(provider.listenerCount()).toBe(0);
    });

    it('does nothing for a wallet the user signed out of, until connect() signs in to it again', async () => {
      const { session } = observed();
      const disconnected = deferred<unknown>();
      const provider = new TestProvider(HOLDER, { disconnect: async () => disconnected.promise });
      await session.connect(provider);
      session.disconnect();
      // While its disconnect is in flight, and after it failed with the wallet still reporting a session.
      await session.restore(provider);
      disconnected.reject(new Error('disconnect failed'));
      await flush();
      await session.restore(provider);
      expect(provider.requests).toEqual(['connect', 'getPrimaryAccount', 'disconnect']);
      expect(session.getSnapshot()).toEqual(DISCONNECTED);

      // Signing in again lifts it: a session that then ends without a sign-out is restored.
      await session.connect(provider);
      session.fail(new Error('setup failed'));
      await session.restore(provider);
      expect(provider.requests.slice(-2)).toEqual(['isConnected', 'getPrimaryAccount']);
      expect(session.getSnapshot()).toMatchObject({ status: 'connected', wallet: { partyId: HOLDER } });
    });
  });

  describe('while connected', () => {
    it('reads the account again on accountsChanged: the same party keeps its object, another is a new wallet', async () => {
      const { session, changes } = observed();
      const provider = new TestProvider();
      await session.connect(provider);
      const wallet = connectedWallet(session);

      provider.emit('accountsChanged', [{ partyId: HOLDER, primary: true }]);
      await flush();
      expect(connectedWallet(session)).toBe(wallet);
      expect(changes()).toBe(2);

      provider.setParty(OTHER);
      provider.emit('accountsChanged', [{ partyId: OTHER, primary: true }]);
      await flush();
      const switched = connectedWallet(session);
      expect(switched).toEqual({ provider, partyId: OTHER, network: 'devnet', key: expect.any(String) });
      expect(switched.key).not.toBe(wallet.key);
      expect(session.isCurrent(wallet)).toBe(false);
      expect(provider.listenerCount()).toBe(2);
    });

    it('applies only the newest of overlapping accountsChanged reads', async () => {
      const { session } = observed();
      const provider = new TestProvider();
      await session.connect(provider);
      const first = deferred<unknown>();
      const second = deferred<unknown>();
      const replies = [first, second];
      provider.answers.getPrimaryAccount = async () => (replies.shift() ?? deferred<unknown>()).promise;
      provider.emit('accountsChanged', []);
      provider.emit('accountsChanged', []);
      second.resolve({ partyId: OTHER });
      await flush();
      first.resolve({ partyId: HOLDER });
      await flush();
      expect(connectedWallet(session).partyId).toBe(OTHER);
    });

    it('a failed account read after accountsChanged leaves the session disconnected with the error', async () => {
      const { session } = observed();
      const provider = new TestProvider();
      await session.connect(provider);
      provider.answers.getPrimaryAccount = async () => Promise.reject(new RpcError(-32603, 'busy'));
      provider.emit('accountsChanged', []);
      await flush();
      expect(session.getSnapshot()).toMatchObject({ status: 'disconnected', error: { kind: 'read-failed' } });
      expect(provider.listenerCount()).toBe(0);
    });

    it('ends the session when the wallet switched to the other network', async () => {
      const { session } = observed();
      const provider = new TestProvider();
      await session.connect(provider);
      provider.answers.getPrimaryAccount = () => ({ primary: true, partyId: HOLDER, networkId: 'canton:mainnet' });
      provider.emit('accountsChanged', []);
      await flush();
      expect(session.getSnapshot()).toEqual(OTHER_NETWORK_ERROR);
      expect(provider.listenerCount()).toBe(0);
    });

    it('ends the session without an error, and sends nothing, when statusChanged says the wallet disconnected', async () => {
      const { session } = observed();
      const provider = new TestProvider();
      await session.connect(provider);
      const wallet = connectedWallet(session);
      provider.emit('statusChanged', { connection: { isConnected: true, isNetworkConnected: true } });
      provider.emit('statusChanged', { provider: { id: 'wallet' } });
      provider.emit('statusChanged', 'nonsense');
      expect(connectedWallet(session)).toBe(wallet);

      provider.emit('statusChanged', { connection: { isConnected: false, reason: 'No authorized wallet session' } });
      expect(session.getSnapshot()).toEqual(DISCONNECTED);
      expect(session.isCurrent(wallet)).toBe(false);
      expect(provider.listenerCount()).toBe(0);
      expect(provider.requests).not.toContain('disconnect');
    });

    it.each(['connect', 'restore'] as const)(
      'a provider that answers its new statusChanged listener at once with disconnected ends the session (%s)',
      async (how) => {
        const { session } = observed();
        const seen = statuses(session);
        const provider = new StickyProvider();
        provider.sticky['statusChanged'] = [{ connection: { isConnected: false } }];
        await (how === 'connect' ? session.connect(provider) : session.restore(provider));
        expect(session.getSnapshot()).toEqual(DISCONNECTED);
        expect(seen).toEqual(how === 'connect' ? ['connecting', 'disconnected'] : []);
        expect(provider.listenerCount()).toBe(0);
      }
    );

    it('a provider that answers its new accountsChanged listener at once is not read twice', async () => {
      const { session } = observed('mainnet');
      const provider = new StickyProvider(OTHER, {
        getPrimaryAccount: () => ({ primary: true, partyId: OTHER, networkId: 'canton:mainnet' }),
      });
      provider.sticky['accountsChanged'] = [[{ partyId: OTHER, primary: true }]];
      await session.connect(provider);
      await flush();
      const wallet = connectedWallet(session);
      expect(wallet).toMatchObject({ provider, partyId: OTHER, network: 'mainnet' });
      expect(provider.requests).toEqual(['connect', 'getPrimaryAccount']);
      provider.emit('accountsChanged', [{ partyId: OTHER, primary: true }]);
      await flush();
      expect(connectedWallet(session)).toBe(wallet);
      expect(provider.requests).toEqual(['connect', 'getPrimaryAccount', 'getPrimaryAccount']);
    });

    it('removes its listeners on disconnect and on dispose, and ignores events sent after', async () => {
      const provider = new TestProvider();
      const ended = observed().session;
      await ended.connect(provider);
      expect(provider.listenerCount()).toBe(2);
      ended.disconnect();
      expect(provider.listenerCount()).toBe(0);

      const disposed = observed().session;
      await disposed.connect(provider);
      disposed.dispose();
      expect(provider.listenerCount()).toBe(0);
      expect(disposed.isCurrent(connectedWallet(disposed))).toBe(false);

      // A provider whose removeListener does nothing still cannot reach an ended session.
      const sticky = new TestProvider();
      sticky.removeListener = () => sticky;
      const { session } = observed();
      await session.connect(sticky);
      const wallet = connectedWallet(session);
      session.disconnect();
      sticky.setParty(OTHER);
      sticky.emit('accountsChanged', []);
      sticky.emit('statusChanged', { connection: { isConnected: false } });
      await flush();
      expect(session.getSnapshot()).toEqual(DISCONNECTED);
      expect(session.isCurrent(wallet)).toBe(false);
    });
  });

  describe('disconnect() and fail()', () => {
    it('disconnect() sends CIP-0103 disconnect best-effort', async () => {
      const { session } = observed();
      const provider = new TestProvider(HOLDER, {
        disconnect: async () => Promise.reject(new RpcError(4900, 'already gone')),
      });
      await session.connect(provider);
      const wallet = connectedWallet(session);
      session.disconnect();
      await flush();
      expect(session.getSnapshot()).toEqual(DISCONNECTED);
      expect(session.isCurrent(wallet)).toBe(false);
      expect(provider.requests).toEqual(['connect', 'getPrimaryAccount', 'disconnect']);
    });

    it('disconnect() before any wallet sends nothing and publishes nothing', () => {
      const { session, changes } = observed();
      session.disconnect();
      expect(session.getSnapshot()).toEqual(DISCONNECTED);
      expect(changes()).toBe(0);
    });

    it('disconnect() while connect() is pending disconnects the wallet it signs in to', async () => {
      const { session } = observed();
      const approval = deferred<unknown>();
      const provider = new TestProvider(HOLDER, { connect: async () => approval.promise });
      const connecting = session.connect(provider);
      await flush();
      session.disconnect();
      approval.resolve({ isConnected: true });
      await connecting;
      expect(provider.requests).toEqual(['connect', 'disconnect']);
      expect(session.getSnapshot()).toEqual(DISCONNECTED);
    });

    it('sends the disconnect before it publishes, so a listener that connects again waits for it', async () => {
      const { session } = observed();
      const disconnected = deferred<unknown>();
      const provider = new TestProvider(HOLDER, { disconnect: async () => disconnected.promise });
      await session.connect(provider);
      const reconnecting: Array<Promise<void>> = [];
      session.subscribe(() => {
        if (reconnecting.length === 0 && session.getSnapshot().status === 'disconnected') {
          reconnecting.push(session.connect(provider));
        }
      });
      session.disconnect();
      expect(provider.requests).toEqual(['connect', 'getPrimaryAccount', 'disconnect']);
      disconnected.resolve(null);
      expect(reconnecting).toHaveLength(1);
      await Promise.all(reconnecting);
      expect(provider.requests).toEqual(['connect', 'getPrimaryAccount', 'disconnect', 'connect', 'getPrimaryAccount']);
      expect(connectedWallet(session).partyId).toBe(HOLDER);
    });

    it('a connect() that the disconnect request itself sets off waits for it, and owns the state', async () => {
      const { session } = observed();
      const disconnected = deferred<unknown>();
      const reconnecting: Array<Promise<void>> = [];
      const provider: TestProvider = new TestProvider(HOLDER, {
        disconnect: async () => {
          reconnecting.push(session.connect(provider));
          return disconnected.promise;
        },
      });
      await session.connect(provider);
      session.disconnect();
      expect(reconnecting).toHaveLength(1);
      expect(provider.requests).toEqual(['connect', 'getPrimaryAccount', 'disconnect']);
      expect(session.getSnapshot()).toEqual({ status: 'connecting' });
      disconnected.resolve(null);
      await Promise.all(reconnecting);
      expect(connectedWallet(session).partyId).toBe(HOLDER);
    });

    it('a fail() that the disconnect request itself sets off keeps its error', async () => {
      const { session } = observed();
      const provider: TestProvider = new TestProvider(HOLDER, {
        disconnect: () => {
          session.fail(new Error('wallet gone'));
          return null;
        },
      });
      await session.connect(provider);
      session.disconnect();
      expect(session.getSnapshot()).toEqual({
        status: 'disconnected',
        error: { kind: 'other', message: 'wallet gone' },
      });
    });

    it('connect() waits for each wallet its own disconnect, not only the most recent one', async () => {
      const { session } = observed();
      const disconnected = deferred<unknown>();
      const first = new TestProvider(HOLDER, { disconnect: async () => disconnected.promise });
      const second = new TestProvider(OTHER);
      await session.connect(first);
      session.disconnect();
      await session.connect(second);
      session.disconnect();
      await flush();
      const connecting = session.connect(first);
      expect(first.requests).toEqual(['connect', 'getPrimaryAccount', 'disconnect']);
      disconnected.resolve(null);
      await connecting;
      expect(first.requests).toEqual(['connect', 'getPrimaryAccount', 'disconnect', 'connect', 'getPrimaryAccount']);
      expect(connectedWallet(session).provider).toBe(first);
    });

    it('connect() waits for a disconnect of the same wallet; another wallet is asked to connect at once', async () => {
      const { session } = observed();
      const disconnected = deferred<unknown>();
      const provider = new TestProvider(HOLDER, { disconnect: async () => disconnected.promise });
      await session.connect(provider);
      session.disconnect();
      const connecting = session.connect(provider);
      await flush();
      expect(provider.requests).toEqual(['connect', 'getPrimaryAccount', 'disconnect']);
      expect(session.getSnapshot()).toEqual({ status: 'connecting' });
      // Another wallet is not held up: it is asked to connect in the same tick, inside the user's click.
      const other = new TestProvider(OTHER);
      const switching = session.connect(other);
      expect(other.requests).toEqual(['connect']);
      await switching;
      expect(connectedWallet(session).partyId).toBe(OTHER);
      other.emit('statusChanged', { connection: { isConnected: false } });
      const again = session.connect(provider);
      disconnected.resolve(null);
      await Promise.all([connecting, again]);
      // The superseded connect() never signs in; the latest one does, after the disconnect settled.
      expect(provider.requests).toEqual(['connect', 'getPrimaryAccount', 'disconnect', 'connect', 'getPrimaryAccount']);
      expect(connectedWallet(session).partyId).toBe(HOLDER);
    });

    describe('a disconnect that never answers', () => {
      beforeEach(() => {
        jest.useFakeTimers({ doNotFake: ['setImmediate'] });
      });
      afterEach(() => {
        jest.useRealTimers();
      });

      const hanging = (): TestProvider =>
        new TestProvider(HOLDER, { disconnect: async () => new Promise<never>(() => undefined) });
      const connects = (provider: TestProvider): number => provider.requests.filter((m) => m === 'connect').length;

      it('delays connect() for three seconds, once', async () => {
        const { session } = observed();
        const provider = hanging();
        await session.connect(provider);
        session.disconnect();
        const connecting = session.connect(provider);
        await jest.advanceTimersByTimeAsync(2999);
        expect(connects(provider)).toBe(1);
        await jest.advanceTimersByTimeAsync(1);
        await connecting;
        expect(connectedWallet(session).partyId).toBe(HOLDER);
        // After its deadline it is never waited for again: connect is sent inside the click.
        provider.emit('statusChanged', { connection: { isConnected: false } });
        const again = session.connect(provider);
        expect(connects(provider)).toBe(3);
        await again;
        expect(connectedWallet(session).partyId).toBe(HOLDER);
      });

      it('delays a later connect() only until its own deadline, also when chained', async () => {
        const { session } = observed();
        let disconnects = 0;
        const provider = new TestProvider(HOLDER, {
          disconnect: async () => {
            disconnects += 1;
            return disconnects === 1 ? new Promise<never>(() => undefined) : null;
          },
        });
        await session.connect(provider);
        // t=0: the first disconnect, and a connect() that waits for it.
        session.disconnect();
        void session.connect(provider);
        await jest.advanceTimersByTimeAsync(1000);
        expect(connects(provider)).toBe(1);
        // t=1000: the user cancels the pending sign-in (it never sent `connect`: no second disconnect), and connects.
        session.disconnect();
        await flush();
        expect(disconnects).toBe(1);
        const connecting = session.connect(provider);
        await jest.advanceTimersByTimeAsync(1999);
        expect(connects(provider)).toBe(1);
        // t=3000: the first disconnect's own deadline.
        await jest.advanceTimersByTimeAsync(1);
        expect(connects(provider)).toBe(2);
        await connecting;
        expect(connectedWallet(session).partyId).toBe(HOLDER);
      });
    });

    it('fail() drops the wallet with the error, and a later connect() connects', async () => {
      const { session } = observed();
      const provider = new TestProvider();
      await session.connect(provider);
      const wallet = connectedWallet(session);
      session.fail(new Error('The wallet is set up for devnet in this tab. Reload the page to use mainnet.'));
      expect(session.getSnapshot()).toEqual({
        status: 'disconnected',
        error: {
          kind: 'other',
          message: 'The wallet is set up for devnet in this tab. Reload the page to use mainnet.',
        },
      });
      expect(session.isCurrent(wallet)).toBe(false);
      expect(provider.listenerCount()).toBe(0);
      await session.connect(provider);
      expect(session.getSnapshot().status).toBe('connected');
    });

    it('unsubscribes a listener', async () => {
      const { session } = observed();
      let calls = 0;
      const unsubscribe = session.subscribe(() => {
        calls += 1;
      });
      unsubscribe();
      await session.connect(new TestProvider());
      expect(calls).toBe(0);
    });
  });
});
