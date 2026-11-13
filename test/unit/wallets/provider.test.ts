/**
 * `createTokenWallet` takes any CIP-0103 provider: the party it acts as, and how a Loop-shaped provider
 * (`loop.getCip103Provider()`) plugs in with its CIP-0103 errors surfaced unchanged.
 */
import { DA_REGISTRY_TEMPLATES } from '../../../src/da-registry/templates';
import { TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID } from '../../../src/utils/token-standard/v1/constants';
import {
  createDaUtilitiesClient,
  createTokenWallet,
  TokenWalletError,
  WalletReadError,
  WalletSubmitError,
  type ActiveContract,
  type TokenWallet,
} from '../../../src/wallets';
import {
  acsFilter,
  CONTEXT_VALUES,
  contract,
  daDisclosed,
  disclosed,
  fakeFetch,
  FakeLoopCip103Provider,
  fakeProvider,
  HOLDER,
  holdingView,
  NOW,
  OPERATOR,
  OTHER,
  REGISTRAR,
  RpcError,
} from './helpers';

const MINT = 'Utility.Registry.App.V0.Model.Mint:MintOffer';

function ledger(): Record<string, ActiveContract[]> {
  return {
    [DA_REGISTRY_TEMPLATES.mintOffer]: [
      contract('00mint', MINT, {
        operator: OPERATOR,
        provider: REGISTRAR,
        mint: {
          instrumentId: { admin: REGISTRAR, id: 'XMPL' },
          amount: '100.0000000000',
          holder: HOLDER,
          reference: 'mint_0001',
          requestedAt: '2026-11-13T00:00:00Z',
          executeBefore: '2026-11-16T00:00:00Z',
          meta: { values: {} },
        },
      }),
    ],
    [TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID]: [
      holdingView('00h10', '10'),
      holdingView('00theirs', '10', { owner: OTHER }),
    ],
  };
}

function registry(): ReturnType<typeof fakeFetch> {
  return fakeFetch((call) =>
    call.url.endsWith('/operator')
      ? { json: { partyId: OPERATOR } }
      : {
          json: {
            choiceContextData: { values: CONTEXT_VALUES },
            disclosedContracts: [daDisclosed('00config', 'X.Y:Config')],
          },
        }
  );
}

const MINT_ACCEPT = {
  ExerciseCommand: {
    templateId: '#utility-registry-app-v0:Utility.Registry.App.V0.Model.Mint:MintOffer',
    contractId: '00mint',
    choice: 'MintOffer_Accept',
    choiceArgument: {
      extraArgs: { context: { values: CONTEXT_VALUES }, meta: { values: {} } },
    },
  },
};

describe('createTokenWallet: the wallet party', () => {
  it('acts as the primary account, read on every action', async () => {
    let party = HOLDER;
    const provider = fakeProvider(ledger());
    const switching = {
      ...provider,
      request: async (args: Parameters<typeof provider.request>[0]) =>
        args.method === 'getPrimaryAccount' ? { partyId: party, primary: true } : provider.request(args),
    };
    const tokens = createTokenWallet({
      provider: switching,
      registry: createDaUtilitiesClient({ network: 'devnet' }, { fetch: registry().fetch }),
    });
    await expect(tokens.partyId()).resolves.toBe(HOLDER);
    expect((await tokens.listHoldings()).map((h) => h.contractId)).toEqual(['00h10']);
    party = OTHER;
    await expect(tokens.partyId()).resolves.toBe(OTHER);
    expect((await tokens.listHoldings()).map((h) => h.contractId)).toEqual(['00theirs']);
    const parties = provider.requests.flatMap((r) =>
      r.method === 'ledgerApi' && r.params.body !== undefined ? [acsFilter(r.params.body).party] : []
    );
    expect(parties).toEqual([HOLDER, OTHER]);
  });

  it('acts as a given partyId without asking the wallet', async () => {
    const provider = fakeProvider(ledger());
    const tokens = createTokenWallet({
      provider,
      partyId: HOLDER,
      registry: createDaUtilitiesClient({ network: 'devnet' }, { fetch: registry().fetch }),
      now: () => NOW,
    });
    await tokens.acceptMintOffer('00mint');
    expect(provider.requests.map((r) => r.method)).toEqual(['ledgerApi', 'ledgerApi', 'prepareExecuteAndWait']);
    expect(provider.submissions[0]?.actAs).toEqual([HOLDER]);
  });

  it('refuses an empty partyId', () => {
    expect(() =>
      createTokenWallet({
        provider: fakeProvider({}),
        partyId: ' ',
        registry: createDaUtilitiesClient({ network: 'devnet' }),
      })
    ).toThrow(TokenWalletError);
  });
});

describe('createTokenWallet over a Loop-shaped CIP-0103 provider (loop.getCip103Provider())', () => {
  function setup(submitError?: RpcError): { provider: FakeLoopCip103Provider; tokens: TokenWallet } {
    const provider = new FakeLoopCip103Provider(ledger(), submitError);
    const { fetch } = registry();
    const tokens = createTokenWallet({
      provider,
      registry: createDaUtilitiesClient({ network: 'devnet' }, { fetch }),
      now: () => NOW,
    });
    return { provider, tokens };
  }

  it('surfaces 4100 before the dApp connects, and submits nothing', async () => {
    const { provider, tokens } = setup();
    const error = await tokens.listHoldings().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WalletReadError);
    expect(error).toMatchObject({ code: 4100 });
    expect((error as Error).message).toMatch(/CIP-0103 4100 Unauthorized/);
    await expect(tokens.acceptMintOffer('00mint')).rejects.toMatchObject({
      code: 4100,
    });
    expect(provider.submissions).toEqual([]);
  });

  it('accepts a mint offer once connected, with the exact prepareExecuteAndWait params', async () => {
    const { provider, tokens } = setup();
    const statuses: unknown[] = [];
    const onStatus = (...args: unknown[]): void => {
      statuses.push(args[0]);
    };
    provider.on('statusChanged', onStatus);
    await provider.request({ method: 'connect' });
    provider.removeListener('statusChanged', onStatus);
    expect(statuses).toHaveLength(1);

    const result = await tokens.acceptMintOffer('00mint', {
      expectedRegistrar: REGISTRAR,
    });
    expect(result.updateId).toBe('update-1');
    expect(provider.submissions).toEqual([
      {
        commandId: result.commandId,
        commands: [MINT_ACCEPT],
        disclosedContracts: [disclosed('00config', 'X.Y:Config')],
        actAs: [HOLDER],
      },
    ]);
  });

  it.each([
    [-32002, 'unknown', /do not resubmit blindly/],
    [4001, 'rejected-by-user', /User Rejected Request/],
    [-32003, 'failed', /ledger rejected/],
  ] as const)('maps Loop error %i to %s and never retries', async (code, outcome, message) => {
    const { provider, tokens } = setup(new RpcError(code, 'from Loop'));
    await provider.request({ method: 'connect' });
    const error = await tokens.acceptMintOffer('00mint').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WalletSubmitError);
    expect(error).toMatchObject({ outcome, code });
    expect((error as Error).message).toMatch(message);
    expect(provider.submissions).toHaveLength(1);
  });
});
