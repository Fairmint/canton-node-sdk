import {
  cip103SubmitError,
  cip103Wallet,
  primaryPartyId,
  type Cip103Provider,
  type Cip103Request,
} from '../../../src/wallets/cip103';
import { ACS_MAX_PAGES, ACS_PAGE_SIZE, CIP103_ERROR_CODES, cip103ErrorCode } from '../../../src/wallets/cip103';
import { WalletReadError, WalletSubmitError, type WalletSubmission } from '../../../src/wallets';
import { acsEntry, disclosed, HOLDER, RpcError } from './helpers';

/** A CIP-0103 provider answering each method from `answers` (an answer may throw); others are 4200. */
function scriptedProvider(
  answers: Partial<Record<Cip103Request['method'], (params: unknown) => unknown>>
): Cip103Provider & { requests: Cip103Request[] } {
  const requests: Cip103Request[] = [];
  return {
    requests,
    on: () => undefined,
    removeListener: () => undefined,
    async request(args) {
      requests.push(args);
      const answer = answers[args.method];
      if (!answer) throw new RpcError(4200, `unsupported ${args.method}`);
      return answer('params' in args ? args.params : undefined);
    },
  };
}

const rpcError = (code: number, message: string): RpcError => new RpcError(code, message);

/** A `JsGetActiveContractsPageResponse`. */
const acsPage = (activeContracts: unknown[], activeAtOffset: number, nextPageToken?: string): unknown => ({
  activeContracts,
  activeAtOffset,
  ...(nextPageToken !== undefined && { nextPageToken }),
});

const submission: WalletSubmission = {
  commands: [
    {
      ExerciseCommand: {
        templateId: '#a:B:C',
        contractId: '00c',
        choice: 'Go',
        choiceArgument: {},
      },
    },
  ],
  disclosedContracts: [disclosed('00d', 'M:E')],
  commandId: 'cmd-1',
};

describe('primaryPartyId', () => {
  it('reads the party of the primary account', async () => {
    const provider = scriptedProvider({
      getPrimaryAccount: () => ({
        primary: true,
        partyId: HOLDER,
        status: 'allocated',
      }),
    });
    await expect(primaryPartyId(provider)).resolves.toBe(HOLDER);
    expect(provider.requests).toEqual([{ method: 'getPrimaryAccount' }]);
  });

  it('refuses an account without a party', async () => {
    const provider = scriptedProvider({
      getPrimaryAccount: () => ({ primary: true }),
    });
    await expect(primaryPartyId(provider)).rejects.toBeInstanceOf(WalletReadError);
  });

  it('reports a provider that is not connected with its CIP-0103 code', async () => {
    const provider = scriptedProvider({
      getPrimaryAccount: () => {
        throw rpcError(4100, 'No authorized account');
      },
    });
    const error = await primaryPartyId(provider).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WalletReadError);
    expect(error).toMatchObject({ code: 4100 });
    expect((error as Error).message).toBe(
      'The wallet did not return its primary account: No authorized account (CIP-0103 4100 Unauthorized)'
    );
  });
});

