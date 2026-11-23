/** Wallet options: Loop's one-network-per-page-load gate and retry, and the installed extensions as options. */
import {
  describeWalletError,
  extensionWalletOptions,
  isWalletOptionError,
  loopWalletOption,
  WalletOptionError,
  type Cip103DiscoveryHost,
  type Cip103Provider,
  type DaNetwork,
  type LoopSdkLike,
} from '../../../src/wallets';
import { deferred, TestProvider } from './session-helpers';

const signal = (): AbortSignal => new AbortController().signal;

/** A fake Loop SDK: records `init` calls; `getCip103Provider` answers with one provider. */
function fakeLoop(): {
  sdk: LoopSdkLike;
  inits: Array<{ appName: string; network: DaNetwork }>;
  provider: Cip103Provider;
} {
  const provider = new TestProvider();
  const inits: Array<{ appName: string; network: DaNetwork }> = [];
  return {
    provider,
    inits,
    sdk: {
      init: (options) => {
        inits.push({ ...options });
      },
      getCip103Provider: () => provider,
    },
  };
}

describe('loopWalletOption', () => {
  it('is the loop option, available everywhere until set up', () => {
    const loop = loopWalletOption({ appName: 'App', load: async () => fakeLoop().sdk });
    expect(loop).toMatchObject({ mode: 'load', key: 'loop', kind: 'loop', name: 'Loop' });
    expect(loop.setUpFor()).toBeNull();
    expect(loop.availability('devnet')).toEqual({ available: true });
    expect(loop.availability('mainnet')).toEqual({ available: true });
  });

  it('sets Loop up once for the first network and shares the setup between loads', async () => {
    const fake = fakeLoop();
    let imports = 0;
    const loop = loopWalletOption({
      appName: 'Fairmint',
      load: async () => {
        imports += 1;
        return fake.sdk;
      },
    });
    const [a, b] = await Promise.all([loop.load('devnet', signal()), loop.load('devnet', signal())]);
    expect(a).toBe(fake.provider);
    expect(b).toBe(fake.provider);
    expect(imports).toBe(1);
    expect(fake.inits).toEqual([{ appName: 'Fairmint', network: 'devnet' }]);
    expect(loop.setUpFor()).toBe('devnet');
  });

  it('asks for a reload for another network in the same page load', async () => {
    const loop = loopWalletOption({ appName: 'App', load: async () => fakeLoop().sdk });
    await loop.load('devnet', signal());
    expect(loop.availability('devnet')).toEqual({ available: true });
    expect(loop.availability('mainnet')).toEqual({ available: false, reason: 'reload-required', setUpFor: 'devnet' });
    const refused: unknown = await loop.load('mainnet', signal()).catch((error: unknown) => error);
    expect(isWalletOptionError(refused)).toBe(true);
    expect(refused).toMatchObject({ code: 'reload-required', setUpFor: 'devnet', requested: 'mainnet' });
    expect(describeWalletError(refused)).toMatchObject({ kind: 'refused', code: 'reload-required' });
  });

  it('forgets a failed setup, so the next load tries again (also for another network)', async () => {
    const fake = fakeLoop();
    let fail = true;
    const loop = loopWalletOption({
      appName: 'App',
      load: async () => {
        if (fail) throw new Error('chunk failed to load');
        return fake.sdk;
      },
    });
    const failed: unknown = await loop.load('devnet', signal()).catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(WalletOptionError);
    expect(failed).toMatchObject({ code: 'setup-failed', requested: 'devnet' });
    expect((failed as WalletOptionError).cause).toEqual(new Error('chunk failed to load'));
    expect(describeWalletError(failed)).toMatchObject({ kind: 'other', code: 'setup-failed' });
    expect(describeWalletError(failed).message).toMatch(/chunk failed to load/);
    expect(loop.setUpFor()).toBeNull();
    fail = false;
    expect(await loop.load('mainnet', signal())).toBe(fake.provider);
    expect(loop.setUpFor()).toBe('mainnet');
  });

  it('stops one caller waiting on its signal without stopping the setup others share', async () => {
    const fake = fakeLoop();
    const sdk = deferred<LoopSdkLike>();
    const loop = loopWalletOption({ appName: 'App', load: async () => sdk.promise });
    const controller = new AbortController();
    const first = loop.load('devnet', controller.signal);
    const second = loop.load('devnet', signal());
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    sdk.resolve(fake.sdk);
    expect(await second).toBe(fake.provider);
    // An already aborted signal starts nothing.
    const fresh = loopWalletOption({ appName: 'App', load: async () => fakeLoop().sdk });
    await expect(fresh.load('devnet', AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' });
    expect(fresh.setUpFor()).toBeNull();
  });
});

describe('WalletOptionError', () => {
  it('describes an unsupported network as refused, with its code', () => {
    const error = new WalletOptionError('unsupported-network', { requested: 'mainnet' });
    expect(describeWalletError(error)).toMatchObject({ kind: 'refused', code: 'unsupported-network' });
    expect(error.message).toMatch(/mainnet/);
  });

  it('is recognised across copies of the module by its brand', () => {
    const copy = Object.create(null) as Record<symbol, unknown>;
    Object.defineProperty(copy, Symbol.for('@fairmint/canton-node-sdk/wallets.error'), { value: 'WalletOptionError' });
    expect(isWalletOptionError(copy)).toBe(true);
    expect(isWalletOptionError(new Error('x'))).toBe(false);
  });
});

describe('extensionWalletOptions', () => {
  it('offers each announcing extension as an extension:<id> option that loads its provider', async () => {
    const target = new EventTarget();
    target.addEventListener('canton:requestProvider', () => {
      target.dispatchEvent(
        new CustomEvent('canton:announceProvider', {
          detail: { id: 'send', name: 'Send', icon: 'data:image/png;base64,AA==' },
        })
      );
    });
    const host: Cip103DiscoveryHost = {
      addEventListener: (type, listener) => target.addEventListener(type, listener),
      removeEventListener: (type, listener) => target.removeEventListener(type, listener),
      dispatchEvent: (event) => target.dispatchEvent(event),
      postMessage: () => undefined,
    };
    const options = await extensionWalletOptions({ host, waitMs: 5 });
    expect(options).toHaveLength(1);
    const [option] = options;
    expect(option).toMatchObject({
      mode: 'load',
      key: 'extension:send',
      kind: 'extension',
      name: 'Send',
      icon: 'data:image/png;base64,AA==',
    });
    expect(option?.availability('mainnet')).toEqual({ available: true });
    const provider = await option?.load('devnet', signal());
    expect(typeof provider?.request).toBe('function');
  });

  it('finds nothing outside a browser', async () => {
    expect(await extensionWalletOptions({ waitMs: 1 })).toEqual([]);
  });
});
