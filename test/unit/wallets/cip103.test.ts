import {
  CIP103_ERROR_CODES,
  cip103ErrorCode,
  cip103NetworkId,
  cip103SubmitError,
  cip103Wallet,
  isDaNetwork,
  newCommandId,
  primaryAccount,
  reportsOtherNetwork,
  type Cip103PrepareExecuteParams,
  type Cip103Request,
  type Cip103Wallet,
} from '../../../src/wallets/cip103';
import { WalletReadError, WalletSubmitError } from '../../../src/wallets/errors';
import type { ActiveContract, WalletSubmission } from '../../../src/wallets/types';
import { HOLDER, RpcError, scriptedProvider, type RecordingProvider } from './helpers';

/** The active contracts of one template, as one snapshot. */
async function list(wallet: Cip103Wallet, templateId: string): Promise<ActiveContract[]> {
  return (await wallet.readActiveContracts([templateId])).contracts;
}

const rpcError = (code: number, message: string): RpcError => new RpcError(code, message);

const DISCLOSED = { contractId: '00d', templateId: 'p:M:E', createdEventBlob: 'blob', synchronizerId: 'sync::1220' };

/** A `JsGetActiveContractsResponse` holding one active contract. */
const acsEntry = (createdEvent: Record<string, unknown>): unknown => ({
  workflowId: '',
  contractEntry: {
    JsActiveContract: { createdEvent, synchronizerId: 'global-domain::1220ee', reassignmentCounter: 0 },
  },
});

/** A provider serving the ledger end at `offset` and `acs` (or its thrown error) for the unpaged ACS read. */
function ledger(acs: () => unknown, offset: unknown = 42): RecordingProvider {
  return scriptedProvider({
    ledgerApi: (params) => ((params as { resource: string }).resource === '/v2/state/ledger-end' ? { offset } : acs()),
  });
}

const resources = (provider: { requests: Cip103Request[] }): string[] =>
  provider.requests.map((r) => (r.method === 'ledgerApi' ? r.params.resource : r.method));

const submission: WalletSubmission = {
  commands: [{ ExerciseCommand: { templateId: '#a:B:C', contractId: '00c', choice: 'Go', choiceArgument: {} } }],
  disclosedContracts: [DISCLOSED],
};

/** The params of the provider's only `prepareExecuteAndWait`. */
function submitted(provider: { requests: Cip103Request[] }): Cip103PrepareExecuteParams {
  const [request] = provider.requests;
  if (request?.method !== 'prepareExecuteAndWait') throw new Error('no prepareExecuteAndWait');
  return request.params;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('primaryAccount', () => {
  it('reads the primary account, keeping only the fields the wallet sent', async () => {
    const provider = scriptedProvider({
      getPrimaryAccount: () => ({
        primary: true,
        partyId: HOLDER,
        status: 'allocated',
        publicKey: 'ab',
        networkId: 'canton:devnet',
        namespace: '',
      }),
    });
    await expect(primaryAccount(provider)).resolves.toEqual({
      partyId: HOLDER,
      publicKey: 'ab',
      networkId: 'canton:devnet',
    });
    expect(provider.requests).toEqual([{ method: 'getPrimaryAccount' }]);
  });

  it('refuses an account without a party', async () => {
    const provider = scriptedProvider({ getPrimaryAccount: () => ({ primary: true }) });
    await expect(primaryAccount(provider)).rejects.toBeInstanceOf(WalletReadError);
  });

  it('reports a provider that is not connected with its CIP-0103 code', async () => {
    const provider = scriptedProvider({
      getPrimaryAccount: () => {
        throw rpcError(4100, 'No authorized account');
      },
    });
    const error = await primaryAccount(provider).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WalletReadError);
    expect(error).toMatchObject({ code: 4100 });
    expect((error as Error).message).toBe(
      'The wallet did not return its primary account: No authorized account (CIP-0103 4100 Unauthorized)'
    );
  });
});

