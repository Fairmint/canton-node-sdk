import { type AxiosInstance } from 'axios';
import { ApiError, ValidationError } from '../../../src/core/errors';
import {
  createDaRegistryApi,
  parseDaRegistryChoiceContext,
  parseDaRegistryDisclosedContract,
} from '../../../src/da-registry';

const BASE = 'https://api.utilities.digitalasset-dev.com';

const DISCLOSED = {
  templateId: 'deadbeef:Utility.Registry.App.V0.Model.TransferPreapproval:TransferPreapproval',
  contractId: 'cid-1',
  createdEventBlob: 'blob',
  synchronizerId: 'global-domain::1220aa',
  debugField: 'stripped',
};

function mockHttp(get: jest.Mock, post: jest.Mock): AxiosInstance {
  return { get, post } as unknown as AxiosInstance;
}

function notFound(): never {
  const error = new Error('Request failed with status code 404');
  (error as { isAxiosError?: boolean }).isAxiosError = true;
  (error as { response?: unknown }).response = { status: 404, data: { error: 'not found' } };
  throw error;
}

function serverError(): never {
  const error = new Error('Request failed with status code 500');
  (error as { isAxiosError?: boolean }).isAxiosError = true;
  (error as { response?: unknown }).response = { status: 500, statusText: 'Internal', data: { error: 'boom' } };
  throw error;
}

describe('createDaRegistryApi', () => {
  it('reads the operator party', async () => {
    const get = jest.fn().mockResolvedValue({ data: { partyId: 'operator::1220aa' } });
    const api = createDaRegistryApi(BASE, mockHttp(get, jest.fn()));

    await expect(api.operatorParty()).resolves.toBe('operator::1220aa');
    expect(get).toHaveBeenCalledWith(`${BASE}/api/utilities/v0/operator`);
  });

  it('fails when the operator response has no partyId', async () => {
    const api = createDaRegistryApi(BASE, mockHttp(jest.fn().mockResolvedValue({ data: {} }), jest.fn()));
    await expect(api.operatorParty()).rejects.toBeInstanceOf(ValidationError);
  });

  it('returns registry info and instrument metadata, null on 404', async () => {
    const info = { supportedApis: { 'splice-api-token-transfer-instruction-v2': {} } };
    const get = jest
      .fn()
      .mockResolvedValueOnce({ data: info })
      .mockImplementationOnce(notFound)
      .mockImplementationOnce(notFound);
    const api = createDaRegistryApi(BASE, mockHttp(get, jest.fn()));

    await expect(api.registryInfo('ota::1220bb')).resolves.toEqual(info);
    expect(get).toHaveBeenCalledWith(
      `${BASE}/api/token-standard/v0/registrars/ota%3A%3A1220bb/registry/metadata/v1/info`
    );
    await expect(api.registryInfo('unknown::1220cc')).resolves.toBeNull();
    await expect(api.instrumentMetadata('ota::1220bb', 'CNTN')).resolves.toBeNull();
  });

  it('fetches a mint offer factory with its choice context, null on 404', async () => {
    const post = jest
      .fn()
      .mockResolvedValueOnce({
        data: {
          factoryId: 'factory-1',
          choiceContext: { choiceContextData: { values: { k: 1 } }, disclosedContracts: [DISCLOSED] },
        },
      })
      .mockImplementationOnce(notFound);
    const api = createDaRegistryApi(BASE, mockHttp(jest.fn(), post));

    const factory = await api.mintOfferFactory('holder::1220cc', { admin: 'ota::1220bb', id: 'CNTN' });
    expect(post).toHaveBeenCalledWith(`${BASE}/api/utilities/v0/registry/mint/v0/offer`, {
      holder: 'holder::1220cc',
      instrumentId: { admin: 'ota::1220bb', id: 'CNTN' },
    });
    expect(factory).toEqual({
      factoryId: 'factory-1',
      choiceContext: {
        choiceContextData: { values: { k: 1 } },
        disclosedContracts: [
          {
            templateId: DISCLOSED.templateId,
            contractId: 'cid-1',
            createdEventBlob: 'blob',
            synchronizerId: DISCLOSED.synchronizerId,
          },
        ],
      },
    });

    await expect(api.mintOfferFactory('holder::1220cc', { admin: 'ota::1220bb', id: 'CNTN' })).resolves.toBeNull();
  });

  it('fetches the transfer factory, validating transferKind', async () => {
    const post = jest.fn().mockResolvedValue({
      data: {
        factoryId: 'factory-9',
        transferKind: 'direct',
        choiceContext: { choiceContextData: { values: {} }, disclosedContracts: [DISCLOSED] },
      },
    });
    const api = createDaRegistryApi(BASE, mockHttp(jest.fn(), post));
    const transfer = { sender: 'ota::1220bb', receiver: 'alice::1220cc', amount: '10' };

    const factory = await api.transferFactory('ota::1220bb', transfer);

    expect(post).toHaveBeenCalledWith(
      `${BASE}/api/token-standard/v0/registrars/ota%3A%3A1220bb/registry/transfer-instruction/v1/transfer-factory`,
      {
        choiceArguments: {
          expectedAdmin: 'ota::1220bb',
          transfer,
          extraArgs: { context: { values: {} }, meta: { values: {} } },
        },
        excludeDebugFields: true,
      }
    );
    expect(factory.transferKind).toBe('direct');
    expect(factory.factoryId).toBe('factory-9');
    expect(factory.choiceContext.disclosedContracts).toHaveLength(1);
  });

  it('rejects an unknown transferKind', async () => {
    const post = jest.fn().mockResolvedValue({ data: { factoryId: 'f', transferKind: 'sideways' } });
    const api = createDaRegistryApi(BASE, mockHttp(jest.fn(), post));
    await expect(api.transferFactory('ota::1220bb', {})).rejects.toThrow(/transferKind sideways/);
  });

  it('throws an ApiError with the request and the response body for non-404 failures', async () => {
    const api = createDaRegistryApi(BASE, mockHttp(jest.fn().mockImplementation(serverError), jest.fn()));

    const failure = await api.registryInfo('ota::1220bb').catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as Error).message).toBe(
      `GET ${BASE}/api/token-standard/v0/registrars/ota%3A%3A1220bb/registry/metadata/v1/info failed: 500 {"error":"boom"}`
    );
  });

  it('keeps the 404 body in the message of a transfer-factory failure', async () => {
    const api = createDaRegistryApi(BASE, mockHttp(jest.fn(), jest.fn().mockImplementation(notFound)));
    await expect(api.transferFactory('ota::1220bb', {})).rejects.toThrow(/not found/);
  });
});

describe('response parsers', () => {
  it('strips extra fields from disclosed contracts', () => {
    expect(parseDaRegistryDisclosedContract(DISCLOSED)).toEqual({
      templateId: DISCLOSED.templateId,
      contractId: 'cid-1',
      createdEventBlob: 'blob',
      synchronizerId: DISCLOSED.synchronizerId,
    });
  });

  it.each(['templateId', 'contractId', 'createdEventBlob', 'synchronizerId'] as const)(
    'rejects a disclosed contract without %s',
    (field) => {
      const raw = { ...DISCLOSED, [field]: '' };
      expect(() => parseDaRegistryDisclosedContract(raw)).toThrow(new RegExp(`without ${field}`));
    }
  );

  it('defaults a missing choice context to empty values and no disclosures', () => {
    expect(parseDaRegistryChoiceContext(undefined)).toEqual({
      choiceContextData: { values: {} },
      disclosedContracts: [],
    });
  });
});
