import {
  createDaUtilitiesClient,
  DA_REGISTRY_REQUEST_TIMEOUT_MS,
  DA_BURN_FACTORY_TEMPLATES,
  DA_TRANSFER_FACTORY_TEMPLATES,
  DA_UTILITIES_BASE_URLS,
  factoryTemplateError,
  type FactoryWithChoiceContext,
  type FetchLike,
} from '../../../src/wallets/da-utilities/client';
import { RegistryApiError, RegistryResponseError } from '../../../src/wallets/errors';
import { requireQualifiedName } from '../../../src/wallets/templates';
import {
  INSTRUMENT,
  CONTEXT_VALUES,
  daDisclosed,
  DEVNET,
  disclosed,
  fakeFetch,
  HOLDER,
  OTHER,
  REGISTRAR,
} from './helpers';

const RULE = 'Utility.Registry.V0.Rule.Transfer:TransferRule';
const FACTORY = 'Utility.Registry.App.V0.Service.AllocationFactory:AllocationFactory';
const PREAPPROVAL = 'Utility.Registry.App.V0.Model.TransferPreapproval:TransferPreapproval';

const choiceContext = {
  choiceContextData: { values: CONTEXT_VALUES },
  disclosedContracts: [daDisclosed('00config', 'X.Y:Config')],
};

