import { DA_REGISTRY_TEMPLATES } from '../../../src/da-registry/templates';
import { CANTON_COIN_METADATA } from '../../../src/wallets/amulet/constants';
import { createAmuletRegistry } from '../../../src/wallets/amulet/registry';
import { WalletError } from '../../../src/wallets/errors';
import { holdingViewOf, readHoldingView, readHoldingViewLock } from '../../../src/wallets/holding-view';
import { instrumentBalances, parseHolding } from '../../../src/wallets/holdings';
import type { ActiveContract } from '../../../src/wallets/types';
import { createWallet, type WalletInternalOptions } from '../../../src/wallets/wallet';
import {
  AMULET_LOCK,
  amuletHolding,
  daHolding,
  DSO,
  fakeFetch,
  fakeProvider,
  HOLDER,
  HOLDING_V1_VIEW_KEY,
  INSTRUMENT,
  NOW,
  OPERATOR,
  OTHER,
  REGISTRAR,
  type FetchCall,
} from './helpers';
import type { FetchLike } from '../../../src/wallets/da-utilities/client';

const CC = { admin: DSO, id: 'Amulet' } as const;
const SCAN = 'https://scan.example/api/scan';

describe('HoldingV1 view parsing', () => {
  const view = {
    owner: HOLDER,
    instrumentId: CC,
    amount: '12.5000000000',
    lock: null,
    meta: { values: { k: 'v' } },
  };

  it('reads a view and refuses a malformed one', () => {
    expect(readHoldingView(view)).toEqual({ ...view, meta: { values: { k: 'v' } } });
    expect(readHoldingView({ ...view, amount: 12.5 })).toBeUndefined();
    expect(readHoldingView({ ...view, owner: '' })).toBeUndefined();
    expect(readHoldingView({ ...view, instrumentId: { admin: DSO } })).toBeUndefined();
    expect(readHoldingView({ ...view, meta: { values: { k: 1 } } })).toBeUndefined();
    expect(readHoldingView({ ...view, lock: { holders: [7] } })).toBeUndefined();
    expect(readHoldingView(null)).toBeUndefined();
  });

  it('reads a lock, and keeps a metadata key like __proto__ as plain data', () => {
    expect(readHoldingViewLock(AMULET_LOCK)).toEqual(AMULET_LOCK);
    expect(readHoldingViewLock({ ...AMULET_LOCK, expiresAfter: { microseconds: '10' } })?.expiresAfter).toEqual({
      microseconds: '10',
    });
    expect(readHoldingViewLock({ ...AMULET_LOCK, expiresAfter: { microseconds: '1.5' } })).toBeUndefined();
    const parsed = readHoldingView({ ...view, meta: JSON.parse('{"values":{"__proto__":"x"}}') as unknown });
    expect(Object.getPrototypeOf(parsed?.meta.values)).toBeNull();
    expect(Object.entries(parsed?.meta.values ?? {})).toEqual([['__proto__', 'x']]);
  });

  it('takes the one computed HoldingV1 view, by Module:Entity', () => {
    expect(holdingViewOf(amuletHolding('00a', '1'))?.amount).toBe('1');
    expect(holdingViewOf(amuletHolding('00a', '1', { viewStatusCode: 9 }))).toBeUndefined();
    expect(holdingViewOf({})).toBeUndefined();
    const twice = amuletHolding('00a', '1');
    expect(holdingViewOf({ interfaceViews: [...(twice.interfaceViews ?? []), ...(twice.interfaceViews ?? [])] })).toBe(
      undefined
    );
  });
});

