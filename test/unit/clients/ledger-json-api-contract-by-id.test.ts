import { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { CantonRuntime, type ClientConfig, ValidationError } from '../../../src/core';

const config: ClientConfig = {
  network: 'localnet',
  authUrl: 'https://auth.example',
  apis: {
    LEDGER_JSON_API: {
      apiUrl: 'https://ledger.example.test',
      auth: {
        grantType: 'client_credentials',
        clientId: 'ledger-client',
        clientSecret: 'secret',
      },
    },
  },
};

const PROTO_VALUE_BASE64 = Buffer.from('encoded-protobuf').toString('base64');

function createClient(): LedgerJsonApiClient {
  return new LedgerJsonApiClient(new CantonRuntime(config));
}

function createWireResponse(): Record<string, unknown> {
  return {
    createdEvent: {
      offset: 1,
      nodeId: 0,
      contractId: '00contract-id',
      templateId: 'package-id:Splice.Wallet.Install:WalletAppInstall',
      contractKey: null,
      contractKeyHash: '',
      createArgument: {
        validator: 'validator::fingerprint',
        nestedNull: null,
        values: [1, true, null],
      },
      createdEventBlob: '',
      interfaceViews: [
        {
          interfaceId: 'package-id:Module:Interface',
          viewStatus: {
            code: 0,
            message: '',
            details: [
              {
                typeUrl: 'type.googleapis.com/google.rpc.ErrorInfo',
                value: PROTO_VALUE_BASE64,
                unknownFields: { fields: {} },
                valueDecoded: { reason: 'TEST', metadata: { retryable: false, attempts: [1, null] } },
              },
            ],
          },
          viewValue: null,
          implementationPackageId: null,
        },
      ],
      witnessParties: ['validator::fingerprint'],
      signatories: ['validator::fingerprint'],
      observers: [],
      createdAt: '2026-07-10T12:00:00.123456789Z',
      packageName: 'splice-wallet',
      representativePackageId: 'package-id',
      acsDelta: false,
    },
  };
}

function createdEventOf(response: Record<string, unknown>): Record<string, unknown> {
  return response['createdEvent'] as Record<string, unknown>;
}

describe('LedgerJsonApiClient contract-by-id', () => {
  it('posts the exact request to the semantic-read endpoint and validates its strict response', async () => {
    const client = createClient();
    const wireResponse = createWireResponse();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue(wireResponse);
    const request = {
      contractId: '00contract-id',
      queryingParties: ['validator::fingerprint'],
    };

    const result = await client.getContractById(request);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      'https://ledger.example.test/v2/contracts/contract-by-id',
      request,
      {
        contentType: 'application/json',
        includeBearerToken: true,
      },
      expect.objectContaining({ requestSemantics: 'read' })
    );
    expect(result.createdEvent).not.toHaveProperty('contractKey');
    expect(result.createdEvent.contractKeyHash).toBe('');
    expect(result.createdEvent.createdEventBlob).toBe('');
    expect(result.createdEvent.createArgument).toEqual(
      expect.objectContaining({ nestedNull: null, values: [1, true, null] })
    );
    expect(result.createdEvent.interfaceViews?.[0]).toEqual(
      expect.objectContaining({
        viewValue: null,
        viewStatus: expect.objectContaining({ code: 0 }),
      })
    );
    expect(result.createdEvent.interfaceViews?.[0]).not.toHaveProperty('implementationPackageId');
  });

  it('preserves omission versus an explicitly empty querying-party list', async () => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue(createWireResponse());

    await client.getContractById({ contractId: '00contract-id' });
    await client.getContractById({ contractId: '00contract-id', queryingParties: [] });

    expect(post.mock.calls[0]?.[1]).toEqual({ contractId: '00contract-id' });
    expect(post.mock.calls[1]?.[1]).toEqual({ contractId: '00contract-id', queryingParties: [] });
  });

  it.each([
    ['an unknown top-level field', (response: Record<string, unknown>) => Object.assign(response, { extra: true })],
    [
      'an unknown CreatedEvent field',
      (response: Record<string, unknown>) => Object.assign(createdEventOf(response), { extra: true }),
    ],
    [
      'non-canonical Base64',
      (response: Record<string, unknown>) => Object.assign(createdEventOf(response), { contractKeyHash: 'AA' }),
    ],
    [
      'a timestamp without a timezone',
      (response: Record<string, unknown>) =>
        Object.assign(createdEventOf(response), { createdAt: '2026-07-10T12:00:00' }),
    ],
    [
      'the synthetic ledger-begin offset',
      (response: Record<string, unknown>) => Object.assign(createdEventOf(response), { offset: 0 }),
    ],
    [
      'an empty witness list',
      (response: Record<string, unknown>) => Object.assign(createdEventOf(response), { witnessParties: [] }),
    ],
    [
      'a lossy Daml JSON value',
      (response: Record<string, unknown>) => Object.assign(createdEventOf(response), { createArgument: { bad: NaN } }),
    ],
  ])('rejects a response containing %s without retrying transport', async (_label, mutate) => {
    const client = createClient();
    const wireResponse = createWireResponse();
    mutate(wireResponse);
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue(wireResponse);

    await expect(
      client.getContractById(
        { contractId: '00contract-id' },
        {
          retry: {
            kind: 'exact-body',
            maxAttempts: 3,
          },
        }
      )
    ).rejects.toBeInstanceOf(ValidationError);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an empty contract ID', { contractId: '' }],
    ['an empty querying party', { contractId: '00contract-id', queryingParties: [''] }],
    ['an unknown request field', { contractId: '00contract-id', unsupported: true }],
  ])('rejects %s before dispatch', async (_label, request) => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue(createWireResponse());

    await expect(client.getContractById(request as never)).rejects.toBeInstanceOf(ValidationError);
    expect(post).not.toHaveBeenCalled();
  });
});
