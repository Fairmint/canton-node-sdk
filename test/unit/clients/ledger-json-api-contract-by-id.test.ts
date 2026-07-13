import { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { CantonRuntime, ContractId, PartyId, ValidationError, type ClientConfig } from '../../../src/core';

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

const CONTRACT_ID_TEXT = `00${'ab'.repeat(32)}`;
const CONTRACT_ID = ContractId(CONTRACT_ID_TEXT);
const QUERYING_PARTY = PartyId('validator::fingerprint');
const PACKAGE_ID = '12'.repeat(32);
const CREATED_EVENT_BLOB_BASE64 = Buffer.from('encoded-created-event').toString('base64');
const CONTRACT_KEY_HASH_BASE64 = Buffer.alloc(32, 1).toString('base64');

function createClient(): LedgerJsonApiClient {
  return new LedgerJsonApiClient(new CantonRuntime(config));
}

function createWireResponse(): Record<string, unknown> {
  return {
    createdEvent: {
      offset: 1,
      nodeId: 0,
      contractId: CONTRACT_ID,
      templateId: `${PACKAGE_ID}:Splice.Wallet.Install:WalletAppInstall`,
      contractKey: null,
      contractKeyHash: '',
      createArgument: {
        validator: 'validator::fingerprint',
        nestedNull: null,
        values: [1, true, null],
      },
      createdEventBlob: CREATED_EVENT_BLOB_BASE64,
      interfaceViews: [],
      witnessParties: [QUERYING_PARTY],
      signatories: [QUERYING_PARTY],
      observers: [],
      createdAt: '2026-07-10T12:00:00.123456789Z',
      packageName: 'splice-wallet',
      representativePackageId: PACKAGE_ID,
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
      contractId: CONTRACT_ID,
      queryingParties: [QUERYING_PARTY],
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
    expect(result.createdEvent.createArgument).toEqual(
      expect.objectContaining({ nestedNull: null, values: [1, true, null] })
    );
    expect(result.createdEvent).not.toHaveProperty('offset');
    expect(result.createdEvent).not.toHaveProperty('nodeId');
    expect(result.createdEvent).not.toHaveProperty('createdEventBlob');
    expect(result.createdEvent).not.toHaveProperty('interfaceViews');
    expect(result.createdEvent).not.toHaveProperty('acsDelta');
  });

  it('preserves a present top-level-null Daml contract key when its hash is non-empty', async () => {
    const client = createClient();
    const wireResponse = createWireResponse();
    Object.assign(createdEventOf(wireResponse), {
      contractKey: null,
      contractKeyHash: CONTRACT_KEY_HASH_BASE64,
    });
    jest.spyOn(client, 'makePostRequest').mockResolvedValue(wireResponse);

    const result = await client.getContractById({ contractId: CONTRACT_ID });

    expect(result.createdEvent).toHaveProperty('contractKey', null);
  });

  it('preserves omission versus an explicitly empty querying-party list', async () => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue(createWireResponse());

    await client.getContractById({ contractId: CONTRACT_ID });
    await client.getContractById({ contractId: CONTRACT_ID, queryingParties: [] });

    expect(post.mock.calls[0]?.[1]).toEqual({ contractId: CONTRACT_ID });
    expect(post.mock.calls[1]?.[1]).toEqual({ contractId: CONTRACT_ID, queryingParties: [] });
  });

  it('drops documented unusable event fields without assigning semantics to their placeholder values', async () => {
    const client = createClient();
    const wireResponse = createWireResponse();
    Object.assign(createdEventOf(wireResponse), {
      offset: 2,
      nodeId: 1,
      acsDelta: true,
      createdEventBlob: '',
      interfaceViews: [
        {
          interfaceId: `${PACKAGE_ID}:Module:Interface`,
          viewStatus: { code: 0, message: '', details: [] },
          viewValue: { owner: QUERYING_PARTY },
          implementationPackageId: null,
        },
      ],
    });
    jest.spyOn(client, 'makePostRequest').mockResolvedValue(wireResponse);

    const result = await client.getContractById({ contractId: CONTRACT_ID });

    expect(result.createdEvent).not.toHaveProperty('offset');
    expect(result.createdEvent).not.toHaveProperty('nodeId');
    expect(result.createdEvent).not.toHaveProperty('createdEventBlob');
    expect(result.createdEvent).not.toHaveProperty('interfaceViews');
    expect(result.createdEvent).not.toHaveProperty('acsDelta');
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
      'a non-empty contract-key hash that is not 32 bytes',
      (response: Record<string, unknown>) => Object.assign(createdEventOf(response), { contractKeyHash: 'AA==' }),
    ],
    [
      'a timestamp without a timezone',
      (response: Record<string, unknown>) =>
        Object.assign(createdEventOf(response), { createdAt: '2026-07-10T12:00:00' }),
    ],
    [
      'an invalid template identifier',
      (response: Record<string, unknown>) =>
        Object.assign(createdEventOf(response), { templateId: 'package:Module:T' }),
    ],
    [
      'a representative package inconsistent with the template',
      (response: Record<string, unknown>) =>
        Object.assign(createdEventOf(response), { representativePackageId: '34'.repeat(32) }),
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
        { contractId: CONTRACT_ID },
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
    [
      'a contract ID different from the successful request',
      (response: Record<string, unknown>) =>
        Object.assign(createdEventOf(response), { contractId: ContractId(`00${'cd'.repeat(32)}`) }),
    ],
    [
      'a witness outside the non-empty querying-party set',
      (response: Record<string, unknown>) =>
        Object.assign(createdEventOf(response), { witnessParties: [PartyId('other::fingerprint')] }),
    ],
    [
      'a witness that is not a contract stakeholder',
      (response: Record<string, unknown>) =>
        Object.assign(createdEventOf(response), {
          signatories: [PartyId('other::fingerprint')],
          observers: [],
        }),
    ],
  ])('rejects %s', async (_label, mutate) => {
    const client = createClient();
    const wireResponse = createWireResponse();
    mutate(wireResponse);
    jest.spyOn(client, 'makePostRequest').mockResolvedValue(wireResponse);

    await expect(
      client.getContractById({ contractId: CONTRACT_ID, queryingParties: [QUERYING_PARTY] })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it.each([
    ['an empty contract ID', { contractId: '' }],
    ['a non-hex contract ID', { contractId: '00contract-id' }],
    ['an uppercase contract ID', { contractId: CONTRACT_ID_TEXT.toUpperCase() }],
    ['a V1 contract ID with an odd-length suffix', { contractId: `${CONTRACT_ID_TEXT}a` }],
    ['a V1 contract ID with an oversized suffix', { contractId: `${CONTRACT_ID_TEXT}${'aa'.repeat(95)}` }],
    ['a V2 contract ID with an oversized suffix', { contractId: `01${'22'.repeat(12)}${'aa'.repeat(34)}` }],
    ['an empty querying party', { contractId: CONTRACT_ID, queryingParties: [''] }],
    ['a querying party containing a newline', { contractId: CONTRACT_ID, queryingParties: ['bad\nparty'] }],
    ['an overlong querying party', { contractId: CONTRACT_ID, queryingParties: ['p'.repeat(256)] }],
    ['an unknown request field', { contractId: CONTRACT_ID, unsupported: true }],
  ])('rejects %s before dispatch', async (_label, request) => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue(createWireResponse());

    await expect(client.getContractById(request as never)).rejects.toBeInstanceOf(ValidationError);
    expect(post).not.toHaveBeenCalled();
  });
});
