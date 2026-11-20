/**
 * `discoverCip103Wallets`: the dApp SDK's announce handshake (each announcing extension, several at once; the `canton`
 * global only when none announces), its message channel for a standard wallet, and Console Wallet reached through its
 * injected provider with its corrections. Ported from canton-explorer's extension wallet tests (#319).
 */
import type { Cip103Provider } from '../../../src/wallets/cip103';
import { discoverCip103Wallets, type Cip103DiscoveryHost, type DiscoveredWallet } from '../../../src/wallets/discovery';

const PARTY = `alice::1220${'a'.repeat(64)}`;
const CONSOLE_ID = 'lpnfhpbpmlobjlgkdmnjieeihjmihhjd';

interface FakeExtension {
  /** Its `canton:announceProvider` detail; omitted, it does not announce. */
  readonly announce?: { id: string; name: string; icon?: string; target?: string };
  /** Answers over the message channel to its target; omitted, it never answers. */
  readonly answer?: (method: string, params: unknown) => unknown;
}

type FakeHost = Cip103DiscoveryHost & {
  canton?: unknown;
  readonly posted: unknown[];
  /** Post a message to the page, as an extension's content script does (`source`: the page itself unless given). */
  emit(data: unknown, ...source: [] | [unknown]): void;
};

/** A page with `extensions` installed and `canton` injected. */
function browser(options: { canton?: unknown; extensions?: readonly FakeExtension[] } = {}): FakeHost {
  const target = new EventTarget();
  const extensions = options.extensions ?? [];
  const posted: unknown[] = [];
  const emit = (data: unknown, ...sourceArg: [] | [unknown]): void => {
    setTimeout(() => {
      const event = new MessageEvent('message', { data });
      // A browser sets `source` to the posting window; Node's MessageEvent accepts only a port there.
      Object.defineProperty(event, 'source', { value: sourceArg.length > 0 ? sourceArg[0] : host });
      target.dispatchEvent(event);
    });
  };
  target.addEventListener('canton:requestProvider', () => {
    for (const extension of extensions) {
      if (extension.announce !== undefined) {
        target.dispatchEvent(new CustomEvent('canton:announceProvider', { detail: extension.announce }));
      }
    }
  });
  const host: FakeHost = {
    posted,
    emit,
    addEventListener: (type, listener) => target.addEventListener(type, listener),
    removeEventListener: (type, listener) => target.removeEventListener(type, listener),
    dispatchEvent: (event) => target.dispatchEvent(event),
    postMessage: (data) => {
      posted.push(data);
      emit(data);
      const message = data as {
        type?: string;
        target?: string;
        request?: { id?: string; method: string; params?: unknown };
      };
      if (message.type !== 'SPLICE_WALLET_REQUEST' || message.request === undefined) return;
      const extension = extensions.find((e) => (e.announce?.target ?? e.announce?.id) === message.target);
      if (extension?.answer === undefined) return;
      const { id, method, params } = message.request;
      let reply: Record<string, unknown>;
      try {
        reply = { result: extension.answer(method, params) };
      } catch (error) {
        const { code = -32603, message: text = String(error) } = error as { code?: number; message?: string };
        reply = { error: { code, message: text, data: { detail: 'x' } } };
      }
      emit({ type: 'SPLICE_WALLET_RESPONSE', response: { jsonrpc: '2.0', id, ...reply } });
    },
  };
  if (options.canton !== undefined) host.canton = options.canton;
  return host;
}

/** A wallet that follows CIP-0103, answering over its message channel. */
function standardWallet(id: string, name: string, networkId = 'canton:devnet'): FakeExtension & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    announce: { id, name, target: id, icon: 'data:image/png;base64,AA==' },
    answer: (method, params) => {
      calls.push(method);
      switch (method) {
        case 'getPrimaryAccount':
          return { partyId: PARTY, networkId, publicKey: 'key' };
        case 'ledgerApi':
          return [{ resource: (params as { resource: string }).resource }];
        case 'signMessage':
          return { signature: `signed:${(params as { message: string }).message}` };
        case 'connect':
          throw Object.assign(new Error('User declined'), { code: 4001 });
        default:
          throw Object.assign(new Error('Unsupported'), { code: 4200 });
      }
    },
  };
}

type RecordingFake = Cip103Provider & {
  readonly source: string;
  readonly requests: Array<{ method: string; params?: unknown }>;
};

