import { DA_REGISTRY_TEMPLATES } from '../../../src/da-registry/templates';
import { AMULET_REGISTRY_BASE_URLS, AMULET_TEMPLATES } from '../../../src/wallets/amulet/constants';
import { AMULET_REGISTRY_NAME, createAmuletRegistry } from '../../../src/wallets/amulet/registry';
import { parseAmuletTransferOffer } from '../../../src/wallets/contracts';
import { describeWalletError, RegistryApiError, RegistryResponseError } from '../../../src/wallets/errors';
import type { JsonObject } from '../../../src/wallets/json';
import type { ActiveContract } from '../../../src/wallets/types';
import { createWallet, type WalletInternalOptions } from '../../../src/wallets/wallet';
import {
  CONTEXT_VALUES,
  contract,
  daDisclosed,
  fakeFetch,
  fakeProvider,
  HOLDER,
  NOW,
  OPERATOR,
  OTHER,
  pkgId,
  REGISTRAR,
  RpcError,
  type FetchCall,
} from './helpers';

const DSO = 'DSO::1220dso';
const SCAN = AMULET_REGISTRY_BASE_URLS.devnet;
const AMULET_T = 'Splice.AmuletTransferInstruction:AmuletTransferInstruction';
const INTERFACE =
  '#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferInstruction';

/** A recorded-shape Scan answer for a transfer-instruction choice context (`excludeDebugFields: true`). */
const SCAN_CONTEXT = {
  choiceContextData: {
    values: {
      'amulet-rules': { tag: 'AV_ContractId', value: '00amuletrules' },
      'open-round': { tag: 'AV_ContractId', value: '00openround' },
    },
  },
  disclosedContracts: [
    {
      templateId: 'a0b1c2:Splice.AmuletRules:AmuletRules',
      contractId: '00amuletrules',
      createdEventBlob: 'blob-amuletrules',
      synchronizerId: 'global-domain::1220ee',
      debugPackageName: 'splice-amulet',
    },
    {
      templateId: 'a0b1c2:Splice.Round:OpenMiningRound',
      contractId: '00openround',
      createdEventBlob: 'blob-openround',
      synchronizerId: 'global-domain::1220ee',
    },
  ],
};

/** The create argument of an `AmuletTransferInstruction`, as the provider validator's token-standard transfer makes it. */
const instructionArgs = (
  sender: string,
  receiver: string,
  overrides: { admin?: string; id?: string; memo?: string; executeBefore?: string; lockedAmulet?: string } = {}
): JsonObject => ({
  lockedAmulet: overrides.lockedAmulet ?? '00lockedamulet',
  transfer: {
    sender,
    receiver,
    amount: '20.0000000000',
    instrumentId: { admin: overrides.admin ?? DSO, id: overrides.id ?? 'Amulet' },
    requestedAt: '2026-11-13T00:00:00Z',
    executeBefore: overrides.executeBefore ?? '2026-11-14T00:00:00Z',
    inputHoldingCids: ['00amulet'],
    meta: { values: { 'splice.lfdecentralizedtrust.org/reason': overrides.memo ?? 'Canton Coin from the faucet' } },
  },
});

const instruction = (
  contractId: string,
  args: JsonObject,
  signatories: readonly string[],
  packageName = 'splice-amulet'
): ActiveContract => ({
  contractId,
  templateId: pkgId('a0b1c2', AMULET_T),
  packageName,
  signatories,
  createArgument: args,
});

/** A DA registry transfer offer from OTHER to HOLDER, made by REGISTRAR. */
const DA_OFFER = contract('00dain', 'Utility.Registry.App.V0.Model.Transfer:TransferOffer', {
  operator: OPERATOR,
  provider: REGISTRAR,
  transfer: {
    sender: OTHER,
    receiver: HOLDER,
    amount: '1.0000000000',
    instrumentId: { admin: REGISTRAR, id: 'XMPL' },
    requestedAt: '2026-11-13T00:00:00Z',
    executeBefore: '2026-11-14T00:00:00Z',
    inputHoldingCids: ['00x'],
    meta: { values: {} },
  },
});