describe('parseHolding: Canton Coin', () => {
  it('reads an Amulet through its view, signed by the DSO and the owner', () => {
    expect(parseHolding(amuletHolding('00cc', '25.0000000000'))).toEqual({
      contractId: '00cc',
      owner: HOLDER,
      instrumentId: CC,
      amount: '25.0000000000',
      locked: false,
      synchronizerId: 'global-domain::1220ee',
      source: 'amulet',
      meta: {
        'amulet.splice.lfdecentralizedtrust.org/created-in-round': '42',
        'amulet.splice.lfdecentralizedtrust.org/rate-per-round': '0.0000190259',
      },
    });
  });

  it('reads a LockedAmulet as locked', () => {
    const holding = parseHolding(amuletHolding('00lcc', '4', { lock: AMULET_LOCK }));
    expect(holding).toMatchObject({ locked: true, source: 'amulet', amount: '4' });
  });

  it('fails closed on look-alikes and inconsistent views', () => {
    // Not signed by the DSO, or not by the owner.
    expect(parseHolding(amuletHolding('00a', '1', { signatories: [HOLDER] }))).toBeNull();
    expect(parseHolding(amuletHolding('00a', '1', { signatories: [DSO] }))).toBeNull();
    // Splice's names in another package.
    expect(parseHolding(amuletHolding('00a', '1', { packageName: 'evil-amulet' }))).toBeNull();
    // Another instrument id, an unreadable amount, a failed view, no view.
    expect(parseHolding(amuletHolding('00a', '1', { instrumentIdText: 'NotAmulet' }))).toBeNull();
    expect(parseHolding(amuletHolding('00a', '1e3'))).toBeNull();
    expect(parseHolding(amuletHolding('00a', '1', { viewStatusCode: 1 }))).toBeNull();
    expect(parseHolding({ ...amuletHolding('00a', '1'), interfaceViews: [] })).toBeNull();
    // An Amulet whose view claims a lock, and a LockedAmulet whose view claims none.
    const unlockedView = amuletHolding('00a', '1').interfaceViews ?? [];
    const lockedTemplate = amuletHolding('00b', '1', { lock: AMULET_LOCK });
    expect(parseHolding({ ...lockedTemplate, interfaceViews: unlockedView })).toBeNull();
    const lockedView = lockedTemplate.interfaceViews ?? [];
    expect(parseHolding({ ...amuletHolding('00a', '1'), interfaceViews: lockedView })).toBeNull();
  });

  it('keeps reading a DA holding from its create argument, also when a view came with it', () => {
    const withView: ActiveContract = {
      ...daHolding('00h', '5'),
      interfaceViews: amuletHolding('00h', '999').interfaceViews ?? [],
    };
    expect(parseHolding(withView)).toMatchObject({ amount: '5', instrumentId: INSTRUMENT, source: 'da-registry' });
  });

  it('sums Canton Coin with locked and available apart', () => {
    const holdings = [
      amuletHolding('00a', '10'),
      amuletHolding('00b', '2.5'),
      amuletHolding('00c', '4', { lock: AMULET_LOCK }),
    ].flatMap((c) => {
      const h = parseHolding(c);
      return h === null ? [] : [h];
    });
    expect(instrumentBalances(holdings)).toEqual([
      {
        key: `Amulet@${DSO}`,
        instrumentId: CC,
        unlocked: '12.5000000000',
        locked: '4.0000000000',
        holdingCount: 3,
        source: 'amulet',
      },
    ]);
  });
});

