/**
 * `createWallet` takes any CIP-0103 provider: it acts as the party it is given, and a Loop-shaped provider
 * (`loop.getCip103Provider()`) plugs in with its CIP-0103 errors surfaced unchanged.
 */
import { DA_REGISTRY_TEMPLATES } from '../../../src/da-registry/templates';
import { WalletReadError, WalletSubmitError } from '../../../src/wallets/errors';
import type { ActiveContract } from '../../../src/wallets/types';
import { createWallet, type Wallet, type WalletInternalOptions } from '../../../src/wallets/wallet';
import {
  acsFilter,
  CONTEXT_VALUES,
  contract,
  daDisclosed,
  daHolding,
  disclosed,
  fakeFetch,
  FakeLoopCip103Provider,
  fakeProvider,
  HOLDER,
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
    [DA_REGISTRY_TEMPLATES.holding]: [daHolding('00h10', '10'), daHolding('00theirs', '10', { owner: OTHER })],
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

const walletOver = (provider: WalletInternalOptions['provider']): Wallet => {
  const options: WalletInternalOptions = {
    provider,
    partyId: HOLDER,
    network: 'devnet',
    registry: { fetch: registry().fetch },
    now: () => NOW,
  };
  return createWallet(options);
};

describe('createWallet: the wallet party', () => {
  it('reads and acts as the given party only, without asking the wallet for its account', async () => {
    const provider = fakeProvider(ledger());
    const tokens = walletOver(provider);
    expect((await tokens.loadState()).holdings.map((h) => h.contractId)).toEqual(['00h10']);
    await tokens.acceptMintOffer('00mint');
    expect(provider.requests.map((r) => r.method)).toEqual([
      'ledgerApi',
      'ledgerApi',
      'ledgerApi',
      'ledgerApi',
      'prepareExecuteAndWait',
    ]);
    const parties = provider.requests.flatMap((r) =>
      r.method === 'ledgerApi' && r.params.body !== undefined ? [acsFilter(r.params.body).party] : []
    );
    expect(parties).toEqual([HOLDER, HOLDER]);
    expect(provider.submissions[0]?.actAs).toEqual([HOLDER]);
  });
});

describe('createWallet over a Loop-shaped CIP-0103 provider (loop.getCip103Provider())', () => {
  function setup(submitError?: RpcError): { provider: FakeLoopCip103Provider; tokens: Wallet } {
    const provider = new FakeLoopCip103Provider(ledger(), submitError);
    return { provider, tokens: walletOver(provider) };
  }

  it('surfaces 4100 before the dApp connects, and submits nothing', async () => {
    const { provider, tokens } = setup();
    const error = await tokens.loadState().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WalletReadError);
    expect(error).toMatchObject({ code: 4100 });
    expect((error as Error).message).toMatch(/CIP-0103 4100 Unauthorized/);
    await expect(tokens.acceptMintOffer('00mint')).rejects.toMatchObject({ code: 4100 });
    expect(provider.submissions).toEqual([]);
  });

  it('accepts a mint offer once connected, with the exact prepareExecuteAndWait params', async () => {
    const { provider, tokens } = setup();
    await provider.request({ method: 'connect' });
    const result = await tokens.acceptMintOffer('00mint');
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