const INSTRUCTIONS: ActiveContract[] = [
  instruction('00ccin', instructionArgs(OTHER, HOLDER), [DSO, OTHER]),
  instruction('00ccout', instructionArgs(HOLDER, OTHER, { memo: 'thanks' }), [DSO, HOLDER]),
  // Look-alikes: another package, not signed by the DSO, another admin, another instrument.
  instruction('00ccpkg', instructionArgs(OTHER, HOLDER), [DSO, OTHER], 'evil-amulet'),
  instruction('00ccunsigned', instructionArgs(OTHER, HOLDER), [OTHER]),
  instruction('00ccadmin', instructionArgs(OTHER, HOLDER, { admin: OTHER }), [OTHER]),
  instruction('00ccid', instructionArgs(OTHER, HOLDER, { id: 'NotAmulet' }), [DSO, OTHER]),
];

function setup(
  options: {
    instructions?: ActiveContract[];
    daOffers?: ActiveContract[];
    cantonCoin?: WalletInternalOptions['cantonCoin'];
    scan?: (call: FetchCall) => { status?: number; json?: unknown } | undefined;
  } = {}
): {
  tokens: ReturnType<typeof createWallet>;
  wallet: ReturnType<typeof fakeProvider>;
  calls: FetchCall[];
} {
  const { fetch, calls } = fakeFetch((call) => {
    const custom = options.scan?.(call);
    if (custom !== undefined) return custom;
    if (call.url.endsWith('/api/utilities/v0/operator')) return { json: { partyId: OPERATOR } };
    if (call.url === `${SCAN}/registry/metadata/v1/info`) {
      return { json: { adminId: DSO, supportedApis: { 'splice-api-token-metadata-v1': 1 } } };
    }
    if (call.url.startsWith(`${SCAN}/registry/transfer-instruction/v1/`)) return { json: SCAN_CONTEXT };
    if (call.url.includes('/registry/transfer-instruction/v1/')) {
      return {
        json: {
          choiceContextData: { values: CONTEXT_VALUES },
          disclosedContracts: [daDisclosed('00config', 'X.Y:Config')],
        },
      };
    }
    return { status: 500, json: { error: `unexpected ${call.url}` } };
  });
  const wallet = fakeProvider({
    [AMULET_TEMPLATES.transferInstruction]: options.instructions ?? INSTRUCTIONS,
    ...(options.daOffers !== undefined && { [DA_REGISTRY_TEMPLATES.transferOffer]: options.daOffers }),
  });
  const walletOptions: WalletInternalOptions = {
    provider: wallet,
    partyId: HOLDER,
    network: 'devnet',
    registry: { fetch },
    cantonCoin:
      options.cantonCoin === undefined
        ? { fetch }
        : options.cantonCoin === false
          ? false
          : { fetch, ...options.cantonCoin },
    now: () => NOW,
    readRetry: { sleep: async () => undefined },
  };
  return { tokens: createWallet(walletOptions), wallet, calls };
}

describe('parseAmuletTransferOffer', () => {
  it('reads a CC transfer instruction signed by the DSO and its sender as a transfer offer', () => {
    expect(parseAmuletTransferOffer(INSTRUCTIONS[0] as ActiveContract, DSO)).toEqual({
      registry: 'amulet',
      contractId: '00ccin',
      operator: DSO,
      provider: DSO,
      sender: OTHER,
      receiver: HOLDER,
      amount: '20.0000000000',
      instrumentId: { admin: DSO, id: 'Amulet' },
      memo: 'Canton Coin from the faucet',
      requestedAt: '2026-11-13T00:00:00Z',
      executeBefore: '2026-11-14T00:00:00Z',
      lockedHoldingCid: '00lockedamulet',
    });
  });

  it('refuses look-alikes and other instruments', () => {
    for (const lookAlike of INSTRUCTIONS.slice(2)) {
      expect(parseAmuletTransferOffer(lookAlike, DSO)).toBeNull();
    }
    // The genuine one under another DSO (a reset DevNet, a forged registry answer).
    expect(parseAmuletTransferOffer(INSTRUCTIONS[0] as ActiveContract, 'DSO::other')).toBeNull();
    expect(parseAmuletTransferOffer(instruction('00x', { transfer: 'no' }, [DSO]), DSO)).toBeNull();
  });
});