describe('cip103Wallet reads', () => {
  const createdEvent = {
    contractId: '00c',
    templateId: 'pkg:Utility.Registry.App.V0.Model.Mint:MintOffer',
    createArgument: { operator: 'op' },
    createdEventBlob: 'blob',
    signatories: ['provider::1220bb', 7, ''],
    packageName: 'utility-registry-app-v0',
    interfaceViews: [{ interfaceId: 'pkg:A:B', viewStatus: { code: 0 }, viewValue: { x: 1 } }],
  };
  const MINT_OFFER = '#utility-registry-app-v0:Utility.Registry.App.V0.Model.Mint:MintOffer';

  it('reads the ledger end, then one unpaged ACS read at that offset, for the party only, by template', async () => {
    const provider = ledger(() => [acsEntry(createdEvent), { contractEntry: { JsEmpty: {} } }]);
    const contracts = await list(cip103Wallet(provider, HOLDER), MINT_OFFER);
    expect(contracts).toEqual([
      {
        contractId: '00c',
        templateId: 'pkg:Utility.Registry.App.V0.Model.Mint:MintOffer',
        packageName: 'utility-registry-app-v0',
        // Non-party entries are dropped; the blob and interface views are not read.
        signatories: ['provider::1220bb'],
        createArgument: { operator: 'op' },
        synchronizerId: 'global-domain::1220ee',
      },
    ]);
    expect(provider.requests).toEqual([
      { method: 'ledgerApi', params: { requestMethod: 'get', resource: '/v2/state/ledger-end' } },
      {
        method: 'ledgerApi',
        params: {
          requestMethod: 'post',
          resource: '/v2/state/active-contracts',
          // Exactly these two fields: no top-level verbose next to eventFormat.
          body: {
            activeAtOffset: 42,
            eventFormat: {
              verbose: false,
              filtersByParty: {
                [HOLDER]: {
                  cumulative: [
                    {
                      identifierFilter: {
                        TemplateFilter: { value: { templateId: MINT_OFFER, includeCreatedEventBlob: false } },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    ]);
  });

  it('skips a contract without a package name, and reads one without signatories as signed by no one', async () => {
    const provider = ledger(() => [
      acsEntry({ ...createdEvent, contractId: '00a', packageName: undefined }),
      acsEntry({ ...createdEvent, contractId: '00b', packageName: '' }),
      acsEntry({ ...createdEvent, signatories: undefined }),
    ]);
    const contracts = await list(cip103Wallet(provider, HOLDER), '#p:M:E');
    expect(contracts.map((c) => [c.contractId, c.signatories])).toEqual([['00c', []]]);
  });

  it('reads every template in one cumulative filter and returns the snapshot offset', async () => {
    const event = (contractId: string, templateId: string): Record<string, unknown> => ({
      contractId,
      templateId,
      packageName: 'p',
      createArgument: {},
      signatories: [HOLDER],
    });
    const provider = ledger(() => [acsEntry(event('00a', 'p:M:A')), acsEntry(event('00b', 'p:M:B'))], 7);
    const snapshot = await cip103Wallet(provider, HOLDER).readActiveContracts(['#p:M:A', '#p:M:B']);
    expect(snapshot.offset).toBe(7);
    expect(snapshot.contracts.map((c) => c.contractId)).toEqual(['00a', '00b']);
    const read = provider.requests[1];
    const body = read?.method === 'ledgerApi' ? read.params.body : undefined;
    expect(body).toMatchObject({
      eventFormat: {
        filtersByParty: {
          [HOLDER]: {
            cumulative: [
              { identifierFilter: { TemplateFilter: { value: { templateId: '#p:M:A' } } } },
              { identifierFilter: { TemplateFilter: { value: { templateId: '#p:M:B' } } } },
            ],
          },
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain('filtersForAnyParty');
  });

  it('refuses an empty template list without asking the wallet', async () => {
    const provider = scriptedProvider({});
    await expect(cip103Wallet(provider, HOLDER).readActiveContracts([])).rejects.toBeInstanceOf(TypeError);
    expect(provider.requests).toEqual([]);
  });

  it.each([
    ['no ledger end', 'x', []],
    ['an answer that is not a list', 1, { activeContracts: [] }],
    ['an unknown entry', 1, [{ template_id: 'x' }]],
    ['an active contract without ids', 1, [acsEntry({ templateId: 'x', packageName: 'p' })]],
    ['an active contract without createdEvent', 1, [{ contractEntry: { JsActiveContract: {} } }]],
  ])('fails on %s', async (_label, offset, acs) => {
    await expect(
      list(
        cip103Wallet(
          ledger(() => acs, offset),
          HOLDER
        ),
        '#a:B:C'
      )
    ).rejects.toBeInstanceOf(WalletReadError);
  });

  it('reports a refused ledger API call with its code, once', async () => {
    const provider = scriptedProvider({
      ledgerApi: () => {
        throw rpcError(4200, 'not allowed');
      },
    });
    const error = await list(cip103Wallet(provider, HOLDER), '#a:B:C').catch((e: unknown) => e);
    expect(error).toMatchObject({ name: 'WalletReadError', code: 4200, rateLimited: false });
    expect((error as Error).message).toBe(
      "The wallet's ledgerApi GET /v2/state/ledger-end failed: not allowed (CIP-0103 4200 Unsupported Method)"
    );
    expect(provider.requests).toHaveLength(1);
  });

  it('makes no second request when the ACS read fails', async () => {
    const provider = ledger(() => {
      throw rpcError(-32002, 'Ledger access unavailable');
    });
    const error = await list(cip103Wallet(provider, HOLDER), '#a:B:C').catch((e: unknown) => e);
    expect(error).toMatchObject({ name: 'WalletReadError', code: -32002, rateLimited: false });
    expect((error as Error).message).toBe(
      "The wallet's ledgerApi POST /v2/state/active-contracts failed: Ledger access unavailable (CIP-0103 -32002 Resource unavailable)"
    );
    expect(resources(provider)).toEqual(['/v2/state/ledger-end', '/v2/state/active-contracts']);
  });

  // Canton answers 413 with JsonApiErrors.MaximumNumberOfElements (JSON_API_MAXIMUM_LIST_ELEMENTS_NUMBER_REACHED).
  it.each([
    [
      'its cause in the message',
      rpcError(-32603, 'The number of matching elements (201) is greater than the node limit (200).'),
    ],
    [
      'its error id in the data',
      new RpcError(-32002, 'Ledger access unavailable', {
        code: 'JSON_API_MAXIMUM_LIST_ELEMENTS_NUMBER_REACHED',
        cause: '…',
      }),
    ],
  ])("names the participant's list limit when the read hits it (%s)", async (_label, refusal) => {
    const provider = ledger(() => {
      throw refusal;
    });
    const error = await list(cip103Wallet(provider, HOLDER), '#a:B:C').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WalletReadError);
    expect(error).toMatchObject({ code: refusal.code, rateLimited: false });
    expect((error as Error).message).toMatch(
      /^The wallet party has more matching contracts than the participant returns in one list \(its http-list-max-elements-limit, 200 by default\), so the wallet cannot be read: /
    );
    expect(provider.requests).toHaveLength(2);
  });
});

describe('cip103Wallet reads under a wallet rate limit', () => {
  /** Answers -32005 for the first `limited` ledgerApi calls, then serves an empty ledger. */
  function rateLimited(limited: number, error = rpcError(-32005, 'Limit exceeded')): ReturnType<typeof ledger> {
    let calls = 0;
    return scriptedProvider({
      ledgerApi: (params) => {
        calls += 1;
        if (calls <= limited) throw error;
        return (params as { resource: string }).resource === '/v2/state/ledger-end' ? { offset: 3 } : [];
      },
    });
  }

  function clock(): { sleep: (ms: number) => Promise<void>; waits: number[] } {
    const waits: number[] = [];
    return {
      waits,
      sleep: async (ms) => {
        waits.push(ms);
      },
    };
  }

  it('backs off exponentially with jitter, then succeeds', async () => {
    const provider = rateLimited(3);
    const { sleep, waits } = clock();
    const randoms = [0, 1, 0.5];
    const contracts = await list(
      cip103Wallet(provider, HOLDER, {
        readRetry: { sleep, random: () => randoms.shift() ?? 0 },
      }),
      '#a:B:C'
    );
    expect(contracts).toEqual([]);
    // 500 ms × [0.5, 1], 1000 ms × [0.5, 1], 2000 ms × [0.5, 1].
    expect(waits).toEqual([250, 1000, 1500]);
    expect(resources(provider)).toEqual([
      '/v2/state/ledger-end',
      '/v2/state/ledger-end',
      '/v2/state/ledger-end',
      '/v2/state/ledger-end',
      '/v2/state/active-contracts',
    ]);
  });

  it('fails with a rate-limited WalletReadError after the last retry', async () => {
    const provider = rateLimited(Number.POSITIVE_INFINITY);
    const { sleep, waits } = clock();
    const error = await list(cip103Wallet(provider, HOLDER, { readRetry: { sleep, random: () => 1 } }), '#a:B:C').catch(
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(WalletReadError);
    expect(error).toMatchObject({ code: -32005, rateLimited: true });
    expect((error as Error).message).toBe(
      'The wallet rate-limited its ledger reads: ledgerApi GET /v2/state/ledger-end answered Limit exceeded (CIP-0103 -32005 Limit exceeded) on all 5 attempts, backing off 7.5 s in total. Wait a moment, then retry.'
    );
    expect(waits).toEqual([500, 1000, 2000, 4000]);
    expect(provider.requests).toHaveLength(5);
  });

  it('can be told not to retry', async () => {
    const provider = rateLimited(1);
    const error = await list(cip103Wallet(provider, HOLDER, { readRetry: { delaysMs: [] } }), '#a:B:C').catch(
      (e: unknown) => e
    );
    expect(error).toMatchObject({ rateLimited: true });
    expect((error as Error).message).toBe(
      'The wallet rate-limited its ledger reads: ledgerApi GET /v2/state/ledger-end answered Limit exceeded (CIP-0103 -32005 Limit exceeded). Wait a moment, then retry.'
    );
    expect(provider.requests).toHaveLength(1);
  });

  it("backs off on a provider's rate-limit quirk (-32603 'status 429'), and reports it as -32005", async () => {
    const quirk = rpcError(-32603, 'Session verification failed with status 429.');
    const { sleep, waits } = clock();
    await expect(
      list(cip103Wallet(rateLimited(2, quirk), HOLDER, { readRetry: { sleep, random: () => 0 } }), '#a:B:C')
    ).resolves.toEqual([]);
    expect(waits).toEqual([250, 500]);

    const error = await list(
      cip103Wallet(rateLimited(Number.POSITIVE_INFINITY, quirk), HOLDER, {
        readRetry: { delaysMs: [] },
      }),
      '#a:B:C'
    ).catch((e: unknown) => e);
    expect(error).toMatchObject({ name: 'WalletReadError', code: -32005, rateLimited: true });
    expect((error as Error).message).toContain('Session verification failed with status 429. (CIP-0103 -32603');
  });

  it.each([
    ['another internal error', rpcError(-32603, 'Session verification failed with status 500.')],
    ["'status 429' under another code", rpcError(-32002, 'status 429')],
  ])('does not retry %s', async (_label, error) => {
    const { sleep, waits } = clock();
    await expect(
      list(cip103Wallet(rateLimited(1, error), HOLDER, { readRetry: { sleep } }), '#a:B:C')
    ).rejects.toMatchObject({ code: error.code, rateLimited: false });
    expect(waits).toEqual([]);
  });

  it('never retries a submission the wallet rate-limited', async () => {
    const provider = scriptedProvider({
      prepareExecuteAndWait: () => {
        throw rpcError(-32005, 'Limit exceeded');
      },
    });
    const { sleep, waits } = clock();
    await expect(cip103Wallet(provider, HOLDER, { readRetry: { sleep } }).submit(submission)).rejects.toMatchObject({
      name: 'WalletSubmitError',
      outcome: 'unknown',
      code: -32005,
    });
    expect(provider.requests).toHaveLength(1);
    expect(waits).toEqual([]);
  });
});

describe('cip103Wallet.submit', () => {
  it('sends prepareExecuteAndWait as the party with a fresh UUID command id, and returns the update id', async () => {
    const provider = scriptedProvider({
      prepareExecuteAndWait: (params) => ({
        tx: {
          status: 'executed',
          commandId: (params as { commandId: string }).commandId,
          payload: { updateId: 'u-1', completionOffset: 7 },
        },
      }),
    });
    const wallet = cip103Wallet(provider, HOLDER);
    const result = await wallet.submit(submission);
    const params = submitted(provider);
    expect(params).toEqual({
      commandId: expect.stringMatching(UUID_V4),
      commands: submission.commands,
      disclosedContracts: [DISCLOSED],
      actAs: [HOLDER],
    });
    expect(result).toEqual({ updateId: 'u-1', commandId: params.commandId });
    await wallet.submit(submission);
    const second = provider.requests[1];
    expect(second?.method === 'prepareExecuteAndWait' && second.params.commandId).not.toBe(params.commandId);
  });

  it("omits empty disclosures, and returns the sent command id when the wallet's answer has none", async () => {
    const provider = scriptedProvider({
      prepareExecuteAndWait: () => ({ tx: { status: 'executed', payload: { updateId: 'u' } } }),
    });
    const result = await cip103Wallet(provider, HOLDER).submit({ commands: submission.commands });
    const params = submitted(provider);
    expect(params).not.toHaveProperty('disclosedContracts');
    expect(result).toEqual({ updateId: 'u', commandId: params.commandId });
  });

  it.each([
    [4001, 'rejected-by-user'],
    [-32003, 'failed'],
    [4100, 'unknown'],
    [4200, 'failed'],
    [4900, 'unknown'],
    [4901, 'unknown'],
    [-32700, 'failed'],
    [-32600, 'failed'],
    [-32601, 'failed'],
    [-32602, 'failed'],
    [-32000, 'failed'],
    [-32004, 'failed'],
    [-32001, 'unknown'],
    [-32002, 'unknown'],
    [-32005, 'unknown'],
    [-32603, 'unknown'],
    [1234, 'unknown'],
  ] as const)('maps provider error %i to %s, with the command id', async (code, outcome) => {
    const provider = scriptedProvider({
      prepareExecuteAndWait: () => {
        throw rpcError(code, 'nope');
      },
    });
    const error = await cip103Wallet(provider, HOLDER)
      .submit(submission)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WalletSubmitError);
    const { commandId } = submitted(provider);
    expect(error).toMatchObject({ outcome, code, commandId });
    expect((error as Error).message.includes(`Command id: ${commandId}.`)).toBe(outcome === 'unknown');
    expect(provider.requests).toHaveLength(1);
  });

  it('says not to resubmit when the outcome is unknown, and names the command id', () => {
    const error = cip103SubmitError(new Error('timed out'), 'cmd-1');
    expect(error).toMatchObject({ outcome: 'unknown', commandId: 'cmd-1' });
    expect(error.code).toBeUndefined();
    expect(error.message).toBe(
      'The wallet did not confirm the transaction: timed out. The outcome is unknown: do not resubmit blindly; check the wallet for the result first. Command id: cmd-1.'
    );
  });

  it('names the CIP-0103 code in every message', () => {
    expect(cip103SubmitError(rpcError(4200, 'x'), 'c').message).toBe(
      'The wallet refused the request, so nothing was submitted: x (CIP-0103 4200 Unsupported Method)'
    );
    expect(cip103SubmitError(rpcError(4100, 'Session changed during transaction'), 'c').message).toBe(
      'The wallet lost or changed its session during the request; it may or may not have been submitted: Session changed during transaction (CIP-0103 4100 Unauthorized). The outcome is unknown: do not resubmit blindly; check the wallet for the result first. Command id: c.'
    );
    expect(cip103SubmitError(rpcError(4001, 'no'), 'c').message).toBe(
      'The user rejected the transaction in the wallet: no (CIP-0103 4001 User Rejected Request)'
    );
    expect(cip103SubmitError(rpcError(-32003, 'bad'), 'c').message).toBe(
      'The ledger rejected the transaction: bad (CIP-0103 -32003 Transaction rejected)'
    );
    expect(cip103SubmitError({ code: 777, message: 'odd' }, 'c').message).toMatch(
      /^The wallet did not confirm the transaction: odd \(CIP-0103 777\)\./
    );
  });

  it('reads codes only from integer code fields', () => {
    expect(cip103ErrorCode({ code: 4001 })).toBe(4001);
    expect(cip103ErrorCode({ code: '4001' })).toBeUndefined();
    expect(cip103ErrorCode({ code: 1.5 })).toBeUndefined();
    expect(cip103ErrorCode('4001')).toBeUndefined();
    expect(CIP103_ERROR_CODES.resourceUnavailable).toBe(-32002);
  });

  it.each([
    ['a failed tx', { tx: { status: 'failed', commandId: 'wallet-cmd' } }, 'failed', 'wallet-cmd'],
    ['no tx', {}, 'unknown', undefined],
    ['an executed tx without an update id', { tx: { status: 'executed', payload: {} } }, 'unknown', undefined],
  ])('maps %s', async (_label, answer, outcome, walletCommandId) => {
    const provider = scriptedProvider({ prepareExecuteAndWait: () => answer });
    const error = await cip103Wallet(provider, HOLDER)
      .submit(submission)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ outcome, commandId: walletCommandId ?? submitted(provider).commandId });
  });
});

describe('newCommandId', () => {
  it('uses crypto.randomUUID when the runtime has it', () => {
    expect(newCommandId()).toMatch(UUID_V4);
    expect(newCommandId({ randomUUID: () => '00000000-0000-4000-8000-000000000000' })).toBe(
      '00000000-0000-4000-8000-000000000000'
    );
  });

  it('builds a version 4 UUID from getRandomValues outside secure contexts', () => {
    const fill =
      (byte: number) =>
      <T extends ArrayBufferView | null>(array: T): T => {
        if (array instanceof Uint8Array) array.fill(byte);
        return array;
      };
    expect(newCommandId({ getRandomValues: fill(0xff) })).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(newCommandId({ getRandomValues: fill(0x00) })).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('throws without a Web Crypto API rather than send no command id', () => {
    expect(() => newCommandId({})).toThrow(TypeError);
  });
});

describe('networks', () => {
  it('names a DA network as a wallet reports it in networkId', () => {
    expect(cip103NetworkId('devnet')).toBe('canton:devnet');
    expect(cip103NetworkId('mainnet')).toBe('canton:mainnet');
    expect([isDaNetwork('devnet'), isDaNetwork('mainnet'), isDaNetwork('testnet'), isDaNetwork(undefined)]).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it("refuses only the other DA network's id: any other or no id is accepted", () => {
    expect(reportsOtherNetwork('canton:mainnet', 'devnet')).toBe(true);
    expect(reportsOtherNetwork('canton:devnet', 'mainnet')).toBe(true);
    for (const id of ['canton:devnet', 'canton:main', 'canton:dev', 'mainnet', undefined]) {
      expect(reportsOtherNetwork(id, 'devnet')).toBe(false);
    }
  });
});
