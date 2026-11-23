import { DA_REGISTRY_TEMPLATES } from '../../../src/da-registry/templates';
import { AMULET_TEMPLATES } from '../../../src/wallets/amulet/constants';
import { isCancelledBeforeSubmit } from '../../../src/wallets/abort';
import { HOLDING_V1_INTERFACE_ID } from '../../../src/wallets/holding-view';
import type { TransferKind } from '../../../src/wallets/da-utilities/client';
import {
  describeWalletError,
  RegistryResponseError,
  WalletError,
  WalletSubmitError,
} from '../../../src/wallets/errors';
import type { JsonObject } from '../../../src/wallets/json';
import type { ActiveContract } from '../../../src/wallets/types';
import {
  BURN_REFERENCE_PATTERN,
  createWallet,
  MINT_OFFER_REJECT_REASON,
  newBurnReference,
  type Wallet,
  type WalletInternalOptions,
} from '../../../src/wallets/wallet';
import {
  CONTEXT_VALUES,
  contract,
  daDisclosed,
  daHolding,
  DEVNET,
  disclosed,
  fakeFetch,
  fakeProvider,
  HOLDER,
  INSTRUMENT,
  NOW,
  OPERATOR,
  OTHER,
  REGISTRAR,
  RpcError,
  type FakeProvider,
  type FetchCall,
} from './helpers';

const FACTORY_T = 'Utility.Registry.App.V0.Service.AllocationFactory:AllocationFactory';
const PREAPPROVAL_T = 'Utility.Registry.App.V0.Model.TransferPreapproval:TransferPreapproval';
const MINT = 'Utility.Registry.App.V0.Model.Mint:MintOffer';
const OFFER = 'Utility.Registry.App.V0.Model.Transfer:TransferOffer';
const BURN = 'Utility.Registry.App.V0.Model.Burn:BurnRequest';
/** A registry provider serving REGISTRAR that is not REGISTRAR itself. */
const PROVIDER = 'provider::1220ab';
const extraArgs = { context: { values: CONTEXT_VALUES }, meta: { values: {} } };
const TS_PATH = `${DEVNET}/api/token-standard/v0/registrars/${encodeURIComponent(REGISTRAR)}/registry`;

const mintArgs = (overrides: { holder?: string; provider?: string; operator?: string } = {}): JsonObject => ({
  operator: overrides.operator ?? OPERATOR,
  provider: overrides.provider ?? REGISTRAR,
  mint: {
    instrumentId: { admin: REGISTRAR, id: 'XMPL' },
    amount: '100.0000000000',
    holder: overrides.holder ?? HOLDER,
    reference: 'mint_0001',
    requestedAt: '2026-11-13T00:00:00Z',
    executeBefore: '2026-11-16T00:00:00Z',
    meta: { values: {} },
  },
});

const transferArgs = (sender: string, receiver: string, provider = REGISTRAR): JsonObject => ({
  operator: OPERATOR,
  provider,
  transfer: {
    sender,
    receiver,
    amount: '1.0000000000',
    instrumentId: { admin: REGISTRAR, id: 'XMPL' },
    requestedAt: '2026-11-13T00:00:00Z',
    executeBefore: '2026-11-14T00:00:00Z',
    inputHoldingCids: ['00x'],
    meta: { values: { 'splice.lfdecentralizedtrust.org/reason': 'hello' } },
  },
});

const burnArgs = (holder: string, operator = OPERATOR, provider = REGISTRAR): JsonObject => ({
  operator,
  provider,
  burn: {
    instrumentId: { admin: REGISTRAR, id: 'XMPL' },
    amount: '5.0000000000',
    holder,
    reference: 'r-1',
    requestedAt: '2026-11-13T00:00:00Z',
    executeBefore: '2026-11-20T00:00:00Z',
    meta: { values: {} },
  },
  lockedHoldingCid: '00locked',
});

const preapprovalArgs = (
  overrides: { receiver?: string; operator?: string; admin?: string; ids?: string[] } = {}
): JsonObject => ({
  operator: overrides.operator ?? OPERATOR,
  receiver: overrides.receiver ?? HOLDER,
  instrumentAdmin: overrides.admin ?? REGISTRAR,
  instrumentAllowances: (overrides.ids ?? ['XMPL']).map((id) => ({ id })),
});

function ledger(
  extra: { holdings?: ActiveContract[]; preapprovals?: ActiveContract[] } = {}
): Record<string, ActiveContract[]> {
  return {
    [DA_REGISTRY_TEMPLATES.holding]: [
      daHolding('00h10', '10'),
      daHolding('00h3', '3'),
      daHolding('00locked', '50', { lock: { holders: [REGISTRAR] } }),
      daHolding('00other', '99', { owner: OTHER }),
      // Not signed by its registrar, or not by its owner: look-alikes.
      daHolding('00forgedh', '1000', { signatories: [HOLDER] }),
      daHolding('00unowned', '1000', { signatories: [REGISTRAR] }),
      // DA's names, another package.
      { ...daHolding('00evilpkg', '1000'), packageName: 'evil-registry-holding-v0' },
      ...(extra.holdings ?? []),
    ],
    [DA_REGISTRY_TEMPLATES.mintOffer]: [
      contract('00mint', MINT, mintArgs()),
      contract('00forged', MINT, mintArgs({ provider: OTHER })),
      contract('00badop', MINT, mintArgs({ operator: OTHER })),
      contract('00theirs', MINT, mintArgs({ holder: OTHER })),
      // Genuine-looking arguments, but signed by an attacker, not the provider.
      contract('00unsigned', MINT, mintArgs(), [OTHER]),
      // Made under another provider's service: trusted only through `trustedProviders`.
      contract('00mintprov', MINT, mintArgs({ provider: PROVIDER }), [PROVIDER]),
    ],
    [DA_REGISTRY_TEMPLATES.transferOffer]: [
      contract('00in', OFFER, transferArgs(OTHER, HOLDER)),
      contract('00out', OFFER, transferArgs(HOLDER, OTHER)),
      contract('00forgedin', OFFER, transferArgs(OTHER, HOLDER, OTHER)),
      contract('00unsignedin', OFFER, transferArgs(OTHER, HOLDER), [OTHER]),
      contract('00inprov', OFFER, transferArgs(OTHER, HOLDER, PROVIDER), [PROVIDER]),
    ],
    [DA_REGISTRY_TEMPLATES.burnRequest]: [
      contract('00burn', BURN, burnArgs(HOLDER)),
      contract('00burnother', BURN, burnArgs(OTHER)),
      contract('00burnforged', BURN, burnArgs(HOLDER, OTHER)),
      contract('00burnunsigned', BURN, burnArgs(HOLDER), [OTHER, HOLDER]),
      contract('00burnprov', BURN, burnArgs(HOLDER, OPERATOR, PROVIDER), [PROVIDER, HOLDER]),
    ],
    [DA_REGISTRY_TEMPLATES.transferPreapproval]: extra.preapprovals ?? [
      contract('00pre', PREAPPROVAL_T, preapprovalArgs(), [HOLDER]),
      contract('00preother', PREAPPROVAL_T, preapprovalArgs({ receiver: OTHER }), [OTHER]),
      contract('00prebadop', PREAPPROVAL_T, preapprovalArgs({ operator: OTHER }), [HOLDER]),
      contract('00preunsigned', PREAPPROVAL_T, preapprovalArgs(), [OTHER]),
    ],
  };
}