describe('createWallet: Canton Coin transfer offers', () => {
  it('lists genuine CC offers beside DA offers, asking Scan for the DSO party once', async () => {
    const { tokens, wallet, calls } = setup();
    const state = await tokens.loadState();
    expect(wallet.reads[0]).toContain(AMULET_TEMPLATES.transferInstruction);
    expect(state.transferOffers.incoming.map((o) => [o.registry, o.contractId])).toEqual([['amulet', '00ccin']]);
    expect(state.transferOffers.outgoing.map((o) => [o.registry, o.contractId, o.memo])).toEqual([
      ['amulet', '00ccout', 'thanks'],
    ]);
    await tokens.loadState();
    expect(calls.filter((c) => c.url.endsWith('/registry/metadata/v1/info'))).toHaveLength(1);
  });

  it('does not call Scan when the party has no CC offer', async () => {
    const { tokens, calls } = setup({ instructions: [] });
    const state = await tokens.loadState();
    expect(state.transferOffers).toEqual({ incoming: [], outgoing: [] });
    expect(calls.filter((c) => c.url.startsWith(SCAN))).toEqual([]);
  });

  it('trusts a pinned DSO party without asking the registry', async () => {
    const { fetch, calls } = fakeFetch((call) =>
      call.url.endsWith('/operator') ? { json: { partyId: OPERATOR } } : { status: 500, json: {} }
    );
    const tokens = createWallet({
      provider: fakeProvider({ [AMULET_TEMPLATES.transferInstruction]: INSTRUCTIONS }),
      partyId: HOLDER,
      network: 'devnet',
      registry: { fetch },
      cantonCoin: { fetch, dsoParty: DSO },
    });
    const state = await tokens.loadState();
    expect(state.transferOffers.incoming.map((o) => o.contractId)).toEqual(['00ccin']);
    expect(calls.map((c) => c.url)).toEqual(['https://api.utilities.digitalasset-dev.com/api/utilities/v0/operator']);
  });

  it('reads DA offers only with cantonCoin: false', async () => {
    const { tokens, wallet, calls } = setup({ cantonCoin: false });
    const state = await tokens.loadState();
    expect(wallet.reads[0]).not.toContain(AMULET_TEMPLATES.transferInstruction);
    expect(state.transferOffers.incoming).toEqual([]);
    await expect(tokens.acceptTransferOffer('00ccin')).rejects.toMatchObject({ code: 'not-found' });
    expect(calls.filter((c) => c.url.startsWith(SCAN))).toEqual([]);
  });

  it.each([
    ['acceptTransferOffer', '00ccin', 'accept', 'TransferInstruction_Accept'],
    ['rejectTransferOffer', '00ccin', 'reject', 'TransferInstruction_Reject'],
    ['withdrawTransferOffer', '00ccout', 'withdraw', 'TransferInstruction_Withdraw'],
  ] as const)('%s takes the %s context from Scan and exercises %s', async (method, cid, action, choice) => {
    const { tokens, wallet, calls } = setup();
    await tokens[method](cid);
    expect(wallet.reads[wallet.reads.length - 1]).toEqual([
      DA_REGISTRY_TEMPLATES.transferOffer,
      AMULET_TEMPLATES.transferInstruction,
    ]);
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toEqual([
      {
        url: `${SCAN}/registry/transfer-instruction/v1/${cid}/choice-contexts/${action}`,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: { excludeDebugFields: true },
      },
    ]);
    // Every Scan request carries a timeout signal.
    expect(posts[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(wallet.submissions).toHaveLength(1);
    expect(wallet.submissions[0]?.commands).toEqual([
      {
        ExerciseCommand: {
          templateId: INTERFACE,
          contractId: cid,
          choice,
          choiceArgument: {
            extraArgs: { context: SCAN_CONTEXT.choiceContextData, meta: { values: {} } },
          },
        },
      },
    ]);
    // Scan's debug fields are dropped: the Ledger API refuses them.
    expect(wallet.submissions[0]?.disclosedContracts).toEqual([
      {
        templateId: 'a0b1c2:Splice.AmuletRules:AmuletRules',
        contractId: '00amuletrules',
        createdEventBlob: 'blob-amuletrules',
        synchronizerId: 'global-domain::1220ee',
      },
      {
        templateId: 'a0b1c2:Splice.Round:OpenMiningRound',
        contractId: '00openround',
        createdEventBlob: 'blob-openround',
        synchronizerId: 'global-domain::1220ee',
      },
    ]);
  });

  it('refuses a CC offer in the wrong direction or a look-alike', async () => {
    const { tokens, wallet } = setup();
    await expect(tokens.acceptTransferOffer('00ccout')).rejects.toMatchObject({ code: 'not-found' });
    await expect(tokens.withdrawTransferOffer('00ccin')).rejects.toMatchObject({ code: 'not-found' });
    await expect(tokens.acceptTransferOffer('00ccunsigned')).rejects.toMatchObject({ code: 'not-found' });
    await expect(tokens.acceptTransferOffer('00ccpkg')).rejects.toMatchObject({ code: 'not-found' });
    expect(wallet.submissions).toEqual([]);
  });

  it('keeps the rest of the state when Scan cannot name the DSO, and flags Canton Coin as unavailable', async () => {
    const down = (call: FetchCall): { status: number; json: unknown } | undefined =>
      call.url.endsWith('/registry/metadata/v1/info') ? { status: 500, json: { error: 'down' } } : undefined;
    const { tokens } = setup({ daOffers: [DA_OFFER], scan: down });
    const state = await tokens.loadState();
    expect(state.cantonCoinUnavailable).toBe(true);
    expect(state.transferOffers.incoming.map((o) => [o.registry, o.contractId])).toEqual([['da', '00dain']]);
    expect(state.transferOffers.outgoing).toEqual([]);

    const healthy = await setup({ daOffers: [DA_OFFER] }).tokens.loadState();
    expect(healthy.cantonCoinUnavailable).toBe(false);
  });

  it('answers a DA offer without asking Scan, even beside a CC offer', async () => {
    const { tokens, wallet, calls } = setup({
      daOffers: [DA_OFFER],
      scan: (call) => (call.url.startsWith(SCAN) ? { status: 500, json: { error: 'down' } } : undefined),
    });
    await tokens.acceptTransferOffer('00dain');
    expect(calls.filter((c) => c.url.startsWith(SCAN))).toEqual([]);
    expect(wallet.submissions).toHaveLength(1);
    expect(wallet.submissions[0]?.commands[0]).toMatchObject({ ExerciseCommand: { contractId: '00dain' } });
  });

  it("answers a CC offer during a DA Utilities outage: DA's operator is not asked", async () => {
    const { tokens, wallet, calls } = setup({
      daOffers: [DA_OFFER],
      scan: (call) =>
        call.url.endsWith('/api/utilities/v0/operator') ? { status: 503, json: { error: 'down' } } : undefined,
    });
    await tokens.acceptTransferOffer('00ccin');
    await tokens.withdrawTransferOffer('00ccout');
    expect(calls.filter((c) => c.url.endsWith('/api/utilities/v0/operator'))).toEqual([]);
    expect(wallet.submissions).toHaveLength(2);
    // A DA offer still needs DA's operator, and fails without it.
    await expect(tokens.acceptTransferOffer('00dain')).rejects.toBeDefined();
    expect(wallet.submissions).toHaveLength(2);
  });

  it('refuses to answer a CC offer while Scan cannot confirm the DSO, and submits nothing', async () => {
    const { tokens, wallet, calls } = setup({
      scan: (call) => (call.url.endsWith('/registry/metadata/v1/info') ? { status: 503, json: {} } : undefined),
    });
    const error: unknown = await tokens.acceptTransferOffer('00ccin').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RegistryResponseError);
    expect(describeWalletError(error)).toMatchObject({
      kind: 'registry',
      message: expect.stringMatching(/could not confirm Canton Coin's DSO party/),
    });
    expect(calls.filter((c) => c.url.includes('/choice-contexts/'))).toEqual([]);
    expect(wallet.submissions).toEqual([]);
  });

  it('names the Canton Coin registry when Scan refuses, and submits nothing', async () => {
    const { tokens, wallet } = setup({
      scan: (call) =>
        call.url.includes('/choice-contexts/') ? { status: 404, json: { error: 'contract not found' } } : undefined,
    });
    const error: unknown = await tokens.acceptTransferOffer('00ccin').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RegistryApiError);
    expect(describeWalletError(error)).toMatchObject({
      kind: 'registry',
      message: expect.stringMatching(/^The Canton Coin registry \(Scan\) answered 404/),
    });
    expect(wallet.submissions).toEqual([]);
  });
});

describe('createAmuletRegistry: network defaults and validation', () => {
  it("defaults to SV-1's Scan of each network and trims a given registry URL", async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: { adminId: DSO } }));
    await createAmuletRegistry('mainnet', { fetch }).dsoParty();
    await createAmuletRegistry('devnet', { fetch, registryUrl: 'https://proxy.example/scan//' }).dsoParty();
    expect(calls.map((c) => c.url)).toEqual([
      'https://scan.sv-1.global.canton.network.sync.global/registry/metadata/v1/info',
      'https://proxy.example/scan/registry/metadata/v1/info',
    ]);
  });

  it('confirms no DSO from an answer without adminId, and names itself when it answers an error', async () => {
    const { fetch } = fakeFetch((call) =>
      call.url.endsWith('/info') ? { json: { supportedApis: {} } } : { status: 404, json: { error: 'gone' } }
    );
    const registry = createAmuletRegistry('devnet', { fetch });
    await expect(registry.dsoParty()).resolves.toBeUndefined();
    expect(registry.knownDsoParty()).toBeUndefined();
    const failed: unknown = await registry.transferInstructionContext('00x', 'accept').catch((e: unknown) => e);
    expect(failed).toMatchObject({ status: 404, registry: AMULET_REGISTRY_NAME });
  });

  it('refuses an empty pinned party or registry URL', () => {
    expect(() => createAmuletRegistry('devnet', { dsoParty: '' })).toThrow(TypeError);
    expect(() => createAmuletRegistry('devnet', { registryUrl: '' })).toThrow(TypeError);
  });

  it('remembers the DSO the registry confirmed', async () => {
    const { fetch } = fakeFetch(() => ({ json: { adminId: DSO } }));
    const registry = createAmuletRegistry('devnet', { fetch });
    expect(registry.knownDsoParty()).toBeUndefined();
    await registry.dsoParty();
    expect(registry.knownDsoParty()).toBe(DSO);
    expect(createAmuletRegistry('devnet', { fetch, dsoParty: 'DSO::pinned' }).knownDsoParty()).toBe('DSO::pinned');
  });

  it('stops waiting when the signal aborts', async () => {
    const { fetch } = fakeFetch(() => ({ json: { adminId: DSO } }));
    const controller = new AbortController();
    controller.abort();
    await expect(createAmuletRegistry('devnet', { fetch }).dsoParty(controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('createWallet: expired Canton Coin offers', () => {
  const EXPIRED = '2026-11-13T06:00:00Z'; // before NOW (2026-11-13T12:00Z)
  const expiredOut = (cid: string, executeBefore = EXPIRED): ActiveContract =>
    instruction(cid, instructionArgs(HOLDER, OTHER, { executeBefore, lockedAmulet: `${cid}-lock` }), [DSO, HOLDER]);

  it('marks offers expired by the wallet clock, in both directions', async () => {
    const { tokens } = setup({
      instructions: [
        expiredOut('00old'),
        instruction('00ccout', instructionArgs(HOLDER, OTHER), [DSO, HOLDER]),
        instruction('00oldin', instructionArgs(OTHER, HOLDER, { executeBefore: EXPIRED }), [DSO, OTHER]),
      ],
    });
    const state = await tokens.loadState();
    expect(state.transferOffers.outgoing.map((o) => [o.contractId, o.expired])).toEqual([
      ['00old', true],
      ['00ccout', false],
    ]);
    expect(state.transferOffers.incoming.map((o) => [o.contractId, o.expired])).toEqual([['00oldin', true]]);
  });

  it('withdraws every expired outgoing CC offer, oldest first, each with its own Scan context', async () => {
    const { tokens, wallet, calls } = setup({
      instructions: [
        expiredOut('00b', '2026-11-13T08:00:00Z'),
        expiredOut('00a', '2026-11-13T07:00:00Z'),
        instruction('00live', instructionArgs(HOLDER, OTHER), [DSO, HOLDER]),
        instruction('00oldin', instructionArgs(OTHER, HOLDER, { executeBefore: EXPIRED }), [DSO, OTHER]),
      ],
      scan: (call) =>
        call.url.endsWith('/api/utilities/v0/operator') ? { status: 503, json: { error: 'down' } } : undefined,
    });
    const result = await tokens.withdrawExpiredTransferOffers({ admin: DSO, id: 'Amulet' });
    expect(result.withdrawn.map((w) => [w.transferOfferCid, w.amount, w.registry])).toEqual([
      ['00a', '20.0000000000', 'amulet'],
      ['00b', '20.0000000000', 'amulet'],
    ]);
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.url)).toEqual([
      `${SCAN}/registry/transfer-instruction/v1/00a/choice-contexts/withdraw`,
      `${SCAN}/registry/transfer-instruction/v1/00b/choice-contexts/withdraw`,
    ]);
    expect(wallet.submissions.map((s) => s.commands[0])).toEqual([
      { ExerciseCommand: expect.objectContaining({ contractId: '00a', choice: 'TransferInstruction_Withdraw' }) },
      { ExerciseCommand: expect.objectContaining({ contractId: '00b', choice: 'TransferInstruction_Withdraw' }) },
    ]);
  });

  /** Fail the `n`th submission (1-based) with `error`; the others go through. */
  function failSubmission(provider: ReturnType<typeof fakeProvider>, n: number, error: unknown): void {
    const request = provider.request.bind(provider);
    let count = 0;
    provider.request = async (args) => {
      if (args.method === 'prepareExecuteAndWait') {
        count += 1;
        if (count === n) {
          provider.submissions.push(args.params);
          throw error;
        }
      }
      return request(args);
    };
  }

  const threeExpired = [
    expiredOut('00a', '2026-11-13T07:00:00Z'),
    expiredOut('00b', '2026-11-13T08:00:00Z'),
    expiredOut('00c', '2026-11-13T09:00:00Z'),
  ];

  it('reports what committed when a later withdrawal fails, and stops there', async () => {
    const { tokens, wallet } = setup({ instructions: threeExpired });
    failSubmission(wallet, 2, new RpcError(-32003, 'ledger rejected'));
    const result = await tokens.withdrawExpiredTransferOffers({ admin: DSO, id: 'Amulet' });
    expect(result.withdrawn.map((w) => w.transferOfferCid)).toEqual(['00a']);
    expect(result.released).toEqual([]);
    expect(result.failed?.contractId).toBe('00b');
    expect(describeWalletError(result.failed?.error).kind).toBe('not-committed');
    expect(result.notAttempted).toEqual(['00c']);
    expect(
      wallet.submissions.map(
        (s) => (s.commands[0] as { ExerciseCommand: { contractId: string } }).ExerciseCommand.contractId
      )
    ).toEqual(['00a', '00b']);
  });

  it('throws the first failure as usual when nothing committed', async () => {
    const { tokens, wallet } = setup({ instructions: threeExpired });
    failSubmission(wallet, 1, new RpcError(-32003, 'ledger rejected'));
    await expect(tokens.withdrawExpiredTransferOffers({ admin: DSO, id: 'Amulet' })).rejects.toMatchObject({
      outcome: 'failed',
    });
    expect(wallet.submissions).toHaveLength(1);
  });

  it('reports what committed when the signal aborts between withdrawals', async () => {
    const { tokens, wallet } = setup({ instructions: threeExpired });
    const controller = new AbortController();
    const request = wallet.request.bind(wallet);
    wallet.request = async (args) => {
      const answer = await request(args);
      if (args.method === 'prepareExecuteAndWait') controller.abort();
      return answer;
    };
    const result = await tokens.withdrawExpiredTransferOffers(
      { admin: DSO, id: 'Amulet' },
      { signal: controller.signal }
    );
    expect(result.withdrawn.map((w) => w.transferOfferCid)).toEqual(['00a']);
    expect(result.failed?.contractId).toBe('00b');
    expect(describeWalletError(result.failed?.error).kind).toBe('cancelled');
    expect(result.notAttempted).toEqual(['00c']);
    expect(wallet.submissions).toHaveLength(1);
  });

  it('refuses with not-found when no outgoing offer of the token expired, and submits nothing', async () => {
    const { tokens, wallet } = setup();
    await expect(tokens.withdrawExpiredTransferOffers({ admin: DSO, id: 'Amulet' })).rejects.toMatchObject({
      code: 'not-found',
    });
    expect(wallet.submissions).toEqual([]);
  });

  it('refuses with a registry error when Scan cannot confirm the DSO', async () => {
    const { tokens, wallet } = setup({
      instructions: [expiredOut('00old')],
      scan: (call) => (call.url.endsWith('/registry/metadata/v1/info') ? { status: 503, json: {} } : undefined),
    });
    await expect(tokens.withdrawExpiredTransferOffers({ admin: DSO, id: 'Amulet' })).rejects.toBeInstanceOf(
      RegistryResponseError
    );
    expect(wallet.submissions).toEqual([]);
  });

  it("fails closed on Scan, not on DA's operator, when neither can be reached", async () => {
    const daExpired = contract('00daold', 'Utility.Registry.App.V0.Model.Transfer:TransferOffer', {
      operator: OPERATOR,
      provider: REGISTRAR,
      transfer: {
        sender: HOLDER,
        receiver: OTHER,
        amount: '3.0000000000',
        instrumentId: { admin: REGISTRAR, id: 'XMPL' },
        requestedAt: '2026-11-12T00:00:00Z',
        executeBefore: EXPIRED,
        inputHoldingCids: ['00x'],
        meta: { values: {} },
      },
    });
    const { tokens, wallet } = setup({
      instructions: [expiredOut('00old')],
      daOffers: [daExpired],
      scan: (call) =>
        call.url.endsWith('/registry/metadata/v1/info') || call.url.endsWith('/api/utilities/v0/operator')
          ? { status: 503, json: {} }
          : undefined,
    });
    await expect(tokens.withdrawExpiredTransferOffers({ admin: DSO, id: 'Amulet' })).rejects.toThrow(
      /could not confirm Canton Coin's DSO party, so the wallet's Canton Coin offers cannot be checked/
    );
    expect(wallet.submissions).toEqual([]);
  });

  it("reclaims a registrar's own 'Amulet' through DA's registry once the DSO is pinned, without Scan", async () => {
    const daAmuletExpired = contract('00daamulet', 'Utility.Registry.App.V0.Model.Transfer:TransferOffer', {
      operator: OPERATOR,
      provider: REGISTRAR,
      transfer: {
        sender: HOLDER,
        receiver: OTHER,
        amount: '2.0000000000',
        instrumentId: { admin: REGISTRAR, id: 'Amulet' },
        requestedAt: '2026-11-12T00:00:00Z',
        executeBefore: EXPIRED,
        inputHoldingCids: ['00y'],
        meta: { values: {} },
      },
    });
    const { tokens, wallet, calls } = setup({
      instructions: [],
      daOffers: [daAmuletExpired],
      cantonCoin: { dsoParty: DSO },
      scan: (call) => (call.url.startsWith(SCAN) ? { status: 503, json: {} } : undefined),
    });
    const result = await tokens.withdrawExpiredTransferOffers({ admin: REGISTRAR, id: 'Amulet' });
    expect(result.withdrawn.map((w) => [w.transferOfferCid, w.registry])).toEqual([['00daamulet', 'da']]);
    expect(calls.filter((c) => c.url.startsWith(SCAN))).toEqual([]);
    expect(wallet.submissions).toHaveLength(1);
  });

  it("withdraws an expired DA offer through DA's registry, without Scan", async () => {
    const daExpired = contract('00daold', 'Utility.Registry.App.V0.Model.Transfer:TransferOffer', {
      operator: OPERATOR,
      provider: REGISTRAR,
      transfer: {
        sender: HOLDER,
        receiver: OTHER,
        amount: '3.0000000000',
        instrumentId: { admin: REGISTRAR, id: 'XMPL' },
        requestedAt: '2026-11-12T00:00:00Z',
        executeBefore: EXPIRED,
        inputHoldingCids: ['00x'],
        meta: { values: {} },
      },
    });
    const { tokens, wallet, calls } = setup({ daOffers: [daExpired, DA_OFFER] });
    const result = await tokens.withdrawExpiredTransferOffers({ admin: REGISTRAR, id: 'XMPL' });
    expect(result.withdrawn.map((w) => [w.transferOfferCid, w.registry])).toEqual([['00daold', 'da']]);
    expect(calls.filter((c) => c.url.startsWith(SCAN))).toEqual([]);
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.url)).toEqual([
      expect.stringMatching(/\/registry\/transfer-instruction\/v1\/00daold\/choice-contexts\/withdraw$/),
    ]);
    expect(wallet.submissions).toHaveLength(1);
  });
});
