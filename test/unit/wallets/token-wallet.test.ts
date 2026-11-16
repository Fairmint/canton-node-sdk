import { DA_REGISTRY_TEMPLATES } from '../../../src/da-registry/templates';
import { TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID } from '../../../src/utils/token-standard/v1/constants';
import { DA_UTILITIES_BASE_URLS, type DaUtilitiesClient } from '../../../src/wallets/da-utilities/client';
import { BURN_REFERENCE_PATTERN } from '../../../src/wallets/token-wallet';
import {
  createCip103Session,
  createDaUtilitiesClient,
  createTokenStandardWallet,
  createTokenWallet,
  createTokenWalletStore,
  describeWalletError,
  newBurnReference,
  RegistryResponseError,
  TokenWalletError,
  WalletSubmitError,
  type ActiveContract,
  type JsonObject,
  type TokenRegistry,
  type TokenStandardWallet,
  type TokenWallet,
  type TransferInstructionAction,
  type TransferKind,
  type TransferOffer,
  type TransferPlan,
} from '../../../src/wallets';
import {
  INSTRUMENT,
  CONTEXT_VALUES,
  contract,
  daDisclosed,
  DEVNET,
  disclosed,
  fakeFetch,
  fakeProvider,
  HOLDER,
  holdingView,
  NOW,
  OPERATOR,
  OTHER,
  REGISTRAR,
  RpcError,
  type FakeProvider,
  type FetchCall,
} from './helpers';
import { flush } from './session-helpers';

const FACTORY_T = 'Utility.Registry.App.V0.Service.AllocationFactory:AllocationFactory';
const PREAPPROVAL_T = 'Utility.Registry.App.V0.Model.TransferPreapproval:TransferPreapproval';
const extraArgs = { context: { values: CONTEXT_VALUES }, meta: { values: {} } };
const TS_PATH = `${DEVNET}/api/token-standard/v0/registrars/${encodeURIComponent(REGISTRAR)}/registry/transfer-instruction/v1`;

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

const MINT = 'Utility.Registry.App.V0.Model.Mint:MintOffer';
const OFFER = 'Utility.Registry.App.V0.Model.Transfer:TransferOffer';
const BURN = 'Utility.Registry.App.V0.Model.Burn:BurnRequest';
/** A registry provider serving REGISTRAR that is not REGISTRAR itself. */
const PROVIDER = 'provider::1220ab';

function ledger(
  extraHoldings: ActiveContract[] = [],
  daHoldings: ActiveContract[] = []
): Record<string, ActiveContract[]> {
  return {
    [DA_REGISTRY_TEMPLATES.holding]: daHoldings,
    [DA_REGISTRY_TEMPLATES.mintOffer]: [
      contract('00mint', MINT, mintArgs()),
      contract('00forged', MINT, mintArgs({ provider: OTHER })),
      contract('00badop', MINT, mintArgs({ operator: OTHER })),
      contract('00theirs', MINT, mintArgs({ holder: OTHER })),
      // Genuine-looking arguments, but signed by an attacker, not the provider.
      contract('00unsigned', MINT, mintArgs(), [], [OTHER]),
      // Made under another provider's service: trusted only through `trustedProviders`.
      contract('00mintprov', MINT, mintArgs({ provider: PROVIDER }), [], [PROVIDER]),
    ],
    [TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID]: [
      holdingView('00h10', '10'),
      holdingView('00h3', '3'),
      holdingView('00locked', '50', { lock: { holders: [REGISTRAR] } }),
      holdingView('00other', '99', { owner: OTHER }),
      ...extraHoldings,
    ],
    [DA_REGISTRY_TEMPLATES.transferOffer]: [
      contract('00in', OFFER, transferArgs(OTHER, HOLDER)),
      contract('00out', OFFER, transferArgs(HOLDER, OTHER)),
      contract('00forgedin', OFFER, transferArgs(OTHER, HOLDER, OTHER)),
      contract('00unsignedin', OFFER, transferArgs(OTHER, HOLDER), [], [OTHER]),
      contract('00inprov', OFFER, transferArgs(OTHER, HOLDER, PROVIDER), [], [PROVIDER]),
    ],
    [DA_REGISTRY_TEMPLATES.burnRequest]: [
      contract('00burn', BURN, burnArgs(HOLDER)),
      contract('00burnother', BURN, burnArgs(OTHER)),
      contract('00burnforged', BURN, burnArgs(HOLDER, OTHER)),
      contract('00burnunsigned', BURN, burnArgs(HOLDER), [], [OTHER, HOLDER]),
      contract('00burnprov', BURN, burnArgs(HOLDER, OPERATOR, PROVIDER), [], [PROVIDER, HOLDER]),
    ],
  };
}