interface Setup {
  tokens: Wallet;
  wallet: FakeProvider;
  calls: FetchCall[];
}

function setup(
  options: {
    transferKind?: TransferKind;
    /** The factory template DA answers with, whatever the kind. */
    factoryTemplate?: string;
    holdings?: ActiveContract[];
    preapprovals?: ActiveContract[];
    trustedProviders?: Record<string, string[]>;
    isActive?: () => boolean;
    metadata?: (call: FetchCall) => { status?: number; json?: unknown };
    beforeLedgerApi?: (resource: string, body: unknown) => void;
    submitError?: unknown;
    now?: () => Date;
    /** A registry request whose URL ends with this never answers, like a request still in flight. */
    hangOn?: string;
  } = {}
): Setup {
  const { fetch: answering, calls } = fakeFetch((call: FetchCall) => {
    if (call.url.endsWith('/api/utilities/v0/operator')) return { json: { partyId: OPERATOR } };
    if (call.url.includes('/metadata/v1/instruments/')) {
      return options.metadata?.(call) ?? { json: { id: 'XMPL', name: 'Example', symbol: 'XMPL', decimals: 2 } };
    }
    if (call.url.endsWith('/burn/v0/request')) {
      return {
        json: {
          factoryId: '00alloc',
          choiceContext: {
            choiceContextData: { values: CONTEXT_VALUES },
            disclosedContracts: [daDisclosed('00alloc', options.factoryTemplate ?? FACTORY_T)],
          },
        },
      };
    }
    if (call.url.endsWith('/transfer-factory')) {
      const kind = options.transferKind ?? 'offer';
      const factoryId = kind === 'direct' ? '00preapproval' : '00alloc';
      return {
        json: {
          factoryId,
          transferKind: kind,
          choiceContext: {
            choiceContextData: { values: CONTEXT_VALUES },
            disclosedContracts: [
              daDisclosed(factoryId, options.factoryTemplate ?? (kind === 'direct' ? PREAPPROVAL_T : FACTORY_T)),
            ],
          },
        },
      };
    }
    return {
      json: {
        choiceContextData: { values: CONTEXT_VALUES },
        disclosedContracts: [daDisclosed('00config', 'X.Y:Config')],
      },
    };
  });
  const fetch: typeof answering = async (url, init) => {
    if (options.hangOn !== undefined && url.endsWith(options.hangOn)) {
      await new Promise<never>(() => undefined);
    }
    return answering(url, init);
  };
  const wallet = fakeProvider(ledger(options), {
    ...(options.beforeLedgerApi !== undefined && { beforeLedgerApi: options.beforeLedgerApi }),
    ...(options.submitError !== undefined && { submitError: options.submitError }),
  });
  const walletOptions: WalletInternalOptions = {
    provider: wallet,
    partyId: HOLDER,
    network: 'devnet',
    registry: { fetch, ...(options.trustedProviders !== undefined && { trustedProviders: options.trustedProviders }) },
    now: options.now ?? (() => NOW),
    readRetry: { sleep: async () => undefined },
    ...(options.isActive !== undefined && { isActive: options.isActive }),
  };
  return { tokens: createWallet(walletOptions), wallet, calls };
}

const UUID = /^[0-9a-f-]{36}$/;
const STATE_TEMPLATES = [
  `${HOLDING_V1_INTERFACE_ID}+view`,
  DA_REGISTRY_TEMPLATES.holding,
  DA_REGISTRY_TEMPLATES.transferOffer,
  DA_REGISTRY_TEMPLATES.mintOffer,
  DA_REGISTRY_TEMPLATES.burnRequest,
  DA_REGISTRY_TEMPLATES.transferPreapproval,
  AMULET_TEMPLATES.transferInstruction,
];
const postCalls = (calls: FetchCall[]): FetchCall[] => calls.filter((c) => c.method === 'POST');
const request = { receiver: OTHER, instrumentId: INSTRUMENT, amount: '12' };

/** Resolves once the fake provider is asked for `method`, and holds that call until `release`. */
function holdNext(wallet: FakeProvider, method: string): { entered: Promise<void>; release: () => void } {
  let release: () => void = () => undefined;
  let enter: () => void = () => undefined;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const original = wallet.request.bind(wallet);
  let held = false;
  wallet.request = async (args) => {
    if (args.method === method && !held) {
      held = true;
      enter();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    return original(args);
  };
  return { entered, release: () => release() };
}

describe('createWallet', () => {
  it('exposes its party and network, and refuses an empty party or an unknown network', () => {
    const { tokens } = setup();
    expect(tokens.partyId).toBe(HOLDER);
    expect(tokens.network).toBe('devnet');
    const provider = fakeProvider({});
    expect(() => createWallet({ provider, partyId: ' ', network: 'devnet' })).toThrow(WalletError);
    expect(() => createWallet({ provider, partyId: HOLDER, network: 'testnet' as 'devnet' })).toThrow(
      new TypeError('createWallet: network must be devnet or mainnet')
    );
  });

  it("uses DA's Utilities API of its network, or the given base URL", async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: { partyId: OPERATOR } }));
    const provider = fakeProvider({});
    await createWallet({ provider, partyId: HOLDER, network: 'mainnet', registry: { fetch } }).loadState();
    await createWallet({
      provider,
      partyId: HOLDER,
      network: 'mainnet',
      registry: { fetch, baseUrl: 'https://proxy.example/' },
    }).loadState();
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.utilities.digitalasset.com/api/utilities/v0/operator',
      'https://proxy.example/api/utilities/v0/operator',
    ]);
  });
});