/** Console Wallet's injected provider (1.15), as far as the corrections need it. */
function consoleFake(
  options: { networkId?: string; ledger?: Record<string, unknown>; failFirst?: unknown[]; source?: string } = {}
): RecordingFake {
  const requests: Array<{ method: string; params?: unknown }> = [];
  const failures = [...(options.failFirst ?? [])];
  return {
    source: options.source ?? 'consoleWallet',
    requests,
    request: async (request) => {
      const params = 'params' in request ? request.params : undefined;
      requests.push({ method: request.method, ...(params !== undefined && { params }) });
      switch (request.method) {
        case 'getPrimaryAccount': {
          const failure = failures.shift();
          if (failure !== undefined) throw failure;
          return { partyId: PARTY, publicKey: 'key', networkId: options.networkId ?? 'CANTON_NETWORK_DEV' };
        }
        case 'signMessage':
          return { signature: `signed-bytes:${Buffer.from(request.params.message, 'base64').toString('utf8')}` };
        case 'ledgerApi': {
          const raw = JSON.stringify(options.ledger?.[request.params.resource] ?? {});
          return { ...(JSON.parse(raw) as object), response: raw };
        }
        case 'connect':
        case 'disconnect':
        case 'isConnected':
        case 'prepareExecuteAndWait':
          throw new Error(`unexpected ${request.method}`);
      }
    },
    on: () => undefined,
    removeListener: () => undefined,
  };
}

/** Console as installed: it announces itself and injects `canton` (unless `canton` says otherwise). */
function consoleInstalled(
  fake: RecordingFake,
  canton: unknown = fake
): { canton: unknown; extensions: FakeExtension[] } {
  return {
    canton,
    extensions: [
      {
        announce: { id: CONSOLE_ID, name: 'Console Wallet', target: CONSOLE_ID },
        answer: () => {
          throw new Error("the page used Console's message channel");
        },
      },
    ],
  };
}

const discover = async (host: FakeHost): Promise<DiscoveredWallet[]> => discoverCip103Wallets({ host, waitMs: 5 });
const first = (wallets: DiscoveredWallet[]): DiscoveredWallet => {
  const [wallet] = wallets;
  if (wallet === undefined) throw new Error('no wallet');
  return wallet;
};

