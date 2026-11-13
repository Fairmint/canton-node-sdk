import { createDaUtilitiesClient, RegistryApiError, RegistryResponseError } from '../../../src/wallets';
import {
  DA_BURN_FACTORY_TEMPLATES,
  DA_TRANSFER_FACTORY_TEMPLATES,
  DA_UTILITIES_BASE_URLS,
} from '../../../src/wallets/da-utilities/client';
import { requireQualifiedName } from '../../../src/wallets/templates';
import { factoryTemplateError, type FactoryWithChoiceContext } from '../../../src/wallets/token-registry';
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
  it('derives its factory template names from the template ids', () => {
    expect(DA_TRANSFER_FACTORY_TEMPLATES).toEqual([RULE, PREAPPROVAL, FACTORY]);
    expect(DA_BURN_FACTORY_TEMPLATES).toEqual([FACTORY]);
    expect(() => requireQualifiedName('not-an-id')).toThrow(TypeError);
  });

  it('knows both networks', () => {
    expect(DA_UTILITIES_BASE_URLS).toEqual({
      devnet: 'https://api.utilities.digitalasset-dev.com',
      mainnet: 'https://api.utilities.digitalasset.com',
    });
    expect(createDaUtilitiesClient({ network: 'mainnet' }).baseUrl).toBe('https://api.utilities.digitalasset.com');
    expect(createDaUtilitiesClient({ baseUrl: 'https://proxy.example/' }).baseUrl).toBe('https://proxy.example');
  });

  it('reads the operator party with a plain GET', async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: { partyId: 'op::1' } }));
    const client = createDaUtilitiesClient({ network: 'devnet' }, { fetch });
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
    const client = createDaUtilitiesClient({ network: 'devnet' }, { fetch });
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
    const client = createDaUtilitiesClient({ network: 'devnet' }, { fetch });
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
    const client = createDaUtilitiesClient({ network: 'devnet' }, { fetch });
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
    const factory = await client.transferFactory({
      expectedAdmin: REGISTRAR,
      transfer,
    });
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
    const client = createDaUtilitiesClient({ network: 'devnet' }, { fetch });
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
    const client = createDaUtilitiesClient({ network: 'devnet' }, { fetch });
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
    const client = createDaUtilitiesClient({ network: 'devnet' }, { fetch });
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
    const client = createDaUtilitiesClient({ network: 'devnet' }, { fetch });
    await expect(client.mintOfferAcceptContext('00o')).rejects.toBeInstanceOf(RegistryResponseError);
  });

  it('defaults missing context values to {} and keeps synchronizerId optional', async () => {
    const { fetch } = fakeFetch(() => ({
      json: {
        choiceContextData: {},
        disclosedContracts: [{ contractId: 'c', templateId: 't:M:E', createdEventBlob: 'b' }],
      },
    }));
    const client = createDaUtilitiesClient({ network: 'devnet' }, { fetch });
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
      const client = createDaUtilitiesClient({ network: 'devnet' }, { fetch });
      await expect(
        client.transferFactory({
          expectedAdmin: REGISTRAR,
          transfer: {
            sender: HOLDER,
            receiver: OTHER,
            amount: '1',
            instrumentId: INSTRUMENT,
            requestedAt: 'a',
            executeBefore: 'b',
            inputHoldingCids: ['00h'],
            meta: { values: {} },
          },
        })
      ).rejects.toBeInstanceOf(RegistryResponseError);
    }
  });

  it('uses the global fetch when none is injected', async () => {
    const original = globalThis.fetch;
    const { fetch, calls } = fakeFetch(() => ({ json: { partyId: 'op' } }));
    globalThis.fetch = fetch as typeof globalThis.fetch;
    try {
      await createDaUtilitiesClient({ network: 'devnet' }).operatorParty();
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
    const client = createDaUtilitiesClient({ network: 'devnet' }, { fetch });
    expect(client.trustedProvidersOf(REGISTRAR)).toEqual([REGISTRAR]);
    expect(client.trustedProvidersOf(OTHER)).toEqual([OTHER]);
  });

  it('resolves the configured providers per instrument admin, and nothing inherited', () => {
    const client = createDaUtilitiesClient(
      { network: 'devnet' },
      { fetch, trustedProviders: { [REGISTRAR]: [PROVIDER, REGISTRAR] } }
    );
    expect(client.trustedProvidersOf(REGISTRAR)).toEqual([PROVIDER, REGISTRAR]);
    expect(client.trustedProvidersOf(OTHER)).toEqual([OTHER]);
    expect(client.trustedProvidersOf('constructor')).toEqual(['constructor']);
    expect(client.trustedProvidersOf('__proto__')).toEqual(['__proto__']);
  });

  it('keeps its own copy of the configured lists', () => {
    const providers = [PROVIDER];
    const client = createDaUtilitiesClient(
      { network: 'devnet' },
      { fetch, trustedProviders: { [REGISTRAR]: providers } }
    );
    providers.push(OTHER);
    expect(client.trustedProvidersOf(REGISTRAR)).toEqual([PROVIDER]);
  });

  it.each([
    ['an empty list', { [REGISTRAR]: [] }],
    ['an empty party id', { [REGISTRAR]: [''] }],
    ['an empty admin', { '': [PROVIDER] }],
    ['a non-list', { [REGISTRAR]: PROVIDER as unknown as string[] }],
  ])('refuses %s', (_name, trustedProviders) => {
    expect(() => createDaUtilitiesClient({ network: 'devnet' }, { fetch, trustedProviders })).toThrow(TypeError);
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