describe('createWallet.loadState', () => {
  it('reads every list with one ledger-end call and one ACS read of HoldingV1, the five DA templates and CC offers, as the party', async () => {
    const { tokens, wallet } = setup();
    const state = await tokens.loadState();
    expect(wallet.ledgerCalls()).toEqual(['GET /v2/state/ledger-end', 'POST /v2/state/active-contracts']);
    expect(wallet.reads).toEqual([STATE_TEMPLATES]);
    expect(state.offset).toBe(4242);
    expect(state.holdings.map((h) => [h.contractId, h.amount, h.locked])).toEqual([
      ['00h10', '10', false],
      ['00h3', '3', false],
      ['00locked', '50', true],
    ]);
    expect(state.balances).toEqual([
      {
        key: 'XMPL@registrar::1220bb',
        instrumentId: INSTRUMENT,
        unlocked: '13.0000000000',
        locked: '50.0000000000',
        lockedInExpiredOffers: '0.0000000000',
        lockedInExpiredLocks: '0.0000000000',
        holdingCount: 3,
        metadata: { name: 'Example', symbol: 'XMPL', decimals: 2 },
        source: 'da-registry',
      },
    ]);
    expect(state.transferOffers.outgoing[0]?.expired).toBe(false);
    expect(state.mintOffers.map((o) => o.contractId)).toEqual(['00mint']);
    expect(state.mintOffers[0]).toMatchObject({ reference: 'mint_0001', memo: null });
    expect(state.transferOffers.incoming.map((o) => o.contractId)).toEqual(['00in']);
    expect(state.transferOffers.outgoing.map((o) => o.contractId)).toEqual(['00out']);
    expect(state.transferOffers.incoming[0]).toMatchObject({ memo: 'hello', sender: OTHER, receiver: HOLDER });
    expect(state.burnRequests.map((r) => r.contractId)).toEqual(['00burn']);
    expect(state.burnRequests[0]).toMatchObject({ lockedHoldingCid: '00locked', reference: 'r-1', memo: null });
    expect(state.transferPreapprovals).toEqual([
      {
        contractId: '00pre',
        operator: OPERATOR,
        receiver: HOLDER,
        instrumentAdmin: REGISTRAR,
        instrumentIds: ['XMPL'],
      },
    ]);
  });

  it('reads the instrument metadata once per wallet and leaves it out when the registry fails', async () => {
    let status = 500;
    const { tokens, calls } = setup({
      metadata: () =>
        status === 200
          ? { json: { id: 'XMPL', name: 'Example', symbol: 'XMPL', decimals: 2 } }
          : { status, json: { error: 'down' } },
    });
    const metadataCalls = (): FetchCall[] => calls.filter((c) => c.url.includes('/metadata/'));
    expect((await tokens.loadState()).balances[0]?.metadata).toBeUndefined();
    expect(metadataCalls().map((c) => [c.method, c.url])).toEqual([['GET', `${TS_PATH}/metadata/v1/instruments/XMPL`]]);
    // A failure is asked again; an answer is kept.
    status = 200;
    await tokens.loadState();
    await tokens.loadState();
    expect(metadataCalls()).toHaveLength(2);
  });

  it.each([
    ['another instrument', { id: 'OTHER', name: 'n', symbol: 's', decimals: 2 }],
    ['no name', { id: 'XMPL', symbol: 's', decimals: 2 }],
    ['too many decimals', { id: 'XMPL', name: 'n', symbol: 's', decimals: 11 }],
  ])('drops metadata of %s', async (_name, json) => {
    const { tokens } = setup({ metadata: () => ({ json }) });
    expect((await tokens.loadState()).balances[0]?.metadata).toBeUndefined();
  });

  it('defaults the metadata decimals to 10, as the metadata API does', async () => {
    const { tokens } = setup({ metadata: () => ({ json: { id: 'XMPL', name: 'n', symbol: 's' } }) });
    expect((await tokens.loadState()).balances[0]?.metadata).toEqual({ name: 'n', symbol: 's', decimals: 10 });
  });

  it('trusts offers and requests of another provider only when listed for the instrument admin', async () => {
    const { tokens } = setup({ trustedProviders: { [REGISTRAR]: [REGISTRAR, PROVIDER] } });
    const state = await tokens.loadState();
    expect(state.mintOffers.map((o) => o.contractId)).toEqual(['00mint', '00mintprov']);
    expect(state.transferOffers.incoming.map((o) => o.contractId)).toEqual(['00in', '00inprov']);
    expect(state.burnRequests.map((r) => r.contractId)).toEqual(['00burn', '00burnprov']);
  });

  it('shares one snapshot in flight, but not one that started before a write settled', async () => {
    const { tokens, wallet } = setup();
    const [a, b] = await Promise.all([tokens.loadState(), tokens.loadState()]);
    expect(a).toBe(b);
    expect(wallet.reads).toHaveLength(1);

    const held = holdNext(wallet, 'ledgerApi');
    const before = tokens.loadState();
    await held.entered;
    await tokens.cancelBurnRequest('00burn');
    const after = tokens.loadState();
    held.release();
    await Promise.all([before, after]);
    // The snapshot before, the write's own read, and a new snapshot after the write.
    expect(wallet.reads).toHaveLength(4);
  });

  it('backs off and retries a read the wallet rate-limited', async () => {
    let refusals = 2;
    const { tokens, wallet } = setup({
      beforeLedgerApi: (resource) => {
        if (resource === '/v2/state/active-contracts' && refusals > 0) {
          refusals -= 1;
          throw new RpcError(-32005, 'Limit exceeded');
        }
      },
    });
    await expect(tokens.loadState()).resolves.toMatchObject({ offset: 4242 });
    expect(wallet.ledgerCalls().filter((c) => c.endsWith('active-contracts'))).toHaveLength(3);
  });
});