function setup(
  options: {
    transferKind?: TransferKind;
    factoryTemplate?: string;
    party?: string;
    partyId?: string;
    extraHoldings?: ActiveContract[];
    /** Contracts the DA Holding template filter returns. */
    daHoldings?: ActiveContract[];
    trustedProviders?: Record<string, string[]>;
    isActive?: () => boolean;
  } = {}
): { tokens: TokenWallet; wallet: FakeProvider; calls: FetchCall[]; registry: DaUtilitiesClient } {
  const { fetch, calls } = fakeFetch((call: FetchCall) => {
    if (call.url.endsWith('/api/utilities/v0/operator')) {
      return { json: { partyId: OPERATOR } };
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
  const wallet = fakeProvider(ledger(options.extraHoldings, options.daHoldings), {
    party: options.party ?? HOLDER,
  });
  const registry = createDaUtilitiesClient(
    { network: 'devnet' },
    { fetch, ...(options.trustedProviders !== undefined && { trustedProviders: options.trustedProviders }) }
  );
  const tokens = createTokenWallet({
    provider: wallet,
    ...(options.partyId !== undefined && { partyId: options.partyId }),
    registry,
    now: () => NOW,
    ...(options.isActive !== undefined && { isActive: options.isActive }),
  });
  return { tokens, wallet, calls, registry };
}

const UUID = /^[0-9a-f-]{36}$/;

/** What every read of holdings asks for: the HoldingV1 interface and DA's holding template. */
const HOLDING_FILTERS = [
  { interfaceId: TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID },
  { templateId: DA_REGISTRY_TEMPLATES.holding },
];

/** The filters of a token wallet's state snapshot, in the order it sends them. */
const STATE_FILTERS = [
  ...HOLDING_FILTERS,
  { templateId: DA_REGISTRY_TEMPLATES.transferOffer },
  { templateId: DA_REGISTRY_TEMPLATES.mintOffer },
  { templateId: DA_REGISTRY_TEMPLATES.burnRequest },
];

const postCalls = (calls: FetchCall[]): FetchCall[] => calls.filter((c) => c.method === 'POST');

describe('createTokenWallet: holdings and listings', () => {
  it('lists the party holdings through the HoldingV1 interface', async () => {
    const { tokens, wallet } = setup();
    const holdings = await tokens.listHoldings();
    expect(holdings.map((h) => [h.contractId, h.locked])).toEqual([
      ['00h10', false],
      ['00h3', false],
      ['00locked', true],
    ]);
    // The one state snapshot: holdings, transfer offers, mint offers and burn requests in one read.
    expect(wallet.reads).toEqual([STATE_FILTERS]);
  });

  it('lists and spends only holdings of the registry it was given', async () => {
    // A Loop wallet also holds Canton Coin: an Amulet seen through the same HoldingV1 interface.
    const amulet: ActiveContract = {
      ...holdingView('00amulet', '1000', {
        instrument: { admin: 'dso::1220ff', id: 'Amulet' },
      }),
      templateId: 'b1f2:Splice.Amulet:Amulet',
    };
    const { tokens, wallet, calls } = setup({ extraHoldings: [amulet] });
    const holdings = await tokens.listHoldings();
    expect(holdings.map((h) => h.contractId)).toEqual(['00h10', '00h3', '00locked']);
    await expect(
      tokens.transfer({
        receiver: OTHER,
        instrumentId: { admin: 'dso::1220ff', id: 'Amulet' },
        amount: '1',
      })
    ).rejects.toMatchObject({ code: 'insufficient-balance' });
    expect(postCalls(calls)).toEqual([]);
    expect(wallet.submissions).toEqual([]);
  });

  it('ignores a look-alike holding the registrar did not sign, and accepts a genuine one', async () => {
    // Same template name and view, from the attacker's own package, with the wallet party as observer.
    const forged: ActiveContract = {
      ...holdingView('00forged', '1000000', { signatories: [OTHER] }),
      templateId: 'evil:Utility.Registry.Holding.V0.Holding:Holding',
      packageName: 'evil-holding',
    };
    const forgedSameName = holdingView('00forged2', '1000000', {
      signatories: [OTHER, HOLDER],
    });
    const wrongPackage: ActiveContract = {
      ...holdingView('00wrongpkg', '1000000'),
      packageName: 'evil-holding',
    };
    const genuine = holdingView('00genuine', '7');
    const { tokens, wallet, calls } = setup({
      extraHoldings: [forged, forgedSameName, wrongPackage, genuine],
    });
    expect((await tokens.listHoldings()).map((h) => h.contractId)).toEqual(['00h10', '00h3', '00locked', '00genuine']);
    // The forged million is never an input: the balance stays 20.
    await expect(tokens.transfer({ receiver: OTHER, instrumentId: INSTRUMENT, amount: '21' })).rejects.toMatchObject({
      code: 'insufficient-balance',
    });
    expect(postCalls(calls)).toEqual([]);
    expect(wallet.submissions).toEqual([]);
  });

  it('lists only genuine mint offers to the party', async () => {
    const { tokens, calls } = setup();
    const offers = await tokens.listMintOffers();
    expect(offers).toEqual([
      {
        contractId: '00mint',
        operator: OPERATOR,
        provider: REGISTRAR,
        holder: HOLDER,
        instrumentId: INSTRUMENT,
        amount: '100.0000000000',
        reference: 'mint_0001',
        requestedAt: '2026-11-13T00:00:00Z',
        executeBefore: '2026-11-16T00:00:00Z',
      },
    ]);
    // The operator is fetched once and cached.
    await tokens.listMintOffers();
    expect(calls.filter((c) => c.url.endsWith('/operator'))).toHaveLength(1);
  });

  it('splits transfer offers into incoming and outgoing, dropping forged ones', async () => {
    const { tokens } = setup();
    const { incoming, outgoing } = await tokens.listTransferOffers();
    expect(incoming.map((o) => o.contractId)).toEqual(['00in']);
    expect(outgoing.map((o) => o.contractId)).toEqual(['00out']);
    expect(incoming[0]?.memo).toBe('hello');
  });

  it('lists the party burn requests', async () => {
    const { tokens } = setup();
    const requests = await tokens.listBurnRequests();
    expect(requests.map((r) => [r.contractId, r.lockedHoldingCid, r.amount])).toEqual([
      ['00burn', '00locked', '5.0000000000'],
    ]);
  });
});

describe('createTokenWallet.loadState: one snapshot per refresh', () => {
  it('reads everything with one ledger-end call and one paged ACS stream', async () => {
    const { tokens, wallet, calls } = setup();
    const state = await tokens.loadState();
    expect(wallet.ledgerCalls()).toEqual(['GET /v2/state/ledger-end', 'POST /v2/state/active-contracts-page']);
    expect(wallet.reads).toEqual([STATE_FILTERS]);
    expect(state.partyId).toBe(HOLDER);
    expect(state.offset).toBe(4242);
    expect(state.holdings.map((h) => h.contractId)).toEqual(['00h10', '00h3', '00locked']);
    // The holdings summed per instrument, locked apart.
    expect(state.balances).toEqual([
      {
        key: 'XMPL@registrar::1220bb',
        instrumentId: INSTRUMENT,
        unlocked: '13.0000000000',
        locked: '50.0000000000',
        holdingCount: 3,
      },
    ]);
    expect(state.mintOffers.map((o) => o.contractId)).toEqual(['00mint']);
    expect(state.transferOffers.incoming.map((o) => o.contractId)).toEqual(['00in']);
    expect(state.transferOffers.outgoing.map((o) => o.contractId)).toEqual(['00out']);
    expect(state.burnRequests.map((r) => r.contractId)).toEqual(['00burn']);
    // The registry is asked only for its operator party.
    expect(calls.map((c) => c.url)).toEqual([`${DEVNET}/api/utilities/v0/operator`]);
    // The same as the list methods give.
    expect(state.mintOffers).toEqual(await tokens.listMintOffers());
    expect(state.burnRequests).toEqual(await tokens.listBurnRequests());
    expect(state.transferOffers).toEqual(await tokens.listTransferOffers());
    expect(state.holdings).toEqual(await tokens.listHoldings());
  });

  it('shares one in-flight snapshot between concurrent loadState and list calls', async () => {
    const { tokens, wallet } = setup();
    const [state, holdings, mints, offers, burns] = await Promise.all([
      tokens.loadState(),
      tokens.listHoldings(),
      tokens.listMintOffers(),
      tokens.listTransferOffers(),
      tokens.listBurnRequests(),
    ]);
    expect(wallet.ledgerCalls()).toEqual(['GET /v2/state/ledger-end', 'POST /v2/state/active-contracts-page']);
    // The party is resolved per call (an account switch is followed), but the ledger is read once.
    expect(wallet.requests.filter((r) => r.method === 'getPrimaryAccount')).toHaveLength(5);
    expect([holdings, mints, offers, burns]).toEqual([
      state.holdings,
      state.mintOffers,
      state.transferOffers,
      state.burnRequests,
    ]);
    // Once settled, the next call reads again.
    await tokens.loadState();
    expect(wallet.reads).toHaveLength(2);
  });

  it('does not share a snapshot of the previous party after an account switch', async () => {
    const { tokens, wallet } = setup();
    const { request } = wallet;
    const parties = [HOLDER, OTHER];
    wallet.request = async (args) => {
      const answer = await request(args);
      if (args.method !== 'getPrimaryAccount') return answer;
      return { ...(answer as Record<string, unknown>), partyId: parties.shift() ?? OTHER };
    };
    const [first, second] = await Promise.all([tokens.loadState(), tokens.loadState()]);
    expect([first.partyId, second.partyId]).toEqual([HOLDER, OTHER]);
    const readParties = wallet.requests.flatMap((r) =>
      r.method === 'ledgerApi' && r.params.resource === '/v2/state/active-contracts-page'
        ? [Object.keys((r.params.body?.['eventFormat'] as { filtersByParty: object }).filtersByParty)]
        : []
    );
    expect(readParties).toEqual([[HOLDER], [OTHER]]);
  });

  it('does not share a snapshot that started before a write settled', async () => {
    const { tokens, wallet } = setup({ partyId: HOLDER });
    let releaseRead: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const { request } = wallet;
    let gated = true;
    wallet.request = async (args) => {
      if (gated && args.method === 'ledgerApi' && args.params.resource === '/v2/state/ledger-end') {
        gated = false;
        await gate;
      }
      return request(args);
    };
    const before = tokens.loadState();
    await tokens.acceptMintOffer('00mint');
    const after = tokens.loadState();
    releaseRead();
    await Promise.all([before, after]);
    // The write's own fresh read, the early snapshot, and a new snapshot after the write (not the early one).
    expect(wallet.reads).toHaveLength(3);
    expect(wallet.reads).toContainEqual([{ templateId: DA_REGISTRY_TEMPLATES.mintOffer }]);
    expect(wallet.reads.filter((filters) => filters.length === STATE_FILTERS.length)).toEqual([
      STATE_FILTERS,
      STATE_FILTERS,
    ]);
  });

  it('shares a failed snapshot with the calls that joined it, and reads again afterwards', async () => {
    let fail = true;
    const { tokens, wallet } = setup({ partyId: HOLDER });
    const { request } = wallet;
    let failed = 0;
    wallet.request = async (args) => {
      if (fail && args.method === 'ledgerApi') {
        failed += 1;
        throw new RpcError(-32002, 'Ledger access unavailable');
      }
      return request(args);
    };
    const results = await Promise.allSettled([tokens.loadState(), tokens.listHoldings()]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    // One shared ledger-end call; -32002 is not retried.
    expect(failed).toBe(1);
    fail = false;
    await expect(tokens.loadState()).resolves.toMatchObject({ partyId: HOLDER });
  });

  it('backs off and retries a rate-limited snapshot, then loads', async () => {
    let limited = 2;
    const waits: number[] = [];
    const registryFetch = fakeFetch(() => ({ json: { partyId: OPERATOR } }));
    const wallet = fakeProvider(ledger(), {
      beforeLedgerApi: () => {
        if (limited > 0) {
          limited -= 1;
          throw new RpcError(-32005, 'Ledger access unavailable');
        }
      },
    });
    const tokens = createTokenWallet({
      provider: wallet,
      registry: createDaUtilitiesClient({ network: 'devnet' }, { fetch: registryFetch.fetch }),
      readRetry: {
        sleep: async (ms) => {
          waits.push(ms);
        },
        random: () => 0,
      },
    });
    const state = await tokens.loadState();
    expect(state.mintOffers.map((o) => o.contractId)).toEqual(['00mint']);
    expect(waits).toEqual([250, 500]);
    expect(wallet.ledgerCalls()).toEqual([
      'GET /v2/state/ledger-end',
      'GET /v2/state/ledger-end',
      'GET /v2/state/ledger-end',
      'POST /v2/state/active-contracts-page',
    ]);
    // Retries are ledger reads only: the registry is asked once.
    expect(registryFetch.calls).toHaveLength(1);
  });

  it('fails with a rate-limited WalletReadError, without the unpaged fallback, when the wallet keeps refusing', async () => {
    const wallet = fakeProvider(ledger(), {
      beforeLedgerApi: (resource) => {
        if (resource === '/v2/state/active-contracts-page') {
          throw new RpcError(-32005, 'Ledger access unavailable');
        }
      },
    });
    const tokens = createTokenWallet({
      provider: wallet,
      registry: createDaUtilitiesClient(
        { network: 'devnet' },
        { fetch: fakeFetch(() => ({ json: { partyId: OPERATOR } })).fetch }
      ),
      readRetry: { sleep: async () => undefined },
    });
    await expect(tokens.loadState()).rejects.toMatchObject({
      name: 'WalletReadError',
      code: -32005,
      rateLimited: true,
    });
    expect(wallet.ledgerCalls()).toEqual([
      'GET /v2/state/ledger-end',
      ...Array<string>(5).fill('POST /v2/state/active-contracts-page'),
    ]);
  });

  it('falls back to one unpaged read of every filter when the paged endpoint is not offered', async () => {
    const wallet = fakeProvider(ledger(), {
      beforeLedgerApi: (resource) => {
        if (resource === '/v2/state/active-contracts-page') throw new RpcError(4200, 'not allowed');
      },
    });
    const tokens = createTokenWallet({
      provider: wallet,
      registry: createDaUtilitiesClient(
        { network: 'devnet' },
        { fetch: fakeFetch(() => ({ json: { partyId: OPERATOR } })).fetch }
      ),
    });
    const state = await tokens.loadState();
    expect(state.holdings).toHaveLength(3);
    expect(state.burnRequests.map((r) => r.contractId)).toEqual(['00burn']);
    expect(wallet.ledgerCalls()).toEqual([
      'GET /v2/state/ledger-end',
      'POST /v2/state/active-contracts-page',
      'POST /v2/state/active-contracts',
    ]);
    expect(wallet.reads).toEqual([STATE_FILTERS]);
  });

  it('keeps a contract of another package out of the template lists', async () => {
    const { tokens } = setup({
      extraHoldings: [
        {
          ...contract('00evilmint', MINT, mintArgs()),
          packageName: 'evil-package',
          // Implements HoldingV1, so the holding filter returns it.
          interfaceViews: holdingView('x', '1').interfaceViews,
        },
      ],
    });
    const state = await tokens.loadState();
    expect(state.mintOffers.map((o) => o.contractId)).toEqual(['00mint']);
  });

  it('does not classify a same-name contract without a package name into the template lists', async () => {
    // Returned only by the HoldingV1 interface filter, with a MintOffer's `Module:Entity`, valid arguments and the
    // registrar's signature, but no `packageName` to prove it is DA's MintOffer: it is not listed (fail closed).
    const { packageName: _dropped, ...unproven } = contract('00nopkgmint', MINT, mintArgs());
    const { tokens } = setup({
      extraHoldings: [{ ...unproven, interfaceViews: holdingView('x', '1').interfaceViews }],
    });
    expect(unproven).not.toHaveProperty('packageName');
    const state = await tokens.loadState();
    expect(state.mintOffers.map((o) => o.contractId)).toEqual(['00mint']);
    expect((await tokens.listMintOffers()).map((o) => o.contractId)).toEqual(['00mint']);
  });

  it('lists the same holdings that a write spends, including a DA holding without a HoldingV1 view', async () => {
    const daHolding = (contractId: string, amount: string, signatories: readonly string[]): ActiveContract => ({
      ...contract(
        contractId,
        'Utility.Registry.Holding.V0.Holding:Holding',
        { owner: HOLDER, instrument: { source: REGISTRAR, id: 'XMPL' }, amount, lock: null },
        [],
        signatories
      ),
      packageName: 'utility-registry-holding-v0',
    });
    // The ledger could not compute their HoldingV1 view; only the DA Holding template filter's create argument reads.
    const { tokens, wallet } = setup({
      daHoldings: [daHolding('00noview', '100', [REGISTRAR, HOLDER]), daHolding('00noviewforged', '900', [OTHER])],
    });
    const state = await tokens.loadState();
    expect(state.holdings.map((h) => h.contractId)).toEqual(['00h10', '00h3', '00locked', '00noview']);
    expect((await tokens.listHoldings()).map((h) => h.contractId)).toEqual(state.holdings.map((h) => h.contractId));
    // The write's fresh read sees exactly these: 10 + 3 + 100 unlocked, all of it spendable, and not one unit more.
    await expect(
      tokens.transfer({ receiver: OTHER, instrumentId: INSTRUMENT, amount: '113.0000000001' })
    ).rejects.toMatchObject({ code: 'insufficient-balance' });
    await tokens.transfer({ receiver: OTHER, instrumentId: INSTRUMENT, amount: '113' });
    expect(wallet.submissions).toHaveLength(1);
    expect(wallet.reads).toEqual([STATE_FILTERS, STATE_FILTERS, HOLDING_FILTERS, HOLDING_FILTERS]);
    expect(wallet.submissions[0]).toMatchObject({
      commands: [
        { ExerciseCommand: { choiceArgument: { transfer: { inputHoldingCids: ['00noview', '00h10', '00h3'] } } } },
      ],
    });
  });
});

describe('createTokenWallet.acceptMintOffer', () => {
  it('fetches the accept context and submits MintOffer_Accept', async () => {
    const { tokens, wallet, calls } = setup();
    await expect(tokens.acceptMintOffer('00mint', { expectedRegistrar: REGISTRAR })).resolves.toEqual({
      updateId: 'update-1',
      commandId: expect.stringMatching(UUID),
    });
    expect(postCalls(calls)).toEqual([
      {
        url: `${DEVNET}/api/utilities/v0/registry/mint/v0/offer/00mint/choice-contexts/accept`,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {},
      },
    ]);
    expect(wallet.submissions).toEqual([
      {
        commandId: expect.stringMatching(UUID),
        commands: [
          {
            ExerciseCommand: {
              templateId: '#utility-registry-app-v0:Utility.Registry.App.V0.Model.Mint:MintOffer',
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

  it.each([
    ['00missing', 'not-found'],
    ['00theirs', 'not-addressed-to-wallet'],
    ['00forged', 'unexpected-registrar'],
    ['00badop', 'unexpected-registrar'],
  ])('refuses %s with %s and submits nothing', async (cid, code) => {
    const { tokens, wallet } = setup();
    await expect(tokens.acceptMintOffer(cid)).rejects.toMatchObject({ code });
    expect(wallet.submissions).toEqual([]);
  });

  it('refuses an offer its provider did not sign', async () => {
    const { tokens, wallet, calls } = setup();
    await expect(tokens.acceptMintOffer('00unsigned')).rejects.toMatchObject({
      code: 'unexpected-registrar',
    });
    expect(postCalls(calls)).toEqual([]);
    expect(wallet.submissions).toEqual([]);
  });

  it('refuses an offer of another registrar than expected', async () => {
    const { tokens, wallet } = setup();
    await expect(tokens.acceptMintOffer('00mint', { expectedRegistrar: OTHER })).rejects.toMatchObject({
      code: 'unexpected-registrar',
    });
    expect(wallet.submissions).toEqual([]);
  });
});

describe('createTokenWallet: registrars served by another provider (trustedProviders)', () => {
  it('by default trusts only a registrar that is its own provider', async () => {
    const { tokens, wallet } = setup();
    expect((await tokens.listMintOffers()).map((o) => o.contractId)).toEqual(['00mint']);
    expect((await tokens.listTransferOffers()).incoming.map((o) => o.contractId)).toEqual(['00in']);
    expect((await tokens.listBurnRequests()).map((r) => r.contractId)).toEqual(['00burn']);
    await expect(tokens.acceptMintOffer('00mintprov')).rejects.toMatchObject({ code: 'unexpected-registrar' });
    await expect(tokens.acceptTransferOffer('00inprov')).rejects.toMatchObject({ code: 'not-found' });
    expect(wallet.submissions).toEqual([]);
  });

  it('trusts exactly the providers listed for the instrument admin', async () => {
    const { tokens, wallet } = setup({ trustedProviders: { [REGISTRAR]: [PROVIDER] } });
    expect((await tokens.listMintOffers()).map((o) => o.contractId)).toEqual(['00mintprov']);
    expect((await tokens.listTransferOffers()).incoming.map((o) => o.contractId)).toEqual(['00inprov']);
    expect((await tokens.listBurnRequests()).map((r) => r.contractId)).toEqual(['00burnprov']);
    await expect(tokens.acceptMintOffer('00mintprov', { expectedRegistrar: REGISTRAR })).resolves.toMatchObject({
      updateId: 'update-1',
    });
    // The registrar itself is no longer trusted as its own provider unless listed, and other providers never are.
    await expect(tokens.acceptMintOffer('00mint')).rejects.toMatchObject({ code: 'unexpected-registrar' });
    await expect(tokens.acceptMintOffer('00forged')).rejects.toMatchObject({ code: 'unexpected-registrar' });
    expect(wallet.submissions).toHaveLength(1);
  });

  it('still requires the trusted provider to have signed', async () => {
    const { tokens, wallet } = setup({ trustedProviders: { [REGISTRAR]: [REGISTRAR, OTHER] } });
    // 00forged names OTHER as provider and is signed by REGISTRAR only, so OTHER's signature is missing.
    await expect(tokens.acceptMintOffer('00forged')).rejects.toMatchObject({ code: 'unexpected-registrar' });
    expect((await tokens.listMintOffers()).map((o) => o.contractId)).toEqual(['00mint']);
    expect(wallet.submissions).toEqual([]);
  });
});

describe('createTokenWallet.requestBurn', () => {
  it('selects holdings, fetches the burn factory and submits AllocationFactory_RequestBurn', async () => {
    const { tokens, wallet, calls } = setup();
    await expect(
      tokens.requestBurn({
        instrumentId: INSTRUMENT,
        amount: '12',
        reference: 'redemption-42',
      })
    ).resolves.toEqual({ updateId: 'update-1', commandId: expect.stringMatching(UUID), reference: 'redemption-42' });
    expect(postCalls(calls)[0]?.body).toEqual({
      holder: HOLDER,
      holdingContractIds: ['00h10', '00h3'],
      instrumentId: { admin: REGISTRAR, id: 'XMPL' },
    });
    expect(wallet.submissions).toEqual([
      {
        commandId: expect.stringMatching(UUID),
        commands: [
          {
            ExerciseCommand: {
              templateId:
                '#utility-registry-app-v0:Utility.Registry.App.V0.Service.AllocationFactory:AllocationFactory',
              contractId: '00alloc',
              choice: 'AllocationFactory_RequestBurn',
              choiceArgument: {
                expectedAdmin: REGISTRAR,
                burn: {
                  instrumentId: { admin: REGISTRAR, id: 'XMPL' },
                  amount: '12.0000000000',
                  holder: HOLDER,
                  reference: 'redemption-42',
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
      },
    ]);
  });

  it('files a generated reference when none is given, and returns it', async () => {
    const { tokens, wallet } = setup();
    const result = await tokens.requestBurn({ instrumentId: INSTRUMENT, amount: '1' });
    // The wallet's clock (NOW), to the second.
    expect(result.reference).toMatch(/^holder-burn-20261113T120000Z-[0-9a-z]{6}$/);
    expect(result.reference).toMatch(BURN_REFERENCE_PATTERN);
    const command = wallet.submissions[0]?.commands[0];
    expect(command && 'ExerciseCommand' in command && command.ExerciseCommand.choiceArgument).toMatchObject({
      burn: { reference: result.reference },
    });
  });

  it.each([
    ['unknown', new RpcError(4900, 'Disconnected')],
    ['failed', new RpcError(-32003, 'Transaction rejected')],
  ])('puts the generated reference on a %s submission error', async (outcome, rpcError) => {
    const { tokens, wallet } = setup();
    const original = wallet.request.bind(wallet);
    wallet.request = async (args) => {
      if (args.method === 'prepareExecuteAndWait') throw rpcError;
      return original(args);
    };
    const error = await tokens.requestBurn({ instrumentId: INSTRUMENT, amount: '1' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WalletSubmitError);
    const submitError = error as WalletSubmitError;
    expect(submitError.outcome).toBe(outcome);
    expect(submitError.burnReference).toMatch(/^holder-burn-20261113T120000Z-[0-9a-z]{6}$/);
    expect(submitError.message).toContain(`Burn reference: ${String(submitError.burnReference)}.`);
    // A caller's own reference is carried the same way.
    const own = await tokens
      .requestBurn({ instrumentId: INSTRUMENT, amount: '1', reference: 'redemption-7' })
      .catch((e: unknown) => e);
    expect(own).toMatchObject({ outcome, burnReference: 'redemption-7' });
    // A reference that also occurs in the wallet's own text still gets the suffix.
    const common = await tokens
      .requestBurn({ instrumentId: INSTRUMENT, amount: '1', reference: 'wallet' })
      .catch((e: unknown) => e);
    expect(common).toMatchObject({ outcome, burnReference: 'wallet' });
    expect((common as WalletSubmitError).message).toMatch(/ Burn reference: wallet\.$/);
  });

  it('uses a given executeBefore', async () => {
    const { tokens, wallet } = setup();
    await tokens.requestBurn({
      instrumentId: INSTRUMENT,
      amount: '1',
      reference: 'r',
      executeBefore: new Date('2026-11-15T00:00:00Z'),
    });
    const command = wallet.submissions[0]?.commands[0];
    expect(JSON.stringify(command)).toContain('"executeBefore":"2026-11-15T00:00:00.000Z"');
  });

  it.each(['', '-leading-dash', 'has space', 'a'.repeat(101), 'jane@doe.com'])(
    'refuses the reference %j',
    async (reference) => {
      const { tokens, wallet, calls } = setup();
      await expect(tokens.requestBurn({ instrumentId: INSTRUMENT, amount: '1', reference })).rejects.toMatchObject({
        code: 'invalid-input',
      });
      expect(calls).toEqual([]);
      expect(wallet.submissions).toEqual([]);
    }
  );

  it('refuses a past deadline, an insufficient balance and an unexpected factory', async () => {
    let { tokens } = setup();
    await expect(
      tokens.requestBurn({
        instrumentId: INSTRUMENT,
        amount: '1',
        reference: 'r',
        executeBefore: NOW,
      })
    ).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(tokens.requestBurn({ instrumentId: INSTRUMENT, amount: '14', reference: 'r' })).rejects.toMatchObject({
      code: 'insufficient-balance',
    });
    for (const executeBefore of [new Date(Number.NaN), new Date('soon')]) {
      const { tokens: fresh, wallet, calls } = setup();
      await expect(
        fresh.requestBurn({
          instrumentId: INSTRUMENT,
          amount: '1',
          reference: 'r',
          executeBefore,
        })
      ).rejects.toMatchObject({
        name: 'TokenWalletError',
        code: 'invalid-input',
      });
      expect(postCalls(calls)).toEqual([]);
      expect(wallet.submissions).toEqual([]);
    }
    ({ tokens } = setup({ factoryTemplate: 'Evil:Factory' }));
    await expect(tokens.requestBurn({ instrumentId: INSTRUMENT, amount: '1', reference: 'r' })).rejects.toBeInstanceOf(
      RegistryResponseError
    );
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
    // A transfer agent may reserve `redeem-` for the redemptions it files itself.
    expect(reference).not.toMatch(/^redeem-/);
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

  it('differs between two calls in the same second, and defaults to now', () => {
    const at = new Date('2026-11-13T15:27:05Z');
    const references = new Set(Array.from({ length: 20 }, () => newBurnReference(at)));
    expect(references.size).toBe(20);
    expect(newBurnReference()).toMatch(/^holder-burn-\d{8}T\d{6}Z-[0-9a-z]{6}$/);
  });

  it('refuses an invalid date', () => {
    expect(() => newBurnReference(new Date('soon'))).toThrow(TokenWalletError);
  });
});

describe('createTokenWallet({ network })', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(['devnet', 'mainnet'] as const)(
    'builds the DA registry client of %s with the global fetch',
    async (network) => {
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () =>
          Promise.resolve(new Response(JSON.stringify({ partyId: OPERATOR }), { status: 200 }))
        );
      const tokens = createTokenWallet({ provider: fakeProvider(ledger()), network, now: () => NOW });
      const state = await tokens.loadState();
      expect(state.mintOffers.map((o) => o.contractId)).toEqual(['00mint']);
      expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
        `${DA_UTILITIES_BASE_URLS[network]}/api/utilities/v0/operator`,
      ]);
    }
  );

  it('refuses options with neither a registry nor a known network', () => {
    const provider = fakeProvider(ledger());
    expect(() => createTokenWallet({ provider } as unknown as Parameters<typeof createTokenWallet>[0])).toThrow(
      expect.objectContaining({ name: 'TokenWalletError', code: 'invalid-input' })
    );
    expect(() =>
      createTokenWallet({ provider, network: 'testnet' } as unknown as Parameters<typeof createTokenWallet>[0])
    ).toThrow(expect.objectContaining({ code: 'invalid-input' }));
  });
});

describe('createTokenWallet transfers', () => {
  const request = {
    receiver: OTHER,
    instrumentId: INSTRUMENT,
    amount: '4',
    memo: 'invoice 7',
  };

  it('previews the transfer kind without submitting', async () => {
    const { tokens, wallet } = setup({ transferKind: 'direct' });
    await expect(tokens.previewTransfer(request)).resolves.toBe('direct');
    expect(wallet.submissions).toEqual([]);
  });

  it('proposes a transfer (offer) through TransferFactory_Transfer', async () => {
    const { tokens, wallet, calls } = setup({ transferKind: 'offer' });
    await expect(tokens.transfer(request)).resolves.toEqual({
      kind: 'offer',
      updateId: 'update-1',
      commandId: expect.stringMatching(UUID),
    });
    const transfer = {
      sender: HOLDER,
      receiver: OTHER,
      amount: '4.0000000000',
      instrumentId: { admin: REGISTRAR, id: 'XMPL' },
      // Back-dated 60 s: the factory requires requestedAt in the past by ledger time.
      requestedAt: '2026-11-13T11:59:00.000Z',
      executeBefore: '2026-11-14T12:00:00.000Z',
      inputHoldingCids: ['00h10'],
      meta: {
        values: { 'splice.lfdecentralizedtrust.org/reason': 'invoice 7' },
      },
    };
    expect(postCalls(calls)[0]).toEqual({
      url: `${TS_PATH}/transfer-factory`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: {
        choiceArguments: {
          expectedAdmin: REGISTRAR,
          transfer,
          extraArgs: { context: { values: {} }, meta: { values: {} } },
        },
        excludeDebugFields: true,
      },
    });
    expect(wallet.submissions).toEqual([
      {
        commandId: expect.stringMatching(UUID),
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

  it('transfers via the receiver preapproval (direct)', async () => {
    const { tokens, wallet } = setup({ transferKind: 'direct' });
    await expect(tokens.transfer({ ...request, requirePreapproval: true })).resolves.toMatchObject({
      kind: 'direct',
      updateId: 'update-1',
    });
    const command = wallet.submissions[0]?.commands[0];
    expect(command && 'ExerciseCommand' in command && command.ExerciseCommand.contractId).toBe('00preapproval');
    expect(wallet.submissions[0]?.disclosedContracts).toEqual([disclosed('00preapproval', PREAPPROVAL_T)]);
  });

  it.each(['offer', 'self'] as const)(
    'requirePreapproval refuses a registry answer of %s and submits nothing',
    async (transferKind) => {
      const { tokens, wallet } = setup({ transferKind });
      const error = await tokens.transfer({ ...request, requirePreapproval: true }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(TokenWalletError);
      expect(error).toMatchObject({ code: 'preapproval-required' });
      expect((error as Error).message).toMatch(/nothing was submitted/);
      expect(wallet.submissions).toEqual([]);
    }
  );

  it.each([
    ['direct', 'offer'],
    ['offer', 'direct'],
  ] as const)(
    'expectedKind refuses a registry answer of %s after a previewed %s',
    async (transferKind, expectedKind) => {
      const { tokens, wallet } = setup({ transferKind });
      const error = await tokens.transfer({ ...request, expectedKind }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(TokenWalletError);
      expect(error).toMatchObject({ code: 'kind-changed' });
      expect((error as Error).message).toMatch(/nothing was submitted/);
      expect(wallet.submissions).toEqual([]);
    }
  );

  it('expectedKind submits when the registry answers the previewed kind', async () => {
    const { tokens, wallet } = setup({ transferKind: 'direct' });
    await expect(tokens.transfer({ ...request, expectedKind: 'direct' })).resolves.toMatchObject({ kind: 'direct' });
    expect(wallet.submissions).toHaveLength(1);
  });

  it('planTransfer previews the kind and submits exactly the planned request with expectedKind', async () => {
    const { tokens, wallet, calls } = setup({ transferKind: 'direct' });
    const edited = { receiver: OTHER, instrumentId: { admin: REGISTRAR, id: 'XMPL' }, amount: '4' };
    const plan = await tokens.planTransfer(edited);
    expect(plan.kind).toBe('direct');
    expect(plan.request).toEqual({ receiver: OTHER, instrumentId: INSTRUMENT, amount: '4' });
    expect(Object.isFrozen(plan.request)).toBe(true);
    expect(wallet.submissions).toEqual([]);
    // A later edit of the caller's object does not change what is submitted.
    edited.amount = '9';
    edited.instrumentId.id = 'OTHER';
    await expect(plan.submit({ memo: 'invoice 7', requirePreapproval: true })).resolves.toMatchObject({
      kind: 'direct',
      updateId: 'update-1',
    });
    expect(wallet.submissions).toHaveLength(1);
    const factoryBodies = postCalls(calls).filter((c) => c.url.endsWith('/transfer-factory'));
    expect(factoryBodies).toHaveLength(2);
    expect(factoryBodies[1]?.body).toMatchObject({
      choiceArguments: {
        transfer: {
          amount: '4.0000000000',
          instrumentId: INSTRUMENT,
          meta: { values: { 'splice.lfdecentralizedtrust.org/reason': 'invoice 7' } },
        },
      },
    });
  });

  it('planTransfer refuses to submit when the kind changed since the plan, or without a preapproval', async () => {
    const options: { transferKind: TransferKind } = { transferKind: 'direct' };
    const { tokens, wallet } = setup(options);
    const plan = await tokens.planTransfer(request);
    options.transferKind = 'offer';
    await expect(plan.submit()).rejects.toMatchObject({ code: 'kind-changed' });
    const offer = await tokens.planTransfer(request);
    expect(offer.kind).toBe('offer');
    await expect(offer.submit({ requirePreapproval: true })).rejects.toMatchObject({ code: 'preapproval-required' });
    expect(wallet.submissions).toEqual([]);
    await expect(offer.submit()).resolves.toMatchObject({ kind: 'offer' });
    expect(wallet.submissions).toHaveLength(1);
  });

  /** Make the fake wallet's primary account whatever `account.party` says at the time of each `getPrimaryAccount`. */
  function switchableAccount(wallet: FakeProvider): { party: string } {
    const account = { party: HOLDER };
    const { request: original } = wallet;
    wallet.request = async (args) => {
      const answer = await original(args);
      if (args.method !== 'getPrimaryAccount') return answer;
      return { ...(answer as Record<string, unknown>), partyId: account.party };
    };
    return account;
  }

  const factorySenders = (calls: FetchCall[]): unknown[] =>
    postCalls(calls)
      .filter((c) => c.url.endsWith('/transfer-factory'))
      .map((c) => (c.body as { choiceArguments: { transfer: { sender: string } } }).choiceArguments.transfer.sender);

  it('planTransfer refuses to submit after an account switch, and submits nothing as either party', async () => {
    const { tokens, wallet, calls } = setup({ transferKind: 'offer' });
    const account = switchableAccount(wallet);
    const plan = await tokens.planTransfer(request);
    expect(plan.partyId).toBe(HOLDER);
    // OTHER holds enough to cover the amount, so without the check the same kind would be submitted as OTHER.
    account.party = OTHER;
    const error = await plan.submit().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TokenWalletError);
    expect(error).toMatchObject({ code: 'invalid-input' });
    expect((error as Error).message).toMatch(/nothing was submitted/);
    expect((error as Error).message).toContain(HOLDER);
    expect((error as Error).message).toContain(OTHER);
    expect(wallet.submissions).toEqual([]);
    // Refused before any read or registry call for the submission.
    expect(factorySenders(calls)).toEqual([HOLDER]);
    // The refusal released the write guard: back on the previewed party, the plan submits as it.
    account.party = HOLDER;
    await expect(plan.submit()).resolves.toMatchObject({ kind: 'offer' });
    expect(wallet.submissions.map((s) => s.actAs)).toEqual([[HOLDER]]);
  });

  it('planTransfer submits as the previewed party when the account did not change', async () => {
    const { tokens, wallet, calls } = setup({ transferKind: 'offer' });
    switchableAccount(wallet);
    const plan = await tokens.planTransfer(request);
    expect(plan.partyId).toBe(HOLDER);
    await expect(plan.submit({ memo: 'invoice 7' })).resolves.toMatchObject({ kind: 'offer' });
    expect(wallet.submissions.map((s) => s.actAs)).toEqual([[HOLDER]]);
    expect(factorySenders(calls)).toEqual([HOLDER, HOLDER]);
    // The submission resolved the account once, to check it, and read and signed as the planned party.
    expect(wallet.requests.filter((r) => r.method === 'getPrimaryAccount')).toHaveLength(2);
  });

  it('planTransfer with a pinned partyId acts as that party whatever the primary account', async () => {
    const { tokens, wallet, calls } = setup({ transferKind: 'offer', partyId: HOLDER, party: OTHER });
    const plan = await tokens.planTransfer(request);
    expect(plan.partyId).toBe(HOLDER);
    await expect(plan.submit()).resolves.toMatchObject({ kind: 'offer' });
    expect(wallet.submissions.map((s) => s.actAs)).toEqual([[HOLDER]]);
    expect(factorySenders(calls)).toEqual([HOLDER, HOLDER]);
    expect(wallet.requests.filter((r) => r.method === 'getPrimaryAccount')).toHaveLength(0);
  });

  it('refuses every write once isActive answers false, before any read, registry call or signature', async () => {
    let active = false;
    const { tokens, wallet, calls } = setup({ transferKind: 'offer', partyId: HOLDER, isActive: () => active });
    const writes: Array<() => Promise<unknown>> = [
      async () => tokens.transfer(request),
      async () => tokens.requestBurn({ instrumentId: INSTRUMENT, amount: '1', reference: 'r' }),
      async () => tokens.acceptMintOffer('00mint'),
      async () => tokens.createTransferPreapproval({ instrumentAdmin: REGISTRAR }),
      async () => tokens.acceptTransferOffer('00in'),
      async () => tokens.rejectTransferOffer('00in'),
      async () => tokens.withdrawTransferOffer('00out'),
      async () => tokens.answerTransferOffer('00in', 'accept'),
    ];
    for (const write of writes) {
      const error = await write().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(TokenWalletError);
      expect(error).toMatchObject({ code: 'invalid-input' });
      expect(describeWalletError(error)).toEqual({
        kind: 'refused',
        code: 'invalid-input',
        message:
          'The wallet session this action was prepared in has ended (the wallet disconnected or switched accounts); nothing was submitted. Start the action again.',
      });
    }
    expect(wallet.requests).toEqual([]);
    expect(calls).toEqual([]);
    // Reads are not limited.
    await expect(tokens.listHoldings()).resolves.toHaveLength(3);
    // A plan made while active is refused once the session ended, though its party is pinned.
    active = true;
    const plan = await tokens.planTransfer(request);
    active = false;
    const requests = wallet.requests.length;
    const fetches = calls.length;
    await expect(plan.submit()).rejects.toMatchObject({ code: 'invalid-input' });
    expect(wallet.requests.slice(requests)).toEqual([]);
    expect(calls.slice(fetches)).toEqual([]);
    // The refusal released the write guard.
    active = true;
    await expect(plan.submit()).resolves.toMatchObject({ kind: 'offer' });
    expect(wallet.submissions.map((s) => s.actAs)).toEqual([[HOLDER]]);
  });

  it('checks isActive again right before signing: a session that ended during the registry call submits nothing', async () => {
    let active = true;
    const { tokens, wallet, calls } = setup({ transferKind: 'offer', partyId: HOLDER, isActive: () => active });
    const plan = await tokens.planTransfer(request);
    const { request: original } = wallet;
    // The session ends while the submission reads its holdings.
    wallet.request = async (args) => {
      if (args.method === 'ledgerApi') active = false;
      return original(args);
    };
    await expect(plan.submit()).rejects.toMatchObject({ code: 'invalid-input' });
    active = true;
    await expect(tokens.requestBurn({ instrumentId: INSTRUMENT, amount: '1', reference: 'r' })).rejects.toMatchObject({
      code: 'invalid-input',
    });
    expect(wallet.submissions).toEqual([]);
    expect(wallet.requests.map((r) => r.method)).not.toContain('prepareExecuteAndWait');
    // It got as far as the registry: the check before signing refused it.
    expect(factorySenders(calls)).toEqual([HOLDER, HOLDER]);
  });

  it('through createTokenWalletStore, a plan made for one account is refused after the session switched to another', async () => {
    const { wallet: provider, registry, calls } = setup({ transferKind: 'offer' });
    const account = switchableAccount(provider);
    const session = createCip103Session();
    const store = createTokenWalletStore({
      session,
      open: (connected, { isActive }) =>
        createTokenWallet({
          provider: connected.provider,
          partyId: connected.partyId,
          registry,
          now: () => NOW,
          isActive,
        }),
    });
    await session.connected(provider, { network: 'devnet' });
    await flush();
    let plan: TransferPlan | null = null;
    expect(
      await store.run(
        'plan',
        async ({ tokens }) => {
          plan = await tokens.planTransfer(request);
        },
        { readOnly: true }
      )
    ).toBe(true);
    // The wallet switches to OTHER (who holds enough too): a new ConnectedWallet.
    account.party = OTHER;
    await session.connected(provider, { network: 'devnet' });
    await flush();
    expect(store.getSnapshot()).toMatchObject({ wallet: { partyId: OTHER }, busy: false });
    // The user confirms the plan shown for HOLDER.
    const confirmed = plan as unknown as TransferPlan;
    expect(confirmed.partyId).toBe(HOLDER);
    expect(await store.run('send', async () => confirmed.submit().then(() => 'Sent.'))).toBe(false);
    expect(store.getSnapshot().outcome).toMatchObject({
      status: 'failed',
      partyId: OTHER,
      error: { kind: 'refused', code: 'invalid-input' },
    });
    expect(provider.submissions).toEqual([]);
    // Only the plan's own registry call: the submission was refused before it read anything.
    expect(factorySenders(calls)).toEqual([HOLDER]);
    store.dispose();
  });

  it('refuses a second submission while the first awaits the wallet', async () => {
    const { tokens, wallet } = setup();
    let release: () => void = () => undefined;
    let entered: () => void = () => undefined;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const original = wallet.request.bind(wallet);
    let held = false;
    wallet.request = async (args) => {
      if (args.method === 'prepareExecuteAndWait' && !held) {
        held = true;
        entered();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return original(args);
    };
    const first = tokens.transfer(request);
    await waiting;
    await expect(tokens.acceptMintOffer('00mint')).rejects.toMatchObject({
      code: 'busy',
    });
    release();
    await expect(first).resolves.toMatchObject({ updateId: 'update-1' });
    // Free again once the first completed.
    await expect(tokens.acceptMintOffer('00mint')).resolves.toMatchObject({
      updateId: 'update-1',
    });
  });

  it('takes the write guard before preparing, so a concurrent write is refused at once', async () => {
    const { tokens, wallet, calls } = setup();
    let release: () => void = () => undefined;
    const original = wallet.request.bind(wallet);
    let held = false;
    wallet.request = async (args) => {
      // Hold the first write's very first wallet call: its preparation is slow.
      if (!held) {
        held = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return original(args);
    };
    const first = tokens.transfer(request);
    const writes = [
      tokens.transfer(request),
      tokens.requestBurn({ instrumentId: INSTRUMENT, amount: '1', reference: 'r' }),
      tokens.acceptMintOffer('00mint'),
      tokens.createTransferPreapproval({ instrumentAdmin: REGISTRAR }),
      tokens.acceptTransferOffer('00in'),
      tokens.rejectTransferOffer('00in'),
      tokens.withdrawTransferOffer('00out'),
    ];
    for (const write of writes) {
      await expect(write).rejects.toMatchObject({ code: 'busy' });
    }
    // Reads are not guarded.
    const reading = tokens.listHoldings();
    release();
    await expect(reading).resolves.toHaveLength(3);
    await expect(first).resolves.toMatchObject({ updateId: 'update-1' });
    expect(wallet.submissions).toHaveLength(1);
    expect(postCalls(calls)).toHaveLength(1);
  });

  it('releases the write guard after a failed write', async () => {
    const { tokens, wallet } = setup();
    await expect(tokens.transfer({ ...request, amount: '1000' })).rejects.toMatchObject({
      code: 'insufficient-balance',
    });
    await expect(tokens.transfer({ ...request, receiver: ' ' })).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(tokens.transfer(request)).resolves.toMatchObject({
      updateId: 'update-1',
    });
    expect(wallet.submissions).toHaveLength(1);
  });

  it('refuses a clock that gives an invalid time before submitting', async () => {
    const wallet = fakeProvider(ledger());
    const tokens = createTokenWallet({
      provider: wallet,
      registry: createDaUtilitiesClient({ network: 'devnet' }, { fetch: fakeFetch(() => ({ json: {} })).fetch }),
      now: () => new Date(Number.NaN),
    });
    await expect(tokens.transfer(request)).rejects.toMatchObject({
      code: 'invalid-input',
    });
    await expect(tokens.requestBurn({ instrumentId: INSTRUMENT, amount: '1', reference: 'r' })).rejects.toMatchObject({
      code: 'invalid-input',
    });
    expect(wallet.submissions).toEqual([]);
  });

  it('leaves the memo out when none is given', async () => {
    const { tokens, calls } = setup();
    await tokens.transfer({ receiver: OTHER, instrumentId: INSTRUMENT, amount: '1' });
    const body = postCalls(calls)[0]?.body as {
      choiceArguments: { transfer: { meta: unknown } };
    };
    expect(body.choiceArguments.transfer.meta).toEqual({ values: {} });
  });

  it('refuses a factory the registry did not disclose or of an unexpected template', async () => {
    const { tokens, wallet } = setup({
      factoryTemplate: 'Evil.Module:Factory',
    });
    await expect(tokens.transfer(request)).rejects.toBeInstanceOf(RegistryResponseError);
    expect(wallet.submissions).toEqual([]);
  });

  it('refuses an insufficient balance before calling the registry', async () => {
    const { tokens, calls } = setup();
    await expect(tokens.transfer({ ...request, amount: '13.0000000001' })).rejects.toMatchObject({
      code: 'insufficient-balance',
    });
    expect(postCalls(calls)).toEqual([]);
  });

  it('refuses an empty receiver', async () => {
    const { tokens } = setup();
    await expect(tokens.transfer({ ...request, receiver: ' ' })).rejects.toMatchObject({
      code: 'invalid-input',
    });
  });
});

describe('createTokenWallet.createTransferPreapproval', () => {
  it('creates the DA preapproval with the operator from the registry', async () => {
    const { tokens, wallet } = setup();
    await tokens.createTransferPreapproval({
      instrumentAdmin: REGISTRAR,
      instrumentIds: ['XMPL', 'XMPL'],
    });
    expect(wallet.submissions).toEqual([
      {
        commandId: expect.stringMatching(UUID),
        commands: [
          {
            CreateCommand: {
              templateId:
                '#utility-registry-app-v0:Utility.Registry.App.V0.Model.TransferPreapproval:TransferPreapproval',
              createArguments: {
                operator: OPERATOR,
                receiver: HOLDER,
                instrumentAdmin: REGISTRAR,
                instrumentAllowances: [{ id: 'XMPL' }],
              },
            },
          },
        ],
        actAs: [HOLDER],
      },
    ]);
  });

  it('covers every instrument of the admin with no ids, and refuses more than 10', async () => {
    const { tokens, wallet } = setup();
    await tokens.createTransferPreapproval({ instrumentAdmin: REGISTRAR });
    expect(wallet.submissions[0]?.commands).toEqual([
      {
        CreateCommand: expect.objectContaining({
          createArguments: {
            operator: OPERATOR,
            receiver: HOLDER,
            instrumentAdmin: REGISTRAR,
            instrumentAllowances: [],
          },
        }),
      },
    ]);
    await expect(
      tokens.createTransferPreapproval({
        instrumentAdmin: REGISTRAR,
        instrumentIds: Array.from({ length: 11 }, (_, i) => `I${i}`),
      })
    ).rejects.toMatchObject({ code: 'invalid-input' });
  });
});

describe('createTokenWallet: answering transfer offers', () => {
  it.each([
    ['acceptTransferOffer', '00in', 'accept', 'TransferInstruction_Accept'],
    ['rejectTransferOffer', '00in', 'reject', 'TransferInstruction_Reject'],
    ['withdrawTransferOffer', '00out', 'withdraw', 'TransferInstruction_Withdraw'],
  ] as const)('%s fetches the %s context and exercises the interface choice', async (method, cid, action, choice) => {
    const { tokens, wallet, calls } = setup();
    await tokens[method](cid);
    expect(postCalls(calls)).toEqual([
      {
        url: `${TS_PATH}/${cid}/choice-contexts/${action}`,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: { excludeDebugFields: true },
      },
    ]);
    expect(wallet.submissions).toEqual([
      {
        commandId: expect.stringMatching(UUID),
        commands: [
          {
            ExerciseCommand: {
              templateId:
                '#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferInstruction',
              contractId: cid,
              choice,
              choiceArgument: { extraArgs },
            },
          },
        ],
        disclosedContracts: [disclosed('00config', 'X.Y:Config')],
        actAs: [HOLDER],
      },
    ]);
  });

  it.each([
    ['00in', 'accept', 'TransferInstruction_Accept'],
    ['00in', 'reject', 'TransferInstruction_Reject'],
    ['00out', 'withdraw', 'TransferInstruction_Withdraw'],
  ] as const)('answerTransferOffer(%s, %s) exercises %s', async (cid, action, choice) => {
    const { tokens, wallet } = setup();
    await expect(tokens.answerTransferOffer(cid, action)).resolves.toMatchObject({ updateId: 'update-1' });
    expect(wallet.submissions).toMatchObject([{ commands: [{ ExerciseCommand: { contractId: cid, choice } }] }]);
  });

  it('answerTransferOffer refuses an offer in the wrong direction and an unknown action', async () => {
    const { tokens, wallet, calls } = setup();
    await expect(tokens.answerTransferOffer('00out', 'accept')).rejects.toMatchObject({ code: 'not-found' });
    await expect(tokens.answerTransferOffer('00in', 'withdraw')).rejects.toMatchObject({ code: 'not-found' });
    await expect(
      tokens.answerTransferOffer('00in', 'cancel' as unknown as TransferInstructionAction)
    ).rejects.toMatchObject({ name: 'TokenWalletError', code: 'invalid-input' });
    expect(postCalls(calls)).toEqual([]);
    expect(wallet.submissions).toEqual([]);
  });

  it.each([
    ['acceptTransferOffer', '00out'],
    ['rejectTransferOffer', '00forgedin'],
    ['acceptTransferOffer', '00unsignedin'],
    ['withdrawTransferOffer', '00in'],
    ['acceptTransferOffer', '00missing'],
  ] as const)('%s refuses %s', async (method, cid) => {
    const { tokens, wallet } = setup();
    await expect(tokens[method](cid)).rejects.toMatchObject({
      code: 'not-found',
    });
    expect(wallet.submissions).toEqual([]);
  });
});

describe('createTokenStandardWallet with a registry other than DA', () => {
  // A registry with none of DA's members (no operator, no trusted providers): only the `TokenRegistry` seam.
  const DSO = 'dso::1220ff';
  const COIN = { admin: DSO, id: 'Amulet' } as const;
  const RULES_T = 'Splice.ExternalPartyAmuletRules:ExternalPartyAmuletRules';
  const INSTRUCTION_KEY = 'coin:Splice.AmuletTransferInstruction:AmuletTransferInstruction';
  const coinHolding = (
    cid: string,
    amount: string,
    signatories: readonly string[] = [DSO, HOLDER]
  ): ActiveContract => ({
    ...holdingView(cid, amount, { instrument: { ...COIN }, signatories }),
    templateId: 'b1f2:Splice.Amulet:Amulet',
  });
  const offer = (contractId: string, sender: string, receiver: string): TransferOffer => ({
    contractId,
    operator: DSO,
    provider: DSO,
    sender,
    receiver,
    instrumentId: COIN,
    amount: '1.0000000000',
    memo: null,
    requestedAt: '2026-11-13T00:00:00Z',
    executeBefore: '2026-11-14T00:00:00Z',
  });

  function coinSetup(): { tokens: TokenStandardWallet; wallet: FakeProvider; registryCalls: string[] } {
    const registryCalls: string[] = [];
    const context = {
      choiceContextData: { values: CONTEXT_VALUES },
      disclosedContracts: [disclosed('00rules', RULES_T)],
    };
    const registry: TokenRegistry = {
      servesHolding: (c) => c.templateId.endsWith(':Splice.Amulet:Amulet') && c.signatories.includes(DSO),
      async pendingTransfers(read) {
        const contracts = await read({ templateId: INSTRUCTION_KEY });
        return contracts.map((c) =>
          c.contractId === '00coinin' ? offer(c.contractId, OTHER, HOLDER) : offer(c.contractId, HOLDER, OTHER)
        );
      },
      expectedTransferFactoryTemplates: [RULES_T],
      async transferFactory(args) {
        registryCalls.push(`transferFactory ${args.expectedAdmin} ${args.transfer.amount}`);
        return { factoryId: '00rules', transferKind: 'direct', ...context };
      },
      async transferInstructionContext(registrar, cid, action) {
        registryCalls.push(`context ${registrar} ${cid} ${action}`);
        return context;
      },
    };
    const wallet = fakeProvider({
      [TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID]: [
        coinHolding('00c5', '5'),
        coinHolding('00cforged', '1000', [OTHER, HOLDER]),
        holdingView('00h10', '10'),
      ],
      [INSTRUCTION_KEY]: [contract('00coinin', 'X:Y', null), contract('00coinout', 'X:Y', null)],
    });
    const tokens = createTokenStandardWallet({ provider: wallet, registry, now: () => NOW });
    return { tokens, wallet, registryCalls };
  }

  it('reads a registry filter the snapshot does not carry at the snapshot offset, once', async () => {
    const { tokens, wallet } = coinSetup();
    const [state, offers] = await Promise.all([tokens.loadState(), tokens.listTransferOffers()]);
    expect(state.holdings.map((h) => h.contractId)).toEqual(['00c5']);
    expect(state.transferOffers).toEqual(offers);
    expect(state.transferOffers.incoming.map((o) => o.contractId)).toEqual(['00coinin']);
    // One ledger end; the registry's undeclared filter is read at that offset (not a newer one), and only once.
    expect(wallet.ledgerCalls()).toEqual([
      'GET /v2/state/ledger-end',
      'POST /v2/state/active-contracts-page',
      'POST /v2/state/active-contracts-page',
    ]);
    const offsets = wallet.requests.flatMap((r) =>
      r.method === 'ledgerApi' && r.params.resource === '/v2/state/active-contracts-page'
        ? [r.params.body?.['activeAtOffset']]
        : []
    );
    expect(offsets).toEqual([state.offset, state.offset]);
    expect(wallet.reads[1]).toEqual([{ templateId: INSTRUCTION_KEY }]);
  });

  it('lists only the holdings the registry serves', async () => {
    const { tokens } = coinSetup();
    expect((await tokens.listHoldings()).map((h) => h.contractId)).toEqual(['00c5']);
  });

  it('transfers through the registry factory', async () => {
    const { tokens, wallet, registryCalls } = coinSetup();
    await expect(tokens.transfer({ receiver: OTHER, instrumentId: COIN, amount: '2' })).resolves.toMatchObject({
      kind: 'direct',
      updateId: 'update-1',
    });
    expect(registryCalls).toEqual([`transferFactory ${DSO} 2.0000000000`]);
    expect(wallet.submissions).toHaveLength(1);
    expect(wallet.submissions[0]).toMatchObject({
      commands: [{ ExerciseCommand: { contractId: '00rules', choice: 'TransferFactory_Transfer' } }],
      disclosedContracts: [disclosed('00rules', RULES_T)],
      actAs: [HOLDER],
    });
  });

  it('splits the registry pending transfers and accepts an incoming one', async () => {
    const { tokens, wallet, registryCalls } = coinSetup();
    const offers = await tokens.listTransferOffers();
    expect(offers.incoming.map((o) => o.contractId)).toEqual(['00coinin']);
    expect(offers.outgoing.map((o) => o.contractId)).toEqual(['00coinout']);
    await tokens.acceptTransferOffer('00coinin');
    await expect(tokens.acceptTransferOffer('00coinout')).rejects.toMatchObject({ code: 'not-found' });
    expect(registryCalls).toEqual([`context ${DSO} 00coinin accept`]);
    expect(wallet.submissions).toMatchObject([
      { commands: [{ ExerciseCommand: { contractId: '00coinin', choice: 'TransferInstruction_Accept' } }] },
    ]);
  });
});