describe('createDaUtilitiesClient', () => {
  it('derives its factory template names from the template ids, per transfer kind', () => {
    expect(DA_TRANSFER_FACTORY_TEMPLATES).toEqual({
      direct: [PREAPPROVAL],
      offer: [RULE, FACTORY],
      self: [RULE, FACTORY],
    });
    expect(DA_BURN_FACTORY_TEMPLATES).toEqual([FACTORY]);
    expect(() => requireQualifiedName('not-an-id')).toThrow(TypeError);
  });

  it('refuses a request timeout setTimeout cannot honour', () => {
    expect(() => createDaUtilitiesClient('devnet', { timeoutMs: 2 ** 31 })).toThrow(/at most 2147483647/);
    expect(() =>
      createDaUtilitiesClient('devnet', { timeoutMs: 2_147_483_647, fetch: jest.fn() as never })
    ).not.toThrow();
  });

  it("calls DA's URL of the network, or the given base URL without its trailing slashes", async () => {
    expect(DA_UTILITIES_BASE_URLS).toEqual({
      devnet: 'https://api.utilities.digitalasset-dev.com',
      mainnet: 'https://api.utilities.digitalasset.com',
    });
    const { fetch, calls } = fakeFetch(() => ({ json: { partyId: 'op::1' } }));
    await createDaUtilitiesClient('mainnet', { fetch }).operatorParty();
    await createDaUtilitiesClient('mainnet', { fetch, baseUrl: 'https://proxy.example//' }).operatorParty();
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.utilities.digitalasset.com/api/utilities/v0/operator',
      'https://proxy.example/api/utilities/v0/operator',
    ]);
  });

  it('reads the operator party with a plain GET', async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: { partyId: 'op::1' } }));
    const client = createDaUtilitiesClient('devnet', { fetch });
    await expect(client.operatorParty()).resolves.toBe('op::1');
    expect(calls).toEqual([
      {
        url: `${DEVNET}/api/utilities/v0/operator`,
        method: 'GET',
        headers: undefined,
        body: undefined,
      },
    ]);
  });

  it('fetches the mint offer accept context and strips disclosed contracts', async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: choiceContext }));
    const client = createDaUtilitiesClient('devnet', { fetch });
    await expect(client.mintOfferAcceptContext('00of/fer')).resolves.toEqual({
      choiceContextData: { values: CONTEXT_VALUES },
      disclosedContracts: [disclosed('00config', 'X.Y:Config')],
    });
    expect(calls).toEqual([
      {
        url: `${DEVNET}/api/utilities/v0/registry/mint/v0/offer/00of%2Ffer/choice-contexts/accept`,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {},
      },
    ]);
  });

  it('fetches the burn request factory', async () => {
    const { fetch, calls } = fakeFetch(() => ({
      json: { factoryId: '00factory', choiceContext },
    }));
    const client = createDaUtilitiesClient('devnet', { fetch });
    const factory = await client.burnRequestContext({
      holder: HOLDER,
      holdingContractIds: ['00h1'],
      instrumentId: INSTRUMENT,
    });
    expect(factory.factoryId).toBe('00factory');
    expect(calls[0]).toEqual({
      url: `${DEVNET}/api/utilities/v0/registry/burn/v0/request`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: {
        holder: HOLDER,
        holdingContractIds: ['00h1'],
        instrumentId: { admin: REGISTRAR, id: 'XMPL' },
      },
    });
  });

  it('asks the registrar for the transfer factory', async () => {
    const { fetch, calls } = fakeFetch(() => ({
      json: { factoryId: '00factory', transferKind: 'direct', choiceContext },
    }));
    const client = createDaUtilitiesClient('devnet', { fetch });
    const transfer = {
      sender: HOLDER,
      receiver: OTHER,
      amount: '1.0000000000',
      instrumentId: INSTRUMENT,
      requestedAt: '2026-11-13T12:00:00.000Z',
      executeBefore: '2026-11-14T12:00:00.000Z',
      inputHoldingCids: ['00h1'],
      meta: { values: {} },
    };
    const factory = await client.transferFactory(REGISTRAR, transfer);
    expect(factory.transferKind).toBe('direct');
    expect(calls[0]).toEqual({
      url: `${DEVNET}/api/token-standard/v0/registrars/${encodeURIComponent(REGISTRAR)}/registry/transfer-instruction/v1/transfer-factory`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: {
        choiceArguments: {
          expectedAdmin: REGISTRAR,
          transfer: {
            ...transfer,
            instrumentId: { admin: REGISTRAR, id: 'XMPL' },
          },
          extraArgs: { context: { values: {} }, meta: { values: {} } },
        },
        excludeDebugFields: true,
      },
    });
  });

  it.each(['accept', 'reject', 'withdraw'] as const)('fetches the transfer instruction %s context', async (action) => {
    const { fetch, calls } = fakeFetch(() => ({ json: choiceContext }));
    const client = createDaUtilitiesClient('devnet', { fetch });
    await client.transferInstructionContext(REGISTRAR, '00ti', action);
    expect(calls[0]).toMatchObject({
      url: `${DEVNET}/api/token-standard/v0/registrars/${encodeURIComponent(REGISTRAR)}/registry/transfer-instruction/v1/00ti/choice-contexts/${action}`,
      method: 'POST',
      body: { excludeDebugFields: true },
    });
  });

  it('maps non-2xx answers to RegistryApiError with the raw body', async () => {
    const { fetch } = fakeFetch(() => ({
      status: 404,
      text: '{"error":"not_found","error_description":"No holdings provided"}',
    }));
    const client = createDaUtilitiesClient('devnet', { fetch });
    const error = await client
      .burnRequestContext({
        holder: HOLDER,
        holdingContractIds: [],
        instrumentId: INSTRUMENT,
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RegistryApiError);
    expect(error).toMatchObject({
      status: 404,
      body: '{"error":"not_found","error_description":"No holdings provided"}',
      url: `${DEVNET}/api/utilities/v0/registry/burn/v0/request`,
    });
  });

  it.each([
    ['non-JSON', { text: 'Something went wrong' }],
    ['no partyId', { json: { party: 'x' } }],
  ])('refuses an operator answer with %s', async (_label, answer) => {
    const { fetch } = fakeFetch(() => answer);
    const client = createDaUtilitiesClient('devnet', { fetch });
    await expect(client.operatorParty()).rejects.toBeInstanceOf(RegistryResponseError);
  });

  it.each([
    ['no choiceContextData', { disclosedContracts: [] }],
    ['no disclosedContracts', { choiceContextData: { values: {} } }],
    [
      'a disclosed contract without a blob',
      {
        choiceContextData: { values: {} },
        disclosedContracts: [{ contractId: 'a', templateId: 'b' }],
      },
    ],
    ['non-JSON context values', { choiceContextData: { values: 'x' }, disclosedContracts: [] }],
  ])('refuses a choice context with %s', async (_label, json) => {
    const { fetch } = fakeFetch(() => ({ json }));
    const client = createDaUtilitiesClient('devnet', { fetch });
    await expect(client.mintOfferAcceptContext('00o')).rejects.toBeInstanceOf(RegistryResponseError);
  });

  it('defaults missing context values to {} and keeps synchronizerId optional', async () => {
    const { fetch } = fakeFetch(() => ({
      json: {
        choiceContextData: {},
        disclosedContracts: [{ contractId: 'c', templateId: 't:M:E', createdEventBlob: 'b' }],
      },
    }));
    const client = createDaUtilitiesClient('devnet', { fetch });
    await expect(client.mintOfferAcceptContext('00o')).resolves.toEqual({
      choiceContextData: { values: {} },
      disclosedContracts: [{ contractId: 'c', templateId: 't:M:E', createdEventBlob: 'b' }],
    });
  });

  it('refuses an unknown transferKind or a missing factoryId', async () => {
    for (const json of [
      { factoryId: '00f', transferKind: 'magic', choiceContext },
      { transferKind: 'offer', choiceContext },
    ]) {
      const { fetch } = fakeFetch(() => ({ json }));
      const client = createDaUtilitiesClient('devnet', { fetch });
      await expect(
        client.transferFactory(REGISTRAR, {
          sender: HOLDER,
          receiver: OTHER,
          amount: '1',
          instrumentId: INSTRUMENT,
          requestedAt: 'a',
          executeBefore: 'b',
          inputHoldingCids: ['00h'],
          meta: { values: {} },
        })
      ).rejects.toBeInstanceOf(RegistryResponseError);
    }
  });

  it('reads instrument metadata from the registrar, keeps an answer and asks again after a failure', async () => {
    let status = 503;
    const { fetch, calls } = fakeFetch(() =>
      status === 200
        ? { json: { id: 'X/1', name: 'Example', symbol: 'XMPL', decimals: 0, totalSupply: '5' } }
        : { status, text: 'down' }
    );
    const client = createDaUtilitiesClient('devnet', { fetch });
    const instrument = { admin: REGISTRAR, id: 'X/1' };
    await expect(client.instrumentMetadata(instrument)).resolves.toBeUndefined();
    status = 200;
    const [a, b] = await Promise.all([client.instrumentMetadata(instrument), client.instrumentMetadata(instrument)]);
    expect(a).toEqual({ name: 'Example', symbol: 'XMPL', decimals: 0 });
    expect(b).toEqual(a);
    await client.instrumentMetadata(instrument);
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      [
        'GET',
        `${DEVNET}/api/token-standard/v0/registrars/${encodeURIComponent(REGISTRAR)}/registry/metadata/v1/instruments/X%2F1`,
      ],
      [
        'GET',
        `${DEVNET}/api/token-standard/v0/registrars/${encodeURIComponent(REGISTRAR)}/registry/metadata/v1/instruments/X%2F1`,
      ],
    ]);
  });

  it('gives up on a metadata lookup that does not answer within 5 s, and asks again next time', async () => {
    jest.useFakeTimers();
    try {
      let calls = 0;
      const fetch: FetchLike = async () => {
        calls += 1;
        return new Promise(() => undefined); // never answers
      };
      const client = createDaUtilitiesClient('devnet', { fetch });
      const lookup = client.instrumentMetadata(INSTRUMENT);
      await jest.advanceTimersByTimeAsync(5000);
      await expect(lookup).resolves.toBeUndefined();
      const again = client.instrumentMetadata(INSTRUMENT);
      await jest.advanceTimersByTimeAsync(5000);
      await expect(again).resolves.toBeUndefined();
      expect(calls).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('fails a request still unanswered after timeoutMs (30 s by default), aborting its fetch', async () => {
    jest.useFakeTimers();
    try {
      const signals: Array<AbortSignal | undefined> = [];
      const fetch: FetchLike = async (_url, init) => {
        signals.push(init.signal);
        return new Promise(() => undefined); // never answers
      };
      expect(DA_REGISTRY_REQUEST_TIMEOUT_MS).toBe(30_000);
      const slow = createDaUtilitiesClient('devnet', { fetch }).operatorParty();
      const failed = slow.catch((e: unknown) => e);
      await jest.advanceTimersByTimeAsync(29_999);
      expect(signals[0]?.aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      const error = await failed;
      expect(error).toBeInstanceOf(RegistryResponseError);
      expect((error as Error).message).toMatch(/did not answer .* within 30 s; nothing was submitted/);
      expect(signals[0]?.aborted).toBe(true);

      const quick = createDaUtilitiesClient('devnet', { fetch, timeoutMs: 1000 }).mintOfferAcceptContext('00mint');
      const quickFailed = quick.catch((e: unknown) => e);
      await jest.advanceTimersByTimeAsync(1000);
      expect(await quickFailed).toBeInstanceOf(RegistryResponseError);
    } finally {
      jest.useRealTimers();
    }
  });

  it("rejects with the caller's AbortError, not a timeout, when the caller cancels", async () => {
    const fetch: FetchLike = async () => new Promise(() => undefined);
    const controller = new AbortController();
    const pending = createDaUtilitiesClient('devnet', { fetch }).mintOfferAcceptContext('00mint', controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('refuses timeoutMs %p', (timeoutMs) => {
    expect(() => createDaUtilitiesClient('devnet', { timeoutMs })).toThrow(/timeoutMs/);
  });

  it.each([
    ['a non-integer decimals', { id: 'XMPL', name: 'n', symbol: 's', decimals: 2.5 }],
    ['a negative decimals', { id: 'XMPL', name: 'n', symbol: 's', decimals: -1 }],
    ['no symbol', { id: 'XMPL', name: 'n', decimals: 2 }],
    ['non-JSON', 'oops'],
  ])('reads no metadata from an answer with %s', async (_name, answer) => {
    const { fetch } = fakeFetch(() => (typeof answer === 'string' ? { text: answer } : { json: answer }));
    await expect(createDaUtilitiesClient('devnet', { fetch }).instrumentMetadata(INSTRUMENT)).resolves.toBeUndefined();
  });

  it('uses the global fetch when none is injected', async () => {
    const original = globalThis.fetch;
    const { fetch, calls } = fakeFetch(() => ({ json: { partyId: 'op' } }));
    globalThis.fetch = fetch as typeof globalThis.fetch;
    try {
      await createDaUtilitiesClient('devnet').operatorParty();
      expect(calls).toHaveLength(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('createDaUtilitiesClient trustedProviders', () => {
  const { fetch } = fakeFetch(() => ({ json: {} }));
  const PROVIDER = 'provider::1220ab';

  it('trusts only the instrument admin itself by default', () => {
    const client = createDaUtilitiesClient('devnet', { fetch });
    expect(client.trustedProvidersOf(REGISTRAR)).toEqual([REGISTRAR]);
    expect(client.trustedProvidersOf(OTHER)).toEqual([OTHER]);
  });

  it('resolves the configured providers per instrument admin, and nothing inherited', () => {
    const client = createDaUtilitiesClient('devnet', {
      fetch,
      trustedProviders: { [REGISTRAR]: [PROVIDER, REGISTRAR] },
    });
    expect(client.trustedProvidersOf(REGISTRAR)).toEqual([PROVIDER, REGISTRAR]);
    expect(client.trustedProvidersOf(OTHER)).toEqual([OTHER]);
    expect(client.trustedProvidersOf('constructor')).toEqual(['constructor']);
    expect(client.trustedProvidersOf('__proto__')).toEqual(['__proto__']);
  });

  it('keeps its own copy of the configured lists', () => {
    const providers = [PROVIDER];
    const client = createDaUtilitiesClient('devnet', { fetch, trustedProviders: { [REGISTRAR]: providers } });
    providers.push(OTHER);
    expect(client.trustedProvidersOf(REGISTRAR)).toEqual([PROVIDER]);
  });

  it.each([
    ['an empty list', { [REGISTRAR]: [] }],
    ['an empty party id', { [REGISTRAR]: [''] }],
    ['an empty admin', { '': [PROVIDER] }],
    ['a non-list', { [REGISTRAR]: PROVIDER as unknown as string[] }],
  ])('refuses %s', (_name, trustedProviders) => {
    expect(() => createDaUtilitiesClient('devnet', { fetch, trustedProviders })).toThrow(TypeError);
  });
});

describe('factoryTemplateError', () => {
  const expected = [RULE, FACTORY, PREAPPROVAL];
  const factory = (templateQualified: string, contractId = '00f'): FactoryWithChoiceContext => ({
    factoryId: '00f',
    choiceContextData: { values: {} },
    disclosedContracts: [disclosed(contractId, templateQualified)],
  });

  it('accepts a disclosed factory of an expected template, in any package id', () => {
    expect(factoryTemplateError(factory(PREAPPROVAL), expected)).toBeNull();
    expect(factoryTemplateError(factory(FACTORY), expected)).toBeNull();
  });

  it('refuses an undisclosed or unexpected factory', () => {
    expect(factoryTemplateError(factory(RULE, '00other'), expected)).toMatch(/did not disclose/);
    expect(factoryTemplateError(factory('Evil.Module:Factory'), expected)).toMatch(/unexpected template/);
  });
});

describe('createDaUtilitiesClient: cancellation', () => {
  const isAbort = (error: unknown): boolean => (error as { name?: unknown }).name === 'AbortError';

  it("passes a signal that follows the caller's to fetch, and rejects with an AbortError once it aborted", async () => {
    let caller = new AbortController();
    let passed: AbortSignal | undefined;
    const { fetch, calls } = fakeFetch((call) => {
      passed = call.signal;
      caller.abort();
      return { json: choiceContext };
    });
    const client = createDaUtilitiesClient('devnet', { fetch });
    await client.mintOfferAcceptContext('00offer', caller.signal).catch(() => undefined);
    expect(passed?.aborted).toBe(true);
    calls.length = 0;
    caller = new AbortController();

    const controller = new AbortController();
    controller.abort();
    const error = await client.mintOfferAcceptContext('00offer', controller.signal).catch((e: unknown) => e);
    expect(isAbort(error)).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('stops waiting for a fetch that ignores the signal', async () => {
    let answer: () => void = () => undefined;
    const fetch: FetchLike = async () =>
      new Promise((resolve) => {
        answer = () => resolve({ ok: true, status: 200, text: async () => JSON.stringify(choiceContext) });
      });
    const client = createDaUtilitiesClient('devnet', { fetch });
    const controller = new AbortController();
    const pending = client.mintOfferAcceptContext('00offer', controller.signal).catch((e: unknown) => e);
    controller.abort();
    expect(isAbort(await pending)).toBe(true);
    answer();
  });

  it("stops one caller waiting for the shared operator and metadata lookups, without failing the others'", async () => {
    let answer: () => void = () => undefined;
    const fetch: FetchLike = async (url) =>
      new Promise((resolve) => {
        const json = url.endsWith('/operator')
          ? { partyId: 'op::1' }
          : { id: 'XMPL', name: 'Example', symbol: 'XMPL', decimals: 2 };
        const previous = answer;
        answer = () => {
          previous();
          resolve({ ok: true, status: 200, text: async () => JSON.stringify(json) });
        };
      });
    const client = createDaUtilitiesClient('devnet', { fetch });
    const controller = new AbortController();
    const cancelledOperator = client.operatorParty(controller.signal).catch((e: unknown) => e);
    const cancelledMetadata = client.instrumentMetadata(INSTRUMENT, controller.signal).catch((e: unknown) => e);
    const operator = client.operatorParty();
    const metadata = client.instrumentMetadata(INSTRUMENT);
    controller.abort();
    expect(isAbort(await cancelledOperator)).toBe(true);
    expect(isAbort(await cancelledMetadata)).toBe(true);
    answer();
    await expect(operator).resolves.toBe('op::1');
    await expect(metadata).resolves.toEqual({ name: 'Example', symbol: 'XMPL', decimals: 2 });
  });

  it('leaves no unhandled rejection when a caller cancels and the shared lookups then fail', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      let fail: () => void = () => undefined;
      const fetch: FetchLike = async () =>
        new Promise((_resolve, reject) => {
          fail = () => reject(new Error('registry down'));
        });
      const client = createDaUtilitiesClient('devnet', { fetch });
      const controller = new AbortController();
      const cancelled = client.operatorParty(controller.signal).catch((e: unknown) => e);
      const other = client.operatorParty().catch((e: unknown) => e);
      controller.abort();
      expect(isAbort(await cancelled)).toBe(true);
      fail();
      expect(await other).toBeInstanceOf(Error);
      // Only the cancelled caller: nobody else observes the shared promise.
      const solo = new AbortController();
      const soloCancelled = client.operatorParty(solo.signal).catch((e: unknown) => e);
      solo.abort();
      expect(isAbort(await soloCancelled)).toBe(true);
      fail();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