describe('createWallet.planTransfer', () => {
  it('plans an offer without submitting, and submits exactly the planned request', async () => {
    const { tokens, wallet, calls } = setup();
    const caller = { ...request, memo: 'thanks' };
    const plan = await tokens.planTransfer(caller);
    expect(plan.kind).toBe('offer');
    expect(plan.description).toMatch(/^Offer: the receiver must accept it before it expires/);
    expect(plan.partyId).toBe(HOLDER);
    expect(plan.request).toEqual({ receiver: OTHER, instrumentId: INSTRUMENT, amount: '12', memo: 'thanks' });
    expect(Object.isFrozen(plan.request)).toBe(true);
    expect(wallet.submissions).toEqual([]);
    caller.amount = '1';

    const result = await plan.submit();
    expect(result).toEqual({ kind: 'offer', updateId: 'update-1', commandId: expect.stringMatching(UUID) });
    const transfer = {
      sender: HOLDER,
      receiver: OTHER,
      amount: '12.0000000000',
      instrumentId: { admin: REGISTRAR, id: 'XMPL' },
      requestedAt: '2026-11-13T11:59:00.000Z',
      executeBefore: '2026-11-14T12:00:00.000Z',
      inputHoldingCids: ['00h10', '00h3'],
      meta: { values: { 'splice.lfdecentralizedtrust.org/reason': 'thanks' } },
    };
    const factoryCalls = postCalls(calls).filter((c) => c.url.endsWith('/transfer-factory'));
    expect(factoryCalls).toHaveLength(2);
    expect(factoryCalls[1]).toMatchObject({
      url: `${TS_PATH}/transfer-instruction/v1/transfer-factory`,
      body: { choiceArguments: { expectedAdmin: REGISTRAR, transfer }, excludeDebugFields: true },
    });
    expect(wallet.submissions).toEqual([
      {
        commandId: result.commandId,
        commands: [
          {
            ExerciseCommand: {
              templateId:
                '#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferFactory',
              contractId: '00alloc',
              choice: 'TransferFactory_Transfer',
              choiceArgument: { expectedAdmin: REGISTRAR, transfer, extraArgs },
            },
          },
        ],
        disclosedContracts: [disclosed('00alloc', FACTORY_T)],
        actAs: [HOLDER],
      },
    ]);
  });

  it('plans a direct transfer through the receiver preapproval, with a given deadline and no memo', async () => {
    const { tokens, wallet } = setup({ transferKind: 'direct' });
    const executeBefore = new Date('2026-11-13T18:00:00Z');
    const plan = await tokens.planTransfer({ ...request, requirePreapproval: true, executeBefore });
    expect(plan).toMatchObject({ kind: 'direct', description: expect.stringMatching(/^Direct:/) });
    await plan.submit();
    const submitted = wallet.submissions[0]?.commands[0];
    expect(submitted).toMatchObject({
      ExerciseCommand: {
        contractId: '00preapproval',
        choiceArgument: { transfer: { executeBefore: '2026-11-13T18:00:00.000Z', meta: { values: {} } } },
      },
    });
  });

  it('refuses with preapproval-required at plan time when the registry would make an offer', async () => {
    const { tokens, wallet } = setup({ transferKind: 'offer' });
    await expect(tokens.planTransfer({ ...request, requirePreapproval: true })).rejects.toMatchObject({
      code: 'preapproval-required',
      message: expect.stringMatching(/would make an offer\); nothing was submitted/),
    });
    expect(wallet.submissions).toEqual([]);
  });

  it('refuses to submit with kind-changed when the registry now answers another kind', async () => {
    const options: { transferKind: TransferKind } = { transferKind: 'direct' };
    const { tokens, wallet } = setup(options);
    const plan = await tokens.planTransfer({ ...request, requirePreapproval: true });
    options.transferKind = 'offer';
    await expect(plan.submit()).rejects.toMatchObject({ code: 'kind-changed' });
    expect(wallet.submissions).toEqual([]);
  });

  it.each([
    ['a direct transfer through an allocation factory', 'direct', FACTORY_T],
    ['an offer through a preapproval', 'offer', PREAPPROVAL_T],
    ['a self-transfer through a preapproval', 'self', PREAPPROVAL_T],
    ['a factory of an unexpected template', 'offer', 'Evil.Module:Factory'],
  ] as const)('refuses %s before anything is signed', async (_name, transferKind, factoryTemplate) => {
    const { tokens, wallet } = setup({ transferKind, factoryTemplate });
    const error = await tokens.planTransfer(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RegistryResponseError);
    expect((error as Error).message).toMatch(new RegExp(`unexpected template.*a ${transferKind} transfer`));
    expect(wallet.submissions).toEqual([]);
  });

  it('refuses bad input before calling the registry', async () => {
    const { tokens, calls } = setup();
    await expect(tokens.planTransfer({ ...request, amount: '1000' })).rejects.toMatchObject({
      code: 'insufficient-balance',
    });
    await expect(tokens.planTransfer({ ...request, receiver: ' ' })).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(
      tokens.planTransfer({ ...request, executeBefore: new Date('2026-11-13T11:00:00Z') })
    ).rejects.toMatchObject({ code: 'invalid-input', message: 'executeBefore must be in the future' });
    await expect(tokens.planTransfer({ ...request, executeBefore: new Date('soon') })).rejects.toMatchObject({
      code: 'invalid-input',
    });
    expect(postCalls(calls)).toEqual([]);
  });

  it('refuses a clock that gives an invalid time', async () => {
    const { tokens, wallet } = setup({ now: () => new Date(Number.NaN) });
    await expect(tokens.planTransfer(request)).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(tokens.requestBurn({ instrumentId: INSTRUMENT, amount: '1', reference: 'r' })).rejects.toMatchObject({
      code: 'invalid-input',
    });
    expect(wallet.submissions).toEqual([]);
  });
});

