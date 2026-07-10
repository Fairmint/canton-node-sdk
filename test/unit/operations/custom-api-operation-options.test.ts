import { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api/LedgerJsonApiClient.generated';
import { GetParties } from '../../../src/clients/ledger-json-api/operations/v2/parties/get';
import { ListParties } from '../../../src/clients/ledger-json-api/operations/v2/parties/list';
import { ValidatorApiClient } from '../../../src/clients/validator-api/ValidatorApiClient.generated';
import { GetMemberTrafficStatus } from '../../../src/clients/validator-api/operations/v0/scan-proxy/get-member-traffic-status';
import { type BaseClient, CantonRuntime, type ClientConfig, type OperationExecuteOptions } from '../../../src/core';

function createFakeClient(): { readonly client: BaseClient; readonly makeGetRequest: jest.Mock } {
  const makeGetRequest = jest.fn().mockResolvedValue({ partyDetails: [], nextPageToken: '' });
  const client = {
    getApiUrl: (): string => 'https://api.example',
    getPartyId: (): string => 'party',
    makeGetRequest,
  } as unknown as BaseClient;
  return { client, makeGetRequest };
}

function createRuntimeConfig(apiType: 'LEDGER_JSON_API' | 'VALIDATOR_API'): ClientConfig {
  return {
    network: 'localnet',
    apis: {
      [apiType]: {
        apiUrl: 'https://api.example',
        auth: { grantType: 'client_credentials', clientId: '' },
      },
    },
  };
}

describe('custom ApiOperation execution options', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    {
      name: 'GetParties',
      execute: async (client: BaseClient, signal: AbortSignal): Promise<unknown> =>
        new GetParties(client).execute({}, { signal, retry: { kind: 'exact-body', maxAttempts: 2 } }),
    },
    {
      name: 'ListParties',
      execute: async (client: BaseClient, signal: AbortSignal): Promise<unknown> =>
        new ListParties(client).execute({}, { signal, retry: { kind: 'exact-body', maxAttempts: 2 } }),
    },
    {
      name: 'GetMemberTrafficStatus',
      execute: async (client: BaseClient, signal: AbortSignal): Promise<unknown> =>
        new GetMemberTrafficStatus(client).execute(
          { domainId: 'domain', memberId: 'member' },
          { signal, retry: { kind: 'exact-body', maxAttempts: 2 } }
        ),
    },
  ])('forwards signal and retry controls from $name to its HTTP request', async ({ execute }) => {
    const { client, makeGetRequest } = createFakeClient();
    const { signal } = new AbortController();

    await execute(client, signal);

    expect(makeGetRequest).toHaveBeenCalledTimes(1);
    expect(makeGetRequest.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({
        signal,
        requestSemantics: 'read',
        retry: expect.objectContaining({ kind: 'exact-body', maxAttempts: 2 }),
      })
    );
  });

  it('forwards options through all three generated client methods', async () => {
    const getPartiesResult = { partyDetails: [], nextPageToken: '' };
    const getParties = jest.spyOn(GetParties.prototype, 'execute').mockResolvedValue(getPartiesResult);
    const listParties = jest.spyOn(ListParties.prototype, 'execute').mockResolvedValue(getPartiesResult);
    const getMemberTrafficStatus = jest
      .spyOn(GetMemberTrafficStatus.prototype, 'execute')
      .mockResolvedValue({} as never);
    const ledgerClient = new LedgerJsonApiClient(new CantonRuntime(createRuntimeConfig('LEDGER_JSON_API')));
    const validatorClient = new ValidatorApiClient(new CantonRuntime(createRuntimeConfig('VALIDATOR_API')));
    const options = { signal: new AbortController().signal };

    await ledgerClient.getParties({}, options);
    await ledgerClient.listParties({}, options);
    await validatorClient.getMemberTrafficStatus({ domainId: 'domain', memberId: 'member' }, options);

    expect(getParties).toHaveBeenCalledWith({}, options);
    expect(listParties).toHaveBeenCalledWith({}, options);
    expect(getMemberTrafficStatus).toHaveBeenCalledWith({ domainId: 'domain', memberId: 'member' }, options);
  });

  it('propagates cancellation and retry disable through member-traffic domain discovery', async () => {
    const controller = new AbortController();
    const getOpenAndIssuingMiningRounds = jest.fn(
      async (options?: OperationExecuteOptions<void>): Promise<never> =>
        new Promise<never>((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => {
              const error = new Error('discovery aborted');
              error.name = 'AbortError';
              reject(error);
            },
            { once: true }
          );
        })
    );
    const makeGetRequest = jest.fn();
    const client = {
      getApiUrl: (): string => 'https://api.example',
      getPartyId: (): string => 'party',
      getOpenAndIssuingMiningRounds,
      makeGetRequest,
    } as unknown as BaseClient;

    const request = new GetMemberTrafficStatus(client).execute(
      {},
      { signal: controller.signal, retry: { kind: 'none' } }
    );
    await Promise.resolve();
    controller.abort(new Error('stop discovery'));

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(getOpenAndIssuingMiningRounds).toHaveBeenCalledWith({
      signal: controller.signal,
      retry: { kind: 'none' },
    });
    expect(makeGetRequest).not.toHaveBeenCalled();
  });
});