describe('createAmuletRegistry', () => {
  const answers = (call: FetchCall): { status?: number; json?: unknown } => {
    if (call.url === `${SCAN}/registry/metadata/v1/info`) return { json: { adminId: DSO, supportedApis: {} } };
    if (call.url === `${SCAN}/registry/metadata/v1/instruments/Amulet`) {
      return { json: { id: 'Amulet', name: 'Canton Coin', symbol: 'CC', decimals: 10, supportedApis: {} } };
    }
    return { status: 404, json: {} };
  };

  it('never asks the registry for a pinned DSO, and describes only its Amulet', async () => {
    const { fetch, calls } = fakeFetch(answers);
    const registry = createAmuletRegistry('devnet', { dsoParty: DSO, registryUrl: SCAN, fetch });
    expect(await registry.dsoParty()).toBe(DSO);
    expect(await registry.instrumentMetadata({ admin: OTHER, id: 'Amulet' })).toBeUndefined();
    expect(await registry.instrumentMetadata({ admin: DSO, id: 'XMPL' })).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("learns the DSO from the registry's adminId, once, and reads the metadata from the registry", async () => {
    const { fetch, calls } = fakeFetch(answers);
    const registry = createAmuletRegistry('devnet', { registryUrl: `${SCAN}/`, fetch });
    expect(await registry.dsoParty()).toBe(DSO);
    expect(await registry.instrumentMetadata(CC)).toEqual({ name: 'Canton Coin', symbol: 'CC', decimals: 10 });
    expect(await registry.instrumentMetadata(CC)).toEqual({ name: 'Canton Coin', symbol: 'CC', decimals: 10 });
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ['GET', `${SCAN}/registry/metadata/v1/info`],
      ['GET', `${SCAN}/registry/metadata/v1/instruments/Amulet`],
    ]);
  });

  it('labels nothing Canton Coin while the registry fails, and asks again only after a back-off', async () => {
    let status = 503;
    let clock = 0;
    const { fetch, calls } = fakeFetch((call) => (status === 200 ? answers(call) : { status, json: {} }));
    const registry = createAmuletRegistry('devnet', { registryUrl: SCAN, fetch }, { now: () => clock });
    expect(await registry.dsoParty()).toBeUndefined();
    expect(await registry.instrumentMetadata(CC)).toBeUndefined();
    status = 200;
    // Within the back-off the registry is not asked again.
    expect(await registry.dsoParty()).toBeUndefined();
    expect(calls.filter((c) => c.url.endsWith('/info'))).toHaveLength(1);
    clock = 30_000;
    expect(await registry.dsoParty()).toBe(DSO);
    expect(calls.filter((c) => c.url.endsWith('/info'))).toHaveLength(2);
  });

  it('defaults to globalThis.fetch, never a DA registry fetch', async () => {
    const original = globalThis.fetch;
    const seen: string[] = [];
    globalThis.fetch = (async (url: string) => {
      seen.push(url);
      return new Response(JSON.stringify({ adminId: DSO }), { status: 200 });
    }) as typeof globalThis.fetch;
    try {
      expect(await createAmuletRegistry('devnet', { registryUrl: SCAN }).dsoParty()).toBe(DSO);
      expect(seen).toEqual([`${SCAN}/registry/metadata/v1/info`]);
    } finally {
      globalThis.fetch = original;
    }
  });

  describe('a hanging registry', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('waits a short time, aborts the request after its timeout, then backs off', async () => {
      let clock = 0;
      const signals: AbortSignal[] = [];
      const fetch: FetchLike = async (_url, init) => {
        if (init.signal !== undefined) signals.push(init.signal);
        return new Promise<never>(() => undefined);
      };
      const registry = createAmuletRegistry('devnet', { registryUrl: SCAN, fetch }, { now: () => clock });
      const first = registry.dsoParty();
      await jest.advanceTimersByTimeAsync(1500);
      expect(await first).toBeUndefined();
      expect(signals).toHaveLength(1);
      expect(signals[0]?.aborted).toBe(false);
      // A second caller joins the request still in flight rather than starting another.
      const second = registry.dsoParty();
      await jest.advanceTimersByTimeAsync(3500);
      expect(await second).toBeUndefined();
      expect(signals[0]?.aborted).toBe(true);
      expect(await registry.dsoParty()).toBeUndefined();
      expect(signals).toHaveLength(1);
      clock = 30_000;
      const retried = registry.dsoParty();
      await jest.advanceTimersByTimeAsync(1500);
      await retried;
      expect(signals).toHaveLength(2);
      await jest.advanceTimersByTimeAsync(5000);
    });
  });

  it('falls back to the built-in metadata for a pinned DSO when the registry does not answer', async () => {
    const { fetch } = fakeFetch(() => ({ text: 'not json' }));
    const registry = createAmuletRegistry('devnet', { dsoParty: DSO, registryUrl: SCAN, fetch });
    expect(await registry.instrumentMetadata(CC)).toEqual(CANTON_COIN_METADATA);
  });
});