describe('createWallet: one write at a time, in a live session', () => {
  const writes = (tokens: Wallet): Array<Promise<unknown>> => [
    tokens.requestBurn({ instrumentId: INSTRUMENT, amount: '1', reference: 'r' }),
    tokens.cancelBurnRequest('00burn'),
    tokens.acceptMintOffer('00mint'),
    tokens.rejectMintOffer('00mint'),
    tokens.createTransferPreapproval({ instrumentAdmin: REGISTRAR, instrumentIds: ['NEW'] }),
    tokens.removeTransferPreapproval('00pre'),
    tokens.acceptTransferOffer('00in'),
    tokens.rejectTransferOffer('00in'),
    tokens.withdrawTransferOffer('00out'),
  ];

  it('refuses every write once isActive answers false, before any read, registry call or signature', async () => {
    let active = true;
    const { tokens, wallet, calls } = setup({ isActive: () => active });
    const plan = await tokens.planTransfer(request);
    active = false;
    const requests = wallet.requests.length;
    const fetches = calls.length;
    for (const write of [...writes(tokens), plan.submit()]) {
      await expect(write).rejects.toMatchObject({
        code: 'invalid-input',
        message: expect.stringMatching(/^The wallet session this action was prepared in has ended/),
      });
    }
    expect(wallet.requests.slice(requests)).toEqual([]);
    expect(calls.slice(fetches)).toEqual([]);
    // Reads are not limited.
    await expect(tokens.loadState()).resolves.toMatchObject({ offset: 4242 });
    // The refusals released the write guard.
    active = true;
    await expect(plan.submit()).resolves.toMatchObject({ kind: 'offer' });
  });

  it('checks isActive again right before signing', async () => {
    let active = true;
    const { tokens, wallet, calls } = setup({ isActive: () => active });
    const plan = await tokens.planTransfer(request);
    const original = wallet.request.bind(wallet);
    // The session ends while the submission reads its holdings.
    wallet.request = async (args) => {
      if (args.method === 'ledgerApi') active = false;
      return original(args);
    };
    await expect(plan.submit()).rejects.toMatchObject({ code: 'invalid-input' });
    expect(wallet.submissions).toEqual([]);
    // It got as far as the registry: the check before signing refused it.
    expect(postCalls(calls).filter((c) => c.url.endsWith('/transfer-factory'))).toHaveLength(2);
  });

  it('refuses every other write with busy while one is in progress, and frees up after it', async () => {
    const { tokens, wallet } = setup();
    const plan = await tokens.planTransfer(request);
    const held = holdNext(wallet, 'ledgerApi');
    const first = plan.submit();
    await held.entered;
    for (const write of [...writes(tokens), plan.submit()]) {
      await expect(write).rejects.toMatchObject({ code: 'busy' });
    }
    // Reads are not guarded.
    const reading = tokens.loadState();
    held.release();
    await expect(reading).resolves.toMatchObject({ offset: 4242 });
    await expect(first).resolves.toMatchObject({ updateId: 'update-1' });
    expect(wallet.submissions).toHaveLength(1);
    await expect(tokens.acceptMintOffer('00mint')).resolves.toMatchObject({ updateId: 'update-1' });
  });

  it('releases the write guard after a failed write', async () => {
    const { tokens, wallet } = setup();
    await expect(tokens.acceptMintOffer('00none')).rejects.toMatchObject({ code: 'not-found' });
    await expect(tokens.acceptMintOffer('00mint')).resolves.toMatchObject({ updateId: 'update-1' });
    expect(wallet.submissions).toHaveLength(1);
  });
});

