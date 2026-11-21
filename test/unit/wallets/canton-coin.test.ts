import { DA_REGISTRY_TEMPLATES } from '../../../src/da-registry/templates';
import { CANTON_COIN_METADATA } from '../../../src/wallets/amulet';
import { createAmuletRegistry } from '../../../src/wallets/amulet-registry';
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
  type FetchCall,
} from './helpers';

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

  it('knows no DSO and no metadata without options, and makes no request', async () => {
    const { fetch, calls } = fakeFetch(answers);
    const registry = createAmuletRegistry({}, fetch);
    expect(await registry.dsoParty()).toBeUndefined();
    expect(await registry.instrumentMetadata(CC)).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it('uses a pinned DSO, with built-in metadata when no registry is named', async () => {
    const registry = createAmuletRegistry({ dsoParty: DSO });
    expect(await registry.dsoParty()).toBe(DSO);
    expect(await registry.instrumentMetadata(CC)).toEqual(CANTON_COIN_METADATA);
    expect(await registry.instrumentMetadata({ admin: OTHER, id: 'Amulet' })).toBeUndefined();
    expect(await registry.instrumentMetadata({ admin: DSO, id: 'XMPL' })).toBeUndefined();
  });

  it("learns the DSO from the registry's adminId, once, and reads the metadata from the registry", async () => {
    const { fetch, calls } = fakeFetch(answers);
    const registry = createAmuletRegistry({ registryUrl: `${SCAN}/`, fetch });
    expect(await registry.dsoParty()).toBe(DSO);
    expect(await registry.instrumentMetadata(CC)).toEqual({ name: 'Canton Coin', symbol: 'CC', decimals: 10 });
    expect(await registry.instrumentMetadata(CC)).toEqual({ name: 'Canton Coin', symbol: 'CC', decimals: 10 });
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ['GET', `${SCAN}/registry/metadata/v1/info`],
      ['GET', `${SCAN}/registry/metadata/v1/instruments/Amulet`],
    ]);
  });

  it('labels nothing Canton Coin while the registry fails, and asks again next time', async () => {
    let status = 503;
    const { fetch, calls } = fakeFetch((call) => (status === 200 ? answers(call) : { status, json: {} }));
    const registry = createAmuletRegistry({ registryUrl: SCAN, fetch });
    expect(await registry.dsoParty()).toBeUndefined();
    expect(await registry.instrumentMetadata(CC)).toBeUndefined();
    status = 200;
    expect(await registry.dsoParty()).toBe(DSO);
    expect(calls.filter((c) => c.url.endsWith('/info'))).toHaveLength(3);
  });

  it('falls back to the built-in metadata for a pinned DSO when the registry does not answer', async () => {
    const { fetch } = fakeFetch(() => ({ text: 'not json' }));
    const registry = createAmuletRegistry({ dsoParty: DSO, registryUrl: SCAN, fetch });
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

  function setup(cantonCoin?: WalletInternalOptions['cantonCoin']): {
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
      provider: fakeProvider(contracts()),
      partyId: HOLDER,
      network: 'devnet',
      registry: { fetch },
      now: () => NOW,
      ...(cantonCoin !== undefined && { cantonCoin }),
    };
    const wallet = createWallet(options);
    return { load: async () => wallet.loadState(), wallet, calls };
  }

  it('lists Canton Coin with the other holdings, locked apart, of the DSO the registry names', async () => {
    const { load, calls } = setup({ registryUrl: SCAN });
    const state = await load();
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

  it('keeps only the pinned DSO and labels it with the built-in metadata', async () => {
    const { load, calls } = setup({ dsoParty: OTHER_DSO });
    const state = await load();
    expect(state.holdings.filter((h) => h.source === 'amulet').map((h) => h.contractId)).toEqual(['00ccdso2']);
    expect(state.balances.find((b) => b.source === 'amulet')).toMatchObject({
      instrumentId: { admin: OTHER_DSO, id: 'Amulet' },
      unlocked: '7.0000000000',
      metadata: CANTON_COIN_METADATA,
    });
    expect(calls.some((c) => c.url.startsWith(SCAN))).toBe(false);
  });

  it('without a known DSO lists each signing DSO as its own instrument, unlabelled', async () => {
    const { load } = setup();
    const state = await load();
    const cc = state.balances.filter((b) => b.source === 'amulet');
    expect(cc.map((b) => [b.instrumentId.admin, b.unlocked, b.metadata])).toEqual([
      [DSO, '12.5000000000', undefined],
      [OTHER_DSO, '7.0000000000', undefined],
    ]);
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