describe('createWallet.loadState: Canton Coin', () => {
  const OTHER_DSO = 'DSO::1220ffff';
  const contracts = (): Record<string, ActiveContract[]> => {
    const da = daHolding('00h10', '10');
    const ccHoldings = [
      amuletHolding('00cc10', '10.0000000000'),
      amuletHolding('00cc2', '2.5000000000'),
      amuletHolding('00cclocked', '4.0000000000', { lock: AMULET_LOCK }),
      amuletHolding('00ccother', '99', { owner: OTHER }),
      amuletHolding('00ccforged', '1000', { signatories: [HOLDER] }),
      amuletHolding('00ccdso2', '7', { dso: OTHER_DSO }),
    ];
    return {
      [DA_REGISTRY_TEMPLATES.holding]: [da],
      // The DA holding implements HoldingV1 too; the ledger returns it once.
      [HOLDING_V1_VIEW_KEY]: [da, ...ccHoldings],
    };
  };

  function setup(
    cantonCoin: WalletInternalOptions['cantonCoin'] = {},
    extra: Record<string, ActiveContract[]> = {}
  ): {
    load: () => ReturnType<ReturnType<typeof createWallet>['loadState']>;
    wallet: ReturnType<typeof createWallet>;
    calls: FetchCall[];
  } {
    const { fetch, calls } = fakeFetch((call) => {
      if (call.url.endsWith('/api/utilities/v0/operator')) return { json: { partyId: OPERATOR } };
      if (call.url.startsWith(SCAN)) {
        if (call.url.endsWith('/info')) return { json: { adminId: DSO } };
        return { json: { id: 'Amulet', name: 'Canton Coin', symbol: 'CC', decimals: 10 } };
      }
      if (call.url.includes('/metadata/v1/instruments/')) {
        return { json: { id: 'XMPL', name: 'Example', symbol: 'XMPL', decimals: 2 } };
      }
      return { status: 404, json: {} };
    });
    const options: WalletInternalOptions = {
      provider: fakeProvider({ ...contracts(), ...extra }),
      partyId: HOLDER,
      network: 'devnet',
      registry: { fetch },
      now: () => NOW,
      cantonCoin: cantonCoin === false ? false : { fetch, registryUrl: SCAN, ...cantonCoin },
    };
    const wallet = createWallet(options);
    return { load: async () => wallet.loadState(), wallet, calls };
  }

  it('lists Canton Coin with the other holdings, locked apart, of the DSO the registry names', async () => {
    const { load, calls } = setup();
    const state = await load();
    expect(state.cantonCoinUnavailable).toBe(false);
    expect(state.holdings.map((h) => [h.contractId, h.source, h.locked])).toEqual([
      ['00h10', 'da-registry', false],
      ['00cc10', 'amulet', false],
      ['00cc2', 'amulet', false],
      ['00cclocked', 'amulet', true],
    ]);
    expect(state.balances).toEqual([
      {
        key: `Amulet@${DSO}`,
        instrumentId: CC,
        unlocked: '12.5000000000',
        locked: '4.0000000000',
        holdingCount: 3,
        source: 'amulet',
        metadata: { name: 'Canton Coin', symbol: 'CC', decimals: 10 },
      },
      {
        key: 'XMPL@registrar::1220bb',
        instrumentId: INSTRUMENT,
        unlocked: '10.0000000000',
        locked: '0.0000000000',
        holdingCount: 1,
        source: 'da-registry',
        metadata: { name: 'Example', symbol: 'XMPL', decimals: 2 },
      },
    ]);
    // Canton Coin metadata comes from the DSO's registry, never DA's.
    expect(calls.filter((c) => c.url.includes('/registrars/'))).toHaveLength(1);
  });

  it("keeps only the pinned DSO's Canton Coin, and never asks the registry for the DSO", async () => {
    const { load, calls } = setup({ dsoParty: OTHER_DSO });
    const state = await load();
    expect(state.holdings.filter((h) => h.source === 'amulet').map((h) => h.contractId)).toEqual(['00ccdso2']);
    expect(state.balances.find((b) => b.source === 'amulet')).toMatchObject({
      instrumentId: { admin: OTHER_DSO, id: 'Amulet' },
      unlocked: '7.0000000000',
      metadata: CANTON_COIN_METADATA,
    });
    expect(calls.some((c) => c.url.endsWith('/registry/metadata/v1/info'))).toBe(false);
  });

  it('reads no Canton Coin with cantonCoin: false, and never asks the registry', async () => {
    const { load, calls } = setup(false);
    const state = await load();
    expect(state.holdings.map((h) => h.source)).toEqual(['da-registry']);
    expect(state.cantonCoinUnavailable).toBe(false);
    expect(calls.some((c) => c.url.startsWith(SCAN))).toBe(false);
  });

  it('never asks the registry for a party without Canton Coin', async () => {
    const { fetch, calls } = fakeFetch((call) =>
      call.url.endsWith('/operator')
        ? { json: { partyId: OPERATOR } }
        : { json: { id: 'XMPL', name: 'Example', symbol: 'XMPL', decimals: 2 } }
    );
    const wallet = createWallet({
      provider: fakeProvider({ [DA_REGISTRY_TEMPLATES.holding]: [daHolding('00h10', '10')] }),
      partyId: HOLDER,
      network: 'devnet',
      registry: { fetch },
      cantonCoin: { fetch },
      now: () => NOW,
    } as WalletInternalOptions);
    const state = await wallet.loadState();
    expect(state.cantonCoinUnavailable).toBe(false);
    expect(calls.some((c) => c.url.includes('sync.global'))).toBe(false);
  });

  it('lists no Canton Coin while a named registry cannot confirm the DSO (never every DSO)', async () => {
    const failing = fakeFetch((call) => {
      if (call.url.endsWith('/api/utilities/v0/operator')) return { json: { partyId: OPERATOR } };
      if (call.url.startsWith(SCAN)) return { status: 503, json: {} };
      return { json: { id: 'XMPL', name: 'Example', symbol: 'XMPL', decimals: 2 } };
    });
    const wallet = createWallet({
      provider: fakeProvider(contracts()),
      partyId: HOLDER,
      network: 'devnet',
      registry: { fetch: failing.fetch },
      cantonCoin: { registryUrl: SCAN, fetch: failing.fetch },
      now: () => NOW,
    } as WalletInternalOptions);
    const state = await wallet.loadState();
    expect(state.holdings.map((h) => [h.contractId, h.source])).toEqual([['00h10', 'da-registry']]);
    expect(state.balances.map((b) => b.source)).toEqual(['da-registry']);
    expect(state.cantonCoinUnavailable).toBe(true);
  });

  it('does not let a hanging registry hold the snapshot for its full timeout', async () => {
    jest.useFakeTimers();
    try {
      const da = fakeFetch((call) =>
        call.url.endsWith('/operator')
          ? { json: { partyId: OPERATOR } }
          : { json: { id: 'XMPL', name: 'Example', symbol: 'XMPL', decimals: 2 } }
      ).fetch;
      const hanging: FetchLike = async (url, init) =>
        url.startsWith(SCAN) ? new Promise<never>(() => undefined) : da(url, init);
      const wallet = createWallet({
        provider: fakeProvider(contracts()),
        partyId: HOLDER,
        network: 'devnet',
        registry: { fetch: hanging },
        cantonCoin: { registryUrl: SCAN, fetch: hanging },
        now: () => NOW,
      } as WalletInternalOptions);
      let settled = false;
      const load = wallet.loadState().finally(() => {
        settled = true;
      });
      await jest.advanceTimersByTimeAsync(1500);
      expect(settled).toBe(true);
      const state = await load;
      // The look-alike from another DSO, and every Amulet, is left out while the DSO is unconfirmed.
      expect(state.holdings.filter((h) => h.source === 'amulet')).toEqual([]);
      await jest.advanceTimersByTimeAsync(5000);
    } finally {
      jest.useRealTimers();
    }
  });

  it('refuses a Canton Coin transfer or burn the party holds no DA holding of, after reading its holdings', async () => {
    const { wallet } = setup();
    await expect(wallet.planTransfer({ receiver: OTHER, instrumentId: CC, amount: '1' })).rejects.toThrow(
      /Canton Coin \(Amulet\) cannot be transferred/
    );
    await expect(wallet.requestBurn({ instrumentId: CC, amount: '1' })).rejects.toThrow(/cannot be burned/);
  });

  it("keeps a DA Registry instrument a registrar named 'Amulet' transferable and burnable", async () => {
    const daAmulet = daHolding('00hamulet', '5', { instrument: { source: REGISTRAR, id: 'Amulet' } });
    const { wallet, calls } = setup({ dsoParty: DSO }, { [DA_REGISTRY_TEMPLATES.holding]: [daAmulet] });
    const instrumentId = { admin: REGISTRAR, id: 'Amulet' };
    // Past the Canton Coin refusal: the request reaches DA's registry (which this fake does not answer).
    await expect(wallet.planTransfer({ receiver: OTHER, instrumentId, amount: '1' })).rejects.not.toThrow(
      /Canton Coin/
    );
    await expect(wallet.requestBurn({ instrumentId, amount: '1' })).rejects.not.toThrow(/Canton Coin/);
    expect(calls.map((c) => c.url.split('/').pop())).toEqual(expect.arrayContaining(['transfer-factory']));
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2);
  });

  it('refuses a Canton Coin transfer or burn before any read', async () => {
    const { wallet } = setup({ dsoParty: DSO });
    await expect(wallet.planTransfer({ receiver: OTHER, instrumentId: CC, amount: '1' })).rejects.toThrow(
      new WalletError(
        'invalid-input',
        'Canton Coin (Amulet) cannot be transferred through this wallet yet; nothing was submitted'
      )
    );
    await expect(wallet.requestBurn({ instrumentId: CC, amount: '1' })).rejects.toThrow(/cannot be burned/);
  });
});