describe('createWallet.loadState cancellation', () => {
  it('leaves no unhandled rejection when the caller cancels and the shared read then fails, and others still see it', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const { tokens } = setup({
        beforeLedgerApi: () => {
          throw new Error('ledger down');
        },
      });
      const controller = new AbortController();
      const cancelled = tokens.loadState({ signal: controller.signal }).catch((e: unknown) => e);
      const other = tokens.loadState().catch((e: unknown) => e);
      controller.abort();
      expect((await cancelled) as { name?: string }).toMatchObject({ name: 'AbortError' });
      expect(await other).toBeInstanceOf(Error);
      expect(((await other) as { name?: string }).name).not.toBe('AbortError');
      // Only the cancelled caller observes the shared read.
      const solo = new AbortController();
      const soloCancelled = tokens.loadState({ signal: solo.signal }).catch((e: unknown) => e);
      solo.abort();
      expect((await soloCancelled) as { name?: string }).toMatchObject({ name: 'AbortError' });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});

describe('createWallet: transfer offers', () => {
  it.each([
    ['acceptTransferOffer', '00in', 'accept', 'TransferInstruction_Accept'],
    ['rejectTransferOffer', '00in', 'reject', 'TransferInstruction_Reject'],
    ['withdrawTransferOffer', '00out', 'withdraw', 'TransferInstruction_Withdraw'],
  ] as const)('%s fetches the %s context and exercises %s', async (method, cid, action, choice) => {
    const { tokens, wallet, calls } = setup();
    await tokens[method](cid);
    expect(postCalls(calls)).toEqual([
      {
        url: `${TS_PATH}/transfer-instruction/v1/${cid}/choice-contexts/${action}`,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: { excludeDebugFields: true },
      },
    ]);
    expect(wallet.reads[wallet.reads.length - 1]).toEqual([
      DA_REGISTRY_TEMPLATES.transferOffer,
      AMULET_TEMPLATES.transferInstruction,
    ]);
    expect(wallet.submissions[0]?.commands).toEqual([
      {
        ExerciseCommand: {
          templateId:
            '#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferInstruction',
          contractId: cid,
          choice,
          choiceArgument: { extraArgs },
        },
      },
    ]);
  });

  it('refuses an offer in the wrong direction or not from the registry', async () => {
    const { tokens, wallet } = setup();
    await expect(tokens.acceptTransferOffer('00out')).rejects.toMatchObject({
      code: 'not-found',
      message: "Incoming transfer offer 00out is not among the wallet's active incoming transfer offers",
    });
    await expect(tokens.withdrawTransferOffer('00in')).rejects.toMatchObject({ code: 'not-found' });
    await expect(tokens.acceptTransferOffer('00forgedin')).rejects.toMatchObject({ code: 'not-found' });
    expect(wallet.submissions).toEqual([]);
  });
});

describe('createWallet: mint offers', () => {
  it('accepts a mint offer with its accept context', async () => {
    const { tokens, wallet, calls } = setup();
    const result = await tokens.acceptMintOffer('00mint');
    expect(result).toEqual({ updateId: 'update-1', commandId: expect.stringMatching(UUID) });
    expect(postCalls(calls).map((c) => [c.url, c.body])).toEqual([
      [`${DEVNET}/api/utilities/v0/registry/mint/v0/offer/00mint/choice-contexts/accept`, {}],
    ]);
    expect(wallet.submissions).toEqual([
      {
        commandId: result.commandId,
        commands: [
          {
            ExerciseCommand: {
              templateId: DA_REGISTRY_TEMPLATES.mintOffer,
              contractId: '00mint',
              choice: 'MintOffer_Accept',
              choiceArgument: { extraArgs },
            },
          },
        ],
        disclosedContracts: [disclosed('00config', 'X.Y:Config')],
        actAs: [HOLDER],
      },
    ]);
  });

  it('rejects a mint offer with the fixed reason and no choice context', async () => {
    const { tokens, wallet, calls } = setup();
    await tokens.rejectMintOffer('00mint');
    expect(postCalls(calls)).toEqual([]);
    expect(wallet.submissions[0]?.commands).toEqual([
      {
        ExerciseCommand: {
          templateId: DA_REGISTRY_TEMPLATES.mintOffer,
          contractId: '00mint',
          choice: 'MintOffer_Reject',
          choiceArgument: { reason: MINT_OFFER_REJECT_REASON, extraArgs: null },
        },
      },
    ]);
    expect(wallet.submissions[0]?.disclosedContracts).toBeUndefined();
  });

  it.each(['00forged', '00badop', '00theirs', '00unsigned', '00mintprov'])(
    'refuses offer %s, which is not a genuine offer to the party',
    async (cid) => {
      const { tokens, wallet, calls } = setup();
      await expect(tokens.acceptMintOffer(cid)).rejects.toMatchObject({ code: 'not-found' });
      await expect(tokens.rejectMintOffer(cid)).rejects.toMatchObject({ code: 'not-found' });
      expect(postCalls(calls)).toEqual([]);
      expect(wallet.submissions).toEqual([]);
    }
  );
});

describe('createWallet: burn requests', () => {
  it('selects holdings, fetches the burn factory and submits AllocationFactory_RequestBurn', async () => {
    const { tokens, wallet, calls } = setup();
    const result = await tokens.requestBurn({ instrumentId: INSTRUMENT, amount: '11', reference: 'redemption-1' });
    expect(result).toEqual({ updateId: 'update-1', commandId: expect.stringMatching(UUID), reference: 'redemption-1' });
    expect(postCalls(calls).map((c) => [c.url, c.body])).toEqual([
      [
        `${DEVNET}/api/utilities/v0/registry/burn/v0/request`,
        { holder: HOLDER, holdingContractIds: ['00h10', '00h3'], instrumentId: { admin: REGISTRAR, id: 'XMPL' } },
      ],
    ]);
    expect(wallet.submissions[0]).toEqual({
      commandId: result.commandId,
      commands: [
        {
          ExerciseCommand: {
            templateId: DA_REGISTRY_TEMPLATES.allocationFactory,
            contractId: '00alloc',
            choice: 'AllocationFactory_RequestBurn',
            choiceArgument: {
              expectedAdmin: REGISTRAR,
              burn: {
                instrumentId: { admin: REGISTRAR, id: 'XMPL' },
                amount: '11.0000000000',
                holder: HOLDER,
                reference: 'redemption-1',
                requestedAt: '2026-11-13T11:59:00.000Z',
                executeBefore: '2026-11-20T12:00:00.000Z',
                meta: { values: {} },
              },
              holdingCids: ['00h10', '00h3'],
              extraArgs,
            },
          },
        },
      ],
      disclosedContracts: [disclosed('00alloc', FACTORY_T)],
      actAs: [HOLDER],
    });
  });

  it('files a generated reference and uses a given deadline', async () => {
    const { tokens, wallet } = setup();
    const executeBefore = new Date('2026-11-14T00:00:00Z');
    const { reference } = await tokens.requestBurn({ instrumentId: INSTRUMENT, amount: '1', executeBefore });
    expect(reference).toMatch(/^holder-burn-20261113T120000Z-[0-9a-z]{6}$/);
    expect(wallet.submissions[0]?.commands[0]).toMatchObject({
      ExerciseCommand: { choiceArgument: { burn: { reference, executeBefore: '2026-11-14T00:00:00.000Z' } } },
    });
  });

  it('names the reference in a failed submission, so an unknown outcome can be looked up', async () => {
    const { tokens } = setup({ submitError: new RpcError(-32002, 'timed out') });
    const error = await tokens.requestBurn({ instrumentId: INSTRUMENT, amount: '1' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WalletSubmitError);
    const { burnReference } = error as WalletSubmitError;
    expect(burnReference).toMatch(BURN_REFERENCE_PATTERN);
    expect(error).toMatchObject({ outcome: 'unknown', commandId: expect.stringMatching(UUID) });
    expect((error as Error).message).toContain(`Burn reference: ${String(burnReference)}.`);
  });

  it('refuses a bad reference, a past deadline, an insufficient balance and an unexpected factory', async () => {
    const { tokens, wallet } = setup({ factoryTemplate: PREAPPROVAL_T });
    await expect(
      tokens.requestBurn({ instrumentId: INSTRUMENT, amount: '1', reference: 'jane doe' })
    ).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(
      tokens.requestBurn({ instrumentId: INSTRUMENT, amount: '1', executeBefore: new Date('2026-11-13T00:00:00Z') })
    ).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(tokens.requestBurn({ instrumentId: INSTRUMENT, amount: '14' })).rejects.toMatchObject({
      code: 'insufficient-balance',
    });
    await expect(tokens.requestBurn({ instrumentId: INSTRUMENT, amount: '1' })).rejects.toBeInstanceOf(
      RegistryResponseError
    );
    expect(wallet.submissions).toEqual([]);
  });

  it('cancels one of the party burn requests with BurnRequest_Cancel', async () => {
    const { tokens, wallet, calls } = setup();
    await tokens.cancelBurnRequest('00burn');
    expect(postCalls(calls)).toEqual([]);
    expect(wallet.submissions[0]?.commands).toEqual([
      {
        ExerciseCommand: {
          templateId: DA_REGISTRY_TEMPLATES.burnRequest,
          contractId: '00burn',
          choice: 'BurnRequest_Cancel',
          choiceArgument: { extraArgs: null },
        },
      },
    ]);
  });

  it.each(['00burnother', '00burnforged', '00burnunsigned', '00none'])('refuses to cancel %s', async (cid) => {
    const { tokens, wallet } = setup();
    await expect(tokens.cancelBurnRequest(cid)).rejects.toMatchObject({ code: 'not-found' });
    expect(wallet.submissions).toEqual([]);
  });
});

describe('createWallet: transfer preapprovals', () => {
  const preapproval = (cid: string, ids: string[], admin = REGISTRAR): ActiveContract =>
    contract(cid, PREAPPROVAL_T, preapprovalArgs({ ids, admin }), [HOLDER]);

  it('creates the DA preapproval with the operator from the registry', async () => {
    const { tokens, wallet } = setup({ preapprovals: [] });
    await tokens.createTransferPreapproval({ instrumentAdmin: REGISTRAR, instrumentIds: ['XMPL', 'XMPL', 'B'] });
    expect(wallet.submissions[0]?.commands).toEqual([
      {
        CreateCommand: {
          templateId: DA_REGISTRY_TEMPLATES.transferPreapproval,
          createArguments: {
            operator: OPERATOR,
            receiver: HOLDER,
            instrumentAdmin: REGISTRAR,
            instrumentAllowances: [{ id: 'XMPL' }, { id: 'B' }],
          },
        },
      },
    ]);
    expect(wallet.submissions[0]?.disclosedContracts).toBeUndefined();
  });

  it('covers every instrument with no ids, and refuses more than 10', async () => {
    const { tokens, wallet } = setup({ preapprovals: [] });
    await tokens.createTransferPreapproval({ instrumentAdmin: REGISTRAR });
    expect(wallet.submissions[0]?.commands[0]).toMatchObject({
      CreateCommand: { createArguments: { instrumentAllowances: [] } },
    });
    const ids = Array.from({ length: 11 }, (_, i) => `I${i}`);
    await expect(
      tokens.createTransferPreapproval({ instrumentAdmin: REGISTRAR, instrumentIds: ids })
    ).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(tokens.createTransferPreapproval({ instrumentAdmin: ' ' })).rejects.toMatchObject({
      code: 'invalid-input',
    });
  });

  it.each([
    ['every instrument, by one covering all', [preapproval('00all', [])], undefined],
    ['some ids, by one covering all', [preapproval('00all', [])], ['A']],
    ['some ids, by one listing them', [preapproval('00ab', ['A', 'B', 'C'])], ['A', 'B']],
  ])('refuses with already-exists a request for %s', async (_name, preapprovals, instrumentIds) => {
    const { tokens, wallet } = setup({ preapprovals });
    await expect(
      tokens.createTransferPreapproval({
        instrumentAdmin: REGISTRAR,
        ...(instrumentIds !== undefined && { instrumentIds }),
      })
    ).rejects.toMatchObject({ code: 'already-exists', message: expect.stringMatching(/^Transfer preapproval 00/) });
    expect(wallet.submissions).toEqual([]);
  });

  it.each([
    ['every instrument, when one lists some', [preapproval('00a', ['A'])], undefined],
    ['ids one does not list', [preapproval('00a', ['A'])], ['A', 'B']],
    ['the ids of another admin', [preapproval('00a', [], OTHER)], ['A']],
    [
      'ids a preapproval under another operator lists',
      [contract('00x', PREAPPROVAL_T, preapprovalArgs({ operator: OTHER, ids: [] }), [HOLDER])],
      ['A'],
    ],
  ])('creates one for %s', async (_name, preapprovals, instrumentIds) => {
    const { tokens, wallet } = setup({ preapprovals });
    await tokens.createTransferPreapproval({
      instrumentAdmin: REGISTRAR,
      ...(instrumentIds !== undefined && { instrumentIds }),
    });
    expect(wallet.submissions).toHaveLength(1);
  });

  it('withdraws one of the party preapprovals as the receiver', async () => {
    const { tokens, wallet } = setup();
    await tokens.removeTransferPreapproval('00pre');
    expect(wallet.submissions[0]?.commands).toEqual([
      {
        ExerciseCommand: {
          templateId: DA_REGISTRY_TEMPLATES.transferPreapproval,
          contractId: '00pre',
          choice: 'TransferPreapproval_Withdraw',
          choiceArgument: { actor: HOLDER },
        },
      },
    ]);
  });

  it.each(['00preother', '00prebadop', '00preunsigned', '00none'])('refuses to withdraw %s', async (cid) => {
    const { tokens, wallet } = setup();
    await expect(tokens.removeTransferPreapproval(cid)).rejects.toMatchObject({ code: 'not-found' });
    expect(wallet.submissions).toEqual([]);
  });
});

describe('newBurnReference', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stamps the UTC second and six random base-36 digits, matching the burn reference pattern', () => {
    jest.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((array) => {
      if (array instanceof Uint8Array) {
        array.fill(0);
        array[5] = 36 + 35; // 71 % 36 = 35: 'z'
      }
      return array;
    });
    const reference = newBurnReference(new Date('2026-11-13T15:27:05.123Z'));
    expect(reference).toBe('holder-burn-20261113T152705Z-00000z');
    expect(reference).toMatch(BURN_REFERENCE_PATTERN);
  });

  it('skips bytes that would bias a digit, drawing again when a whole draw is skipped', () => {
    const draws = [new Array<number>(16).fill(255), [252, 7, 255, 1, 2, 3, 4, 5, 6]];
    const getRandomValues = jest.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((array) => {
      if (array instanceof Uint8Array) {
        array.fill(0);
        array.set(draws.shift() ?? []);
      }
      return array;
    });
    expect(newBurnReference(new Date('2026-11-13T15:27:05Z'))).toBe('holder-burn-20261113T152705Z-712345');
    expect(getRandomValues).toHaveBeenCalledTimes(2);
  });

  it('never falls back to Math.random', () => {
    const random = jest.spyOn(Math, 'random');
    const at = new Date('2026-11-13T15:27:05Z');
    const references = new Set(Array.from({ length: 20 }, () => newBurnReference(at)));
    expect(references.size).toBe(20);
    expect(random).not.toHaveBeenCalled();
  });

  it('refuses an invalid date', () => {
    expect(() => newBurnReference(new Date('soon'))).toThrow(WalletError);
  });
});