describe('cip103Wallet.listActiveContracts', () => {
  const createdEvent = {
    contractId: '00c',
    templateId: 'pkg:Utility.Registry.App.V0.Model.Mint:MintOffer',
    createArgument: { operator: 'op' },
    createdEventBlob: '',
    signatories: ['provider::1220bb', 7, ''],
    packageName: 'utility-registry-app-v0',
    interfaceViews: [
      { interfaceId: 'pkg:A:B', viewStatus: { code: 0 }, viewValue: { x: 1 } },
      { interfaceId: 'pkg:A:C', viewStatus: { code: 9, message: 'boom' } },
    ],
  };

  it('reads at the ledger end, for the connected party only, by template', async () => {
    const provider = scriptedProvider({
      ledgerApi: (params) => {
        const { resource } = params as { resource: string };
        return resource === '/v2/state/ledger-end'
          ? { offset: 42 }
          : acsPage([acsEntry(createdEvent), { contractEntry: { JsEmpty: {} } }], 42);
      },
    });
    const contracts = await cip103Wallet(provider, HOLDER).listActiveContracts({
      templateId: '#utility-registry-app-v0:Utility.Registry.App.V0.Model.Mint:MintOffer',
    });
    expect(contracts).toEqual([
      {
        contractId: '00c',
        templateId: 'pkg:Utility.Registry.App.V0.Model.Mint:MintOffer',
        packageName: 'utility-registry-app-v0',
        // Non-party entries are dropped.
        signatories: ['provider::1220bb'],
        createArgument: { operator: 'op' },
        interfaceViews: [{ interfaceId: 'pkg:A:B', viewValue: { x: 1 } }],
        synchronizerId: 'global-domain::1220ee',
      },
    ]);
    expect(provider.requests).toEqual([
      {
        method: 'ledgerApi',
        params: { requestMethod: 'get', resource: '/v2/state/ledger-end' },
      },
      {
        method: 'ledgerApi',
        params: {
          requestMethod: 'post',
          resource: '/v2/state/active-contracts-page',
          body: {
            activeAtOffset: 42,
            maxPageSize: ACS_PAGE_SIZE,
            eventFormat: {
              verbose: false,
              filtersByParty: {
                [HOLDER]: {
                  cumulative: [
                    {
                      identifierFilter: {
                        TemplateFilter: {
                          value: {
                            templateId: '#utility-registry-app-v0:Utility.Registry.App.V0.Model.Mint:MintOffer',
                            includeCreatedEventBlob: false,
                          },
                        },
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

  it('reads a contract without a signatory list as signed by no one', async () => {
    const provider = scriptedProvider({
      ledgerApi: (params) =>
        (params as { resource: string }).resource === '/v2/state/ledger-end'
          ? { offset: 1 }
          : acsPage(
              [
                acsEntry({
                  ...createdEvent,
                  signatories: undefined,
                  packageName: undefined,
                }),
              ],
              1
            ),
    });
    const [read] = await cip103Wallet(provider, HOLDER).listActiveContracts({
      templateId: '#p:M:E',
    });
    expect(read?.signatories).toEqual([]);
    expect(read).not.toHaveProperty('packageName');
  });

  it('asks for interface views on an interface filter', async () => {
    const provider = scriptedProvider({
      ledgerApi: (params) =>
        (params as { resource: string }).resource === '/v2/state/ledger-end' ? { offset: 1 } : acsPage([], 1),
    });
    await cip103Wallet(provider, HOLDER).listActiveContracts({
      interfaceId: '#i:M:I',
    });
    const read = provider.requests[1];
    const body = read?.method === 'ledgerApi' ? read.params.body : undefined;
    expect(body).toMatchObject({
      eventFormat: {
        filtersByParty: {
          [HOLDER]: {
            cumulative: [
              {
                identifierFilter: {
                  InterfaceFilter: {
                    value: {
                      interfaceId: '#i:M:I',
                      includeInterfaceView: true,
                      includeCreatedEventBlob: false,
                    },
                  },
                },
              },
            ],
          },
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain('filtersForAnyParty');
  });

  it.each([
    ['no ledger end', { offset: 'x' }, acsPage([], 1)],
    ['a page without a list', { offset: 1 }, { activeContracts: {}, activeAtOffset: 1 }],
    ['an unpaged list', { offset: 1 }, []],
    ['a page at another offset', { offset: 1 }, acsPage([], 2)],
    ['a page token that is not a string', { offset: 1 }, { activeContracts: [], activeAtOffset: 1, nextPageToken: 7 }],
    ['an unknown entry', { offset: 1 }, acsPage([{ template_id: 'x' }], 1)],
    ['an active contract without ids', { offset: 1 }, acsPage([acsEntry({ templateId: 'x' })], 1)],
  ])('fails on %s', async (_label, end, acs) => {
    const provider = scriptedProvider({
      ledgerApi: (params) => ((params as { resource: string }).resource === '/v2/state/ledger-end' ? end : acs),
    });
    await expect(
      cip103Wallet(provider, HOLDER).listActiveContracts({
        templateId: '#a:B:C',
      })
    ).rejects.toBeInstanceOf(WalletReadError);
  });

  it('follows the page token at one fixed offset until the last page', async () => {
    const entry = (contractId: string): unknown => acsEntry({ ...createdEvent, contractId });
    const pages: Record<string, unknown> = {
      first: acsPage([entry('00a'), entry('00b')], 42, 'p2'),
      p2: acsPage([entry('00c')], 42, 'p3'),
      p3: acsPage([entry('00d')], 42, ''),
    };
    const provider = scriptedProvider({
      ledgerApi: (params) => {
        const { resource, body } = params as { resource: string; body?: { pageToken?: string } };
        return resource === '/v2/state/ledger-end' ? { offset: 42 } : pages[body?.pageToken ?? 'first'];
      },
    });
    const contracts = await cip103Wallet(provider, HOLDER).listActiveContracts({ templateId: '#a:B:C' });
    expect(contracts.map((c) => c.contractId)).toEqual(['00a', '00b', '00c', '00d']);
    const bodies = provider.requests.slice(1).map((r) => (r.method === 'ledgerApi' ? r.params : undefined));
    expect(bodies.map((p) => p?.resource)).toEqual([
      '/v2/state/active-contracts-page',
      '/v2/state/active-contracts-page',
      '/v2/state/active-contracts-page',
    ]);
    expect(bodies.map((p) => p?.body?.['activeAtOffset'])).toEqual([42, 42, 42]);
    expect(bodies.map((p) => p?.body?.['pageToken'])).toEqual([undefined, 'p2', 'p3']);
    // Only the token changes between pages.
    expect({ ...bodies[2]?.body, pageToken: undefined }).toEqual({ ...bodies[0]?.body, pageToken: undefined });
    expect(
      provider.requests.filter((r) => r.method === 'ledgerApi' && r.params.resource === '/v2/state/ledger-end')
    ).toHaveLength(1);
  });

  it(`fails rather than page past ${ACS_MAX_PAGES} pages`, async () => {
    let page = 0;
    const provider = scriptedProvider({
      ledgerApi: (params) => {
        if ((params as { resource: string }).resource === '/v2/state/ledger-end') return { offset: 1 };
        page += 1;
        return acsPage([], 1, `p${page}`);
      },
    });
    const error = await cip103Wallet(provider, HOLDER)
      .listActiveContracts({ templateId: '#a:B:C' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WalletReadError);
    expect((error as Error).message).toBe(
      `The wallet's active contracts did not end within ${ACS_MAX_PAGES} pages of ${ACS_PAGE_SIZE}; nothing was read`
    );
    expect(page).toBe(ACS_MAX_PAGES);
  });

  it('fails on a page token that does not advance', async () => {
    const provider = scriptedProvider({
      ledgerApi: (params) =>
        (params as { resource: string }).resource === '/v2/state/ledger-end' ? { offset: 1 } : acsPage([], 1, 'same'),
    });
    await expect(cip103Wallet(provider, HOLDER).listActiveContracts({ templateId: '#a:B:C' })).rejects.toThrow(
      'The wallet returned the same active-contracts page token twice'
    );
  });

  it.each([4200, -32601, -32004, -32603, -32000])(
    'falls back once to the unpaged endpoint when the wallet answers the paged one with %i',
    async (code) => {
      const provider = scriptedProvider({
        ledgerApi: (params) => {
          const { resource } = params as { resource: string };
          if (resource === '/v2/state/ledger-end') return { offset: 9 };
          if (resource === '/v2/state/active-contracts-page') throw rpcError(code, 'not allowed');
          return [acsEntry(createdEvent)];
        },
      });
      const contracts = await cip103Wallet(provider, HOLDER).listActiveContracts({ templateId: '#a:B:C' });
      expect(contracts.map((c) => c.contractId)).toEqual(['00c']);
      const calls = provider.requests.map((r) => (r.method === 'ledgerApi' ? r.params : undefined));
      expect(calls.map((p) => p?.resource)).toEqual([
        '/v2/state/ledger-end',
        '/v2/state/active-contracts-page',
        '/v2/state/active-contracts',
      ]);
      expect(calls[2]?.body).toEqual({
        verbose: false,
        activeAtOffset: 9,
        eventFormat: calls[1]?.body?.['eventFormat'],
      });
    }
  );

  it('does not fall back when the wallet is refused or disconnected, or after the first page', async () => {
    const failing = (code: number, afterFirst: boolean): Cip103Provider & { requests: Cip103Request[] } =>
      scriptedProvider({
        ledgerApi: (params) => {
          const { resource, body } = params as { resource: string; body?: { pageToken?: string } };
          if (resource === '/v2/state/ledger-end') return { offset: 1 };
          if (resource === '/v2/state/active-contracts') return [];
          if (afterFirst && body?.pageToken === undefined) return acsPage([], 1, 'p2');
          throw rpcError(code, 'nope');
        },
      });
    for (const provider of [
      failing(4001, false),
      failing(4100, false),
      failing(4900, false),
      failing(4901, false),
      failing(4200, true),
    ]) {
      const error = await cip103Wallet(provider, HOLDER)
        .listActiveContracts({ templateId: '#a:B:C' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(WalletReadError);
      expect(
        provider.requests.some((r) => r.method === 'ledgerApi' && r.params.resource === '/v2/state/active-contracts')
      ).toBe(false);
    }
  });

  it('reports a refused ledger API call with its code', async () => {
    const provider = scriptedProvider({
      ledgerApi: () => {
        throw rpcError(4200, 'not allowed');
      },
    });
    const error = await cip103Wallet(provider, HOLDER)
      .listActiveContracts({ templateId: '#a:B:C' })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ name: 'WalletReadError', code: 4200 });
    expect((error as Error).message).toBe(
      "The wallet's ledgerApi GET /v2/state/ledger-end failed: not allowed (CIP-0103 4200 Unsupported Method)"
    );
  });
});

describe('cip103Wallet.submit', () => {
  it('sends prepareExecuteAndWait as the party and returns the update id', async () => {
    const provider = scriptedProvider({
      prepareExecuteAndWait: () => ({
        tx: {
          status: 'executed',
          commandId: 'cmd-1',
          payload: { updateId: 'u-1', completionOffset: 7 },
        },
      }),
    });
    await expect(cip103Wallet(provider, HOLDER).submit(submission)).resolves.toEqual({
      updateId: 'u-1',
      commandId: 'cmd-1',
    });
    expect(provider.requests).toEqual([
      {
        method: 'prepareExecuteAndWait',
        params: {
          commandId: 'cmd-1',
          commands: submission.commands,
          disclosedContracts: [disclosed('00d', 'M:E')],
          actAs: [HOLDER],
        },
      },
    ]);
  });

  it('generates a command id and omits empty disclosures', async () => {
    const provider = scriptedProvider({
      prepareExecuteAndWait: () => ({
        tx: { status: 'executed', payload: { updateId: 'u' } },
      }),
    });
    const result = await cip103Wallet(provider, HOLDER).submit({
      commands: submission.commands,
    });
    const sent = provider.requests[0];
    const params = sent?.method === 'prepareExecuteAndWait' ? sent.params : undefined;
    expect(params?.commandId).toMatch(/^[0-9a-f-]{36}$/);
    expect(params).not.toHaveProperty('disclosedContracts');
    expect(result.commandId).toBe(params?.commandId);
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
  ] as const)('maps provider error %i to %s', async (code, outcome) => {
    const provider = scriptedProvider({
      prepareExecuteAndWait: () => {
        throw rpcError(code, 'nope');
      },
    });
    const error = await cip103Wallet(provider, HOLDER)
      .submit(submission)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WalletSubmitError);
    expect(error).toMatchObject({ outcome, code, commandId: 'cmd-1' });
    expect(provider.requests).toHaveLength(1);
  });

  it('says not to resubmit when the outcome is unknown', () => {
    const error = cip103SubmitError(new Error('timed out'));
    expect(error.outcome).toBe('unknown');
    expect(error.code).toBeUndefined();
    expect(error.message).toBe(
      'The wallet did not confirm the transaction: timed out. The outcome is unknown: do not resubmit blindly; check the wallet for the result first.'
    );
  });

  it('names the CIP-0103 code in every message', () => {
    expect(cip103SubmitError(rpcError(4200, 'x')).message).toBe(
      'The wallet refused the request, so nothing was submitted: x (CIP-0103 4200 Unsupported Method)'
    );
    // Loop answers 4100 after its submit when the session changed: the transaction may have committed.
    expect(cip103SubmitError(rpcError(4100, 'Session changed during transaction')).message).toBe(
      'The wallet lost or changed its session during the request; it may or may not have been submitted: Session changed during transaction (CIP-0103 4100 Unauthorized). The outcome is unknown: do not resubmit blindly; check the wallet for the result first.'
    );
    expect(cip103SubmitError(rpcError(4001, 'no')).message).toBe(
      'The user rejected the transaction in the wallet: no (CIP-0103 4001 User Rejected Request)'
    );
    expect(cip103SubmitError(rpcError(-32003, 'bad')).message).toBe(
      'The ledger rejected the transaction: bad (CIP-0103 -32003 Transaction rejected)'
    );
    expect(cip103SubmitError({ code: 777, message: 'odd' }).message).toMatch(
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
    ['a failed tx', { tx: { status: 'failed', commandId: 'cmd-1' } }, 'failed'],
    ['no tx', {}, 'unknown'],
    ['an executed tx without an update id', { tx: { status: 'executed', payload: {} } }, 'unknown'],
  ])('maps %s', async (_label, answer, outcome) => {
    const provider = scriptedProvider({ prepareExecuteAndWait: () => answer });
    await expect(cip103Wallet(provider, HOLDER).submit(submission)).rejects.toMatchObject({
      outcome,
      commandId: 'cmd-1',
    });
  });

  it('never retries', async () => {
    const provider = scriptedProvider({
      prepareExecuteAndWait: () => {
        throw rpcError(-32002, 'timeout');
      },
    });
    await expect(cip103Wallet(provider, HOLDER).submit(submission)).rejects.toThrow();
    expect(provider.requests).toHaveLength(1);
  });
});