describe('discoverCip103Wallets', () => {
  it('finds nothing without extensions, or outside a browser', async () => {
    await expect(discover(browser())).resolves.toEqual([]);
    // Node has no page global with postMessage and dispatchEvent.
    await expect(discoverCip103Wallets({ waitMs: 1 })).resolves.toEqual([]);
  });

  it('offers every announcing extension, in order, each over its own channel', async () => {
    const send = standardWallet('send-ext', 'Send Connect');
    const other = standardWallet('other-ext', 'Other Wallet');
    const host = browser({ extensions: [send, other] });
    const found = await discover(host);
    expect(found.map((w) => [w.id, w.name, w.icon])).toEqual([
      ['send-ext', 'Send Connect', 'data:image/png;base64,AA=='],
      ['other-ext', 'Other Wallet', 'data:image/png;base64,AA=='],
    ]);
    const provider = await first(found).load('devnet');
    expect(await first(found).load('devnet')).toBe(provider);
    // A CIP-0103 wallet's answers pass through unchanged.
    await expect(
      provider.request({ method: 'ledgerApi', params: { requestMethod: 'get', resource: '/v2/state/ledger-end' } })
    ).resolves.toEqual([{ resource: '/v2/state/ledger-end' }]);
    await expect(provider.request({ method: 'signMessage', params: { message: 'hello' } })).resolves.toEqual({
      signature: 'signed:hello',
    });
    await expect(provider.request({ method: 'getPrimaryAccount' })).resolves.toEqual({
      partyId: PARTY,
      networkId: 'canton:devnet',
      publicKey: 'key',
    });
    // A wallet's error reaches the page with its code and data.
    await expect(provider.request({ method: 'connect' })).rejects.toMatchObject({
      code: 4001,
      message: 'User declined',
      data: { detail: 'x' },
    });
    expect(send.calls).toEqual(['ledgerApi', 'signMessage', 'getPrimaryAccount', 'connect']);
    expect(other.calls).toEqual([]);
    // The dApp SDK's wire format: a JSON-RPC 2.0 request with a fresh id, addressed to the wallet's target.
    const requests = host.posted.filter((m) => (m as { type?: string }).type === 'SPLICE_WALLET_REQUEST');
    expect(requests[0]).toEqual({
      type: 'SPLICE_WALLET_REQUEST',
      target: 'send-ext',
      request: {
        jsonrpc: '2.0',
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        method: 'ledgerApi',
        params: { requestMethod: 'get', resource: '/v2/state/ledger-end' },
      },
    });
    expect(new Set(requests.map((m) => (m as { request: { id: string } }).request.id)).size).toBe(requests.length);
  });

  it('returns the same wallet object when discovering again', async () => {
    const host = browser({ extensions: [standardWallet('send-ext', 'Send Connect')] });
    expect(first(await discover(host))).toBe(first(await discover(host)));
  });

  it("delivers the wallet's events to on() listeners, and stops after removeListener", async () => {
    const host = browser({ extensions: [standardWallet('send-ext', 'Send Connect')] });
    const provider = await first(await discover(host)).load('devnet');
    const seen: unknown[] = [];
    const listener = (payload: unknown): void => {
      seen.push(payload);
    };
    provider.on('accountsChanged', listener);
    const event = (to: string): unknown => ({
      type: 'SPLICE_WALLET_REQUEST',
      target: to,
      request: { jsonrpc: '2.0', method: 'accountsChanged', params: [{ partyId: PARTY }] },
    });
    host.emit(event('send-ext'));
    host.emit(event('other-ext'));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(seen).toEqual([[{ partyId: PARTY }]]);
    provider.removeListener('accountsChanged', listener);
    host.emit(event('send-ext'));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(seen).toHaveLength(1);
  });

  it('load() rejects with an AbortError when its signal already aborted, and works without one', async () => {
    const host = browser({ extensions: [standardWallet('send-ext', 'Send Connect')] });
    const wallet = first(await discover(host));
    const controller = new AbortController();
    controller.abort();
    await expect(wallet.load('devnet', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    await expect(wallet.load('devnet', { signal: new AbortController().signal })).resolves.toBeDefined();
  });

  it('ignores a notification posted by another window', async () => {
    const host = browser({ extensions: [standardWallet('send-ext', 'Send Connect')] });
    const provider = await first(await discover(host)).load('devnet');
    const seen: unknown[] = [];
    provider.on('statusChanged', (payload) => {
      seen.push(payload);
    });
    host.emit(
      {
        type: 'SPLICE_WALLET_REQUEST',
        target: 'send-ext',
        request: { jsonrpc: '2.0', method: 'statusChanged', params: { connection: { isConnected: false } } },
      },
      {} // a cross-origin iframe
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(seen).toEqual([]);
  });

  it('ignores a response posted by another window', async () => {
    // The wallet never answers: only a posted response can settle the request.
    const host = browser({ extensions: [{ announce: { id: 'mute-ext', name: 'Mute', target: 'mute-ext' } }] });
    const provider = await first(await discover(host)).load('devnet');
    const pending = provider.request({ method: 'isConnected' });
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    const { id } = (host.posted[host.posted.length - 1] as { request: { id: string } }).request;
    const response = {
      type: 'SPLICE_WALLET_RESPONSE',
      response: { jsonrpc: '2.0', id, result: { isConnected: false } },
    };
    host.emit(response, {}); // a cross-origin iframe
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);
    host.emit(response); // the page itself
    await expect(pending).resolves.toEqual({ isConnected: false });
  });

  it('refuses an extension on another network than the one loaded', async () => {
    const host = browser({ extensions: [standardWallet('send-ext', 'Send Connect', 'canton:mainnet')] });
    const provider = await first(await discover(host)).load('devnet');
    await expect(provider.request({ method: 'getPrimaryAccount' })).rejects.toMatchObject({
      code: 4901,
      message: expect.stringMatching(/Send Connect is on mainnet, not devnet/),
    });
  });

  it('uses the canton global only when no extension announces itself', async () => {
    const injected = consoleFake({ source: 'someWallet' });
    const found = await discover(browser({ canton: injected }));
    expect(found.map((w) => [w.id, w.name])).toEqual([['injected', 'someWallet']]);
    await (await first(found).load('devnet')).request({ method: 'getPrimaryAccount' });
    expect(injected.requests).toHaveLength(1);
    const withAnnouncer = browser({ canton: injected, extensions: [standardWallet('send-ext', 'Send Connect')] });
    expect((await discover(withAnnouncer)).map((w) => w.name)).toEqual(['Send Connect']);
  });

  it("reaches Console Wallet through its injected provider, never its channel, and refuses another wallet's", async () => {
    const fake = consoleFake();
    const [wallet] = await discover(browser(consoleInstalled(fake)));
    expect(wallet?.name).toBe('Console Wallet');
    await (await first([wallet as DiscoveredWallet]).load('devnet')).request({ method: 'getPrimaryAccount' });
    expect(fake.requests.map((r) => r.method)).toEqual(['getPrimaryAccount']);
    const taken = await discover(browser(consoleInstalled(fake, consoleFake({ source: 'someWallet' }))));
    await expect(first(taken).load('devnet')).rejects.toThrow(
      /Another wallet extension holds the page's canton provider, which Console Wallet needs/
    );
    // Only Console injected, without announcing.
    const injectedOnly = await discover(browser({ canton: consoleFake() }));
    expect(injectedOnly.map((w) => [w.id, w.name])).toEqual([['injected:console', 'Console Wallet']]);
  });

  it('Console: signs the base64 of the message bytes, and answers the Ledger API body, a list included', async () => {
    const contracts = [{ contractEntry: { a: 1 } }, { contractEntry: { b: 2 } }];
    const fake = consoleFake({
      ledger: { '/v2/state/ledger-end': { offset: 42 }, '/v2/state/active-contracts': contracts },
    });
    const provider = await first(await discover(browser(consoleInstalled(fake)))).load('devnet');
    await expect(provider.request({ method: 'signMessage', params: { message: 'héllo' } })).resolves.toEqual({
      signature: 'signed-bytes:héllo',
    });
    expect(fake.requests[0]).toEqual({
      method: 'signMessage',
      params: { message: Buffer.from('héllo', 'utf8').toString('base64') },
    });
    await expect(
      provider.request({ method: 'ledgerApi', params: { requestMethod: 'get', resource: '/v2/state/ledger-end' } })
    ).resolves.toEqual({ offset: 42 });
    await expect(
      provider.request({
        method: 'ledgerApi',
        params: { requestMethod: 'post', resource: '/v2/state/active-contracts', body: {} },
      })
    ).resolves.toEqual(contracts);
  });

  it("Console: names the account's network as CIP-0103 does, and refuses another network", async () => {
    const provider = await first(await discover(browser(consoleInstalled(consoleFake())))).load('devnet');
    await expect(provider.request({ method: 'getPrimaryAccount' })).resolves.toMatchObject({
      networkId: 'canton:devnet',
    });
    const test = await first(
      await discover(browser(consoleInstalled(consoleFake({ networkId: 'CANTON_NETWORK_TEST' }))))
    ).load('mainnet');
    await expect(test.request({ method: 'getPrimaryAccount' })).rejects.toThrow(
      /Console Wallet is on testnet, not mainnet/
    );
  });

  it('retries an account read the wallet timed out (-32002), and nothing else', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask'] });
    try {
      const unavailable = { code: -32002, message: 'Resource unavailable.' };
      const slow = consoleFake({ failFirst: [unavailable, unavailable] });
      const host = browser(consoleInstalled(slow));
      const found = discoverCip103Wallets({ host, waitMs: 5 });
      await jest.advanceTimersByTimeAsync(5);
      const read = first(await found)
        .load('devnet')
        .then(async (p) => p.request({ method: 'getPrimaryAccount' }));
      await jest.advanceTimersByTimeAsync(1300);
      await expect(read).resolves.toMatchObject({ partyId: PARTY });
      expect(slow.requests).toHaveLength(3);
    } finally {
      jest.useRealTimers();
    }
    const declined = consoleFake({ failFirst: [Object.assign(new Error('No account'), { code: 4001 })] });
    const provider = await first(await discover(browser(consoleInstalled(declined)))).load('devnet');
    await expect(provider.request({ method: 'getPrimaryAccount' })).rejects.toThrow('No account');
    expect(declined.requests).toHaveLength(1);
  });

  it('cancels with an AbortError, and refuses a bad wait', async () => {
    const controller = new AbortController();
    const pending = discoverCip103Wallets({ host: browser(), waitMs: 1000, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await expect(discoverCip103Wallets({ host: browser(), waitMs: -1 })).rejects.toThrow(TypeError);
  });
});