describe('createWallet: cancellation', () => {
  const aborted = (): AbortSignal => {
    const controller = new AbortController();
    controller.abort();
    return controller.signal;
  };
  const isAbort = (error: unknown): boolean => (error as { name?: unknown }).name === 'AbortError';

  it('refuses every call with an AbortError once its signal aborted, before any read, registry call or signature', async () => {
    const { tokens, wallet, calls } = setup();
    const signal = aborted();
    const results = await Promise.all(
      [
        tokens.loadState({ signal }),
        tokens.planTransfer(request, { signal }),
        tokens.acceptTransferOffer('00in', { signal }),
        tokens.rejectTransferOffer('00in', { signal }),
        tokens.withdrawTransferOffer('00out', { signal }),
        tokens.acceptMintOffer('00mint', { signal }),
        tokens.rejectMintOffer('00mint', { signal }),
        tokens.requestBurn({ instrumentId: INSTRUMENT, amount: '1' }, { signal }),
        tokens.cancelBurnRequest('00burn', { signal }),
        tokens.createTransferPreapproval({ instrumentAdmin: OTHER }, { signal }),
        tokens.removeTransferPreapproval('00pre', { signal }),
      ].map(async (call) => call.catch((error: unknown) => error))
    );
    expect(results.every(isAbort)).toBe(true);
    // Thrown before anything was submitted, so `describeWalletError` may say so.
    expect(results.every(isCancelledBeforeSubmit)).toBe(true);
    expect(wallet.reads).toEqual([]);
    expect(calls).toEqual([]);
    expect(wallet.submissions).toEqual([]);
    // The write guard was never taken.
    await expect(tokens.rejectMintOffer('00mint')).resolves.toMatchObject({ updateId: 'update-1' });
  });

  it('brands a cancellation during a pending registry request: nothing was submitted', async () => {
    const { tokens, wallet } = setup({ hangOn: '/transfer-factory' });
    const controller = new AbortController();
    const transfer = tokens.planTransfer(request, { signal: controller.signal }).catch((error: unknown) => error);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    controller.abort();
    const error = await transfer;
    expect(isAbort(error)).toBe(true);
    expect(isCancelledBeforeSubmit(error)).toBe(true);
    expect(describeWalletError(error).message).toContain('Nothing was submitted');
    expect(wallet.submissions).toEqual([]);
  });

  it("passes the signal to a write's own registry requests, not to the shared operator lookup", async () => {
    const { tokens, calls } = setup();
    const { signal } = new AbortController();
    await tokens.acceptMintOffer('00mint', { signal });
    expect(postCalls(calls)).toHaveLength(1);
    expect(postCalls(calls).every((call) => call.signal === signal)).toBe(true);
    // Shared with every other call of the wallet, so one caller's abort must not fail it for the rest.
    expect(calls.filter((call) => call.method === 'GET').map((call) => call.signal)).toEqual([undefined]);
  });

  it('stops a write that is still reading, submits nothing, and frees the write guard', async () => {
    const { tokens, wallet } = setup();
    const controller = new AbortController();
    const hold = holdNext(wallet, 'ledgerApi');
    const write = tokens.acceptMintOffer('00mint', { signal: controller.signal }).catch((error: unknown) => error);
    await hold.entered;
    controller.abort();
    expect(isAbort(await write)).toBe(true);
    hold.release();
    expect(wallet.submissions).toEqual([]);
    await expect(tokens.acceptMintOffer('00mint')).resolves.toMatchObject({ updateId: 'update-1' });
  });

  it('runs a write to its outcome once the wallet has it: a late abort is ignored', async () => {
    const { tokens, wallet } = setup();
    const controller = new AbortController();
    const hold = holdNext(wallet, 'prepareExecuteAndWait');
    const write = tokens.rejectMintOffer('00mint', { signal: controller.signal });
    await hold.entered;
    controller.abort();
    hold.release();
    await expect(write).resolves.toMatchObject({ updateId: 'update-1' });
    expect(wallet.submissions).toHaveLength(1);
  });

  it('stops one caller waiting for a shared snapshot without failing the others', async () => {
    const { tokens, wallet } = setup();
    const controller = new AbortController();
    const hold = holdNext(wallet, 'ledgerApi');
    const cancelled = tokens.loadState({ signal: controller.signal }).catch((error: unknown) => error);
    const kept = tokens.loadState();
    await hold.entered;
    controller.abort();
    expect(isAbort(await cancelled)).toBe(true);
    hold.release();
    await expect(kept).resolves.toMatchObject({ offset: expect.any(Number) });
  });

  it('cancels a planned transfer at submit time', async () => {
    const { tokens, wallet } = setup();
    const plan = await tokens.planTransfer(request);
    const submitted = await plan.submit({ signal: aborted() }).catch((error: unknown) => error);
    expect(isAbort(submitted)).toBe(true);
    expect(wallet.submissions).toEqual([]);
    await expect(plan.submit()).resolves.toMatchObject({ kind: 'offer' });
  });

  it('keeps the category and Canton error id when it names the burn reference of a failed submission', async () => {
    const { tokens } = setup({
      submitError: new RpcError(-32003, 'CONTRACT_NOT_FOUND(11,ab12): Contract could not be found'),
    });
    const error = await tokens
      .requestBurn({ instrumentId: INSTRUMENT, amount: '1', reference: 'holder-burn-x' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WalletSubmitError);
    expect(error).toMatchObject({
      outcome: 'failed',
      category: 'not-found',
      cantonErrorId: 'CONTRACT_NOT_FOUND',
      burnReference: 'holder-burn-x',
    });
  });
});
