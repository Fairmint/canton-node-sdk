import { DA_REGISTRY_TEMPLATES } from '../../../src/da-registry/templates';
import { TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID } from '../../../src/utils/token-standard/v1/constants';
import {
  createDaUtilitiesClient,
  createTokenStandardWallet,
  createTokenWallet,
  RegistryResponseError,
  TokenWalletError,
  type ActiveContract,
  type JsonObject,
  type TokenRegistry,
  type TokenStandardWallet,
  type TokenWallet,
  type TransferKind,
  type TransferOffer,
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
  type FakeProvider,
  type FetchCall,
} from './helpers';

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

function ledger(extraHoldings: ActiveContract[] = []): Record<string, ActiveContract[]> {
  return {
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
    trustedProviders?: Record<string, string[]>;
  } = {}
): { tokens: TokenWallet; wallet: FakeProvider; calls: FetchCall[] } {
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
  const wallet = fakeProvider(ledger(options.extraHoldings), {
    party: options.party ?? HOLDER,
  });
  const tokens = createTokenWallet({
    provider: wallet,
    ...(options.partyId !== undefined && { partyId: options.partyId }),
    registry: createDaUtilitiesClient(
      { network: 'devnet' },
      { fetch, ...(options.trustedProviders !== undefined && { trustedProviders: options.trustedProviders }) }
    ),
    now: () => NOW,
  });
  return { tokens, wallet, calls };
}

const UUID = /^[0-9a-f-]{36}$/;

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
    expect(wallet.reads).toEqual([{ interfaceId: TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID }]);
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
    await tokens.requestBurn({
      instrumentId: INSTRUMENT,
      amount: '12',
      reference: 'redemption-42',
    });
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
