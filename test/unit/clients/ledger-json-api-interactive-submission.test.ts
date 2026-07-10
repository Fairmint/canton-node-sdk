import { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import type {
  InteractiveSubmissionExecuteAndWaitForTransactionRequest,
  InteractiveSubmissionExecuteAndWaitRequest,
  InteractiveSubmissionPrepareRequest,
} from '../../../src/clients/ledger-json-api/schemas/api/interactive-submission';
import { CantonRuntime, type ClientConfig } from '../../../src/core';

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

const PREPARED_TRANSACTION_BASE64 = Buffer.from('prepared-transaction').toString('base64');
const PREPARED_HASH_BASE64 = Buffer.from(`1220${'11'.repeat(32)}`, 'hex').toString('base64');
const SIGNATURE_BASE64 = Buffer.alloc(64, 1).toString('base64');
const PROTO_VALUE_BASE64 = Buffer.from('encoded-protobuf').toString('base64');
const EXTERNAL_TRANSACTION_HASH = `1220${'ab'.repeat(32)}`;

function createClient(): LedgerJsonApiClient {
  return new LedgerJsonApiClient(new CantonRuntime(config));
}

function createExecuteAndWaitRequest(): InteractiveSubmissionExecuteAndWaitRequest {
  return {
    preparedTransaction: PREPARED_TRANSACTION_BASE64,
    partySignatures: {
      signatures: [
        {
          party: 'party::fingerprint',
          signatures: [
            {
              format: 'SIGNATURE_FORMAT_RAW',
              signature: SIGNATURE_BASE64,
              signedBy: 'fingerprint',
              signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_ED25519',
            },
          ],
        },
      ],
    },
    submissionId: 'submission-1',
    hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V3',
    deduplicationPeriod: {
      DeduplicationOffset: { value: 42 },
    },
    minLedgerTime: {
      time: {
        MinLedgerTimeRel: {
          value: { seconds: 5, nanos: 0 },
        },
      },
    },
  };
}

function createPrepareRequest(): InteractiveSubmissionPrepareRequest {
  return {
    commandId: 'command-1',
    commands: [{ CreateCommand: { templateId: 'pkg:Module:Template', createArguments: { owner: 'Alice' } } }],
    actAs: ['Alice::fingerprint'],
  };
}

function createWireTransactionResponse(transactionOffset = 124, eventOffset = 124): Record<string, unknown> {
  return {
    transaction: {
      updateId: 'update-2',
      effectiveAt: '2026-07-09T12:00:00Z',
      events: [
        {
          CreatedEvent: {
            offset: eventOffset,
            nodeId: 0,
            contractId: 'contract-1',
            templateId: 'pkg:Module:Template',
            contractKey: null,
            contractKeyHash: '',
            createArgument: { owner: 'party::fingerprint' },
            createdEventBlob: '',
            interfaceViews: [
              {
                interfaceId: 'pkg:Module:Interface',
                viewStatus: {
                  code: 0,
                  message: '',
                  details: [
                    {
                      typeUrl: 'type.googleapis.com/google.rpc.ErrorInfo',
                      value: PROTO_VALUE_BASE64,
                      unknownFields: { fields: {} },
                      valueDecoded: {
                        reason: 'TEST_REASON',
                        metadata: {
                          retryable: false,
                          attempts: [1, 2, null],
                        },
                      },
                    },
                  ],
                },
                viewValue: null,
                implementationPackageId: null,
              },
            ],
            witnessParties: ['party::fingerprint'],
            signatories: ['party::fingerprint'],
            createdAt: '2026-07-09T12:00:00Z',
            packageName: 'package-name',
            representativePackageId: 'package-id',
            acsDelta: true,
          },
        },
        {
          ExercisedEvent: {
            offset: eventOffset,
            nodeId: 1,
            contractId: 'contract-2',
            templateId: 'pkg:Module:Template',
            interfaceId: null,
            choice: 'Archive',
            choiceArgument: {},
            actingParties: ['party::fingerprint'],
            consuming: true,
            witnessParties: ['party::fingerprint'],
            lastDescendantNodeId: 1,
            exerciseResult: {},
            packageName: 'package-name',
            acsDelta: true,
          },
        },
      ],
      offset: transactionOffset,
      synchronizerId: 'synchronizer::id',
      traceContext: null,
      recordTime: '2026-07-09T12:00:01Z',
      externalTransactionHash: null,
      paidTrafficCost: null,
    },
  };
}

function firstProtoAny(response: Record<string, unknown>): { value: string } {
  const transaction = response['transaction'] as { events: unknown[] };
  const createdEvent = transaction.events[0] as {
    CreatedEvent: { interfaceViews: Array<{ viewStatus: { details: Array<{ value: string }> } }> };
  };
  const interfaceView = createdEvent.CreatedEvent.interfaceViews[0];
  const detail = interfaceView?.viewStatus.details[0];
  if (!detail) throw new Error('Test fixture did not include a protobuf Any detail');
  return detail;
}

const cyclicJsonValue: Record<string, unknown> = {};
cyclicJsonValue['self'] = cyclicJsonValue;

describe('LedgerJsonApiClient interactive submission execution', () => {
  it('posts and validates the exact current prepare contract, including V3 fields', async () => {
    const client = createClient();
    const response = {
      preparedTransaction: PREPARED_TRANSACTION_BASE64,
      preparedTransactionHash: PREPARED_HASH_BASE64,
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V3' as const,
      costEstimation: {
        estimationTimestamp: '2026-07-09T12:00:00Z',
        confirmationRequestTrafficCostEstimation: 100,
        confirmationResponseTrafficCostEstimation: 25,
        totalTrafficCostEstimation: 125,
      },
    };
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue(response);
    const request: InteractiveSubmissionPrepareRequest = {
      commandId: 'command-1',
      commands: [{ CreateCommand: { templateId: 'pkg:Module:Template', createArguments: { owner: 'Alice' } } }],
      minLedgerTime: {
        time: { MinLedgerTimeAbs: { value: '2026-07-09T12:00:00Z' } },
      },
      actAs: ['Alice::fingerprint'],
      packageIdSelectionPreference: ['package-id-1'],
      prefetchContractKeys: [{ templateId: 'pkg:Module:Template', contractKey: { owner: 'Alice' }, limit: 1 }],
      maxRecordTime: '2026-07-09T12:05:00Z',
      estimateTrafficCost: {
        expectedSignatures: ['SIGNING_ALGORITHM_SPEC_ED25519' as const],
      },
      tapsMaxPasses: 2,
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V3' as const,
    };

    await expect(client.interactiveSubmissionPrepare(request)).resolves.toEqual(response);

    expect(post).toHaveBeenCalledWith(
      'https://ledger.example.test/v2/interactive-submission/prepare',
      { ...request, synchronizerId: '' },
      {
        contentType: 'application/json',
        includeBearerToken: true,
      },
      expect.objectContaining({ requestSemantics: 'read' })
    );
  });

  it('accepts wire-null optional prepare fields and normalizes them to omitted properties', async () => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({
      preparedTransaction: PREPARED_TRANSACTION_BASE64,
      preparedTransactionHash: PREPARED_HASH_BASE64,
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
      hashingDetails: null,
      costEstimation: null,
    });

    const result = await client.interactiveSubmissionPrepare(createPrepareRequest());

    expect(result).toEqual({
      preparedTransaction: PREPARED_TRANSACTION_BASE64,
      preparedTransactionHash: PREPARED_HASH_BASE64,
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
    });
    expect(post.mock.calls[0]?.[1]).toEqual({
      ...createPrepareRequest(),
      synchronizerId: '',
      packageIdSelectionPreference: [],
    });
  });

  it('materializes the required empty expected-signatures wire default for cost-estimation hints', async () => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({
      preparedTransaction: PREPARED_TRANSACTION_BASE64,
      preparedTransactionHash: PREPARED_HASH_BASE64,
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
    });
    const request: InteractiveSubmissionPrepareRequest = {
      ...createPrepareRequest(),
      estimateTrafficCost: { disabled: true },
    };

    await client.interactiveSubmissionPrepare(request);

    expect(post.mock.calls[0]?.[1]).toEqual({
      ...request,
      synchronizerId: '',
      packageIdSelectionPreference: [],
      estimateTrafficCost: {
        disabled: true,
        expectedSignatures: [],
      },
    });
  });

  it('snapshots nested Daml JSON values before asynchronous request construction', async () => {
    const client = createClient();
    const createArguments = { owner: { name: 'Alice' } };
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({
      preparedTransaction: PREPARED_TRANSACTION_BASE64,
      preparedTransactionHash: PREPARED_HASH_BASE64,
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
    });

    const pending = client.interactiveSubmissionPrepare({
      ...createPrepareRequest(),
      commands: [{ CreateCommand: { templateId: 'pkg:Module:Template', createArguments } }],
    });
    createArguments.owner.name = 'Mallory';
    await pending;

    expect(post.mock.calls[0]?.[1]).toHaveProperty('commands.0.CreateCommand.createArguments.owner.name', 'Alice');
  });

  it('posts asynchronous execute to the exact route and validates the empty response', async () => {
    const client = createClient();
    const response = {};
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue(response);
    const request = createExecuteAndWaitRequest();
    delete request.deduplicationPeriod;

    await expect(client.interactiveSubmissionExecute(request)).resolves.toEqual(response);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      'https://ledger.example.test/v2/interactive-submission/execute',
      { ...request, deduplicationPeriod: { Empty: {} } },
      {
        contentType: 'application/json',
        includeBearerToken: true,
      }
    );
  });

  it('posts executeAndWait to the exact case-sensitive route and returns its typed response', async () => {
    const client = createClient();
    const response = { updateId: 'update-1', completionOffset: 123 };
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue(response);
    const request = createExecuteAndWaitRequest();
    delete request.deduplicationPeriod;

    await expect(client.interactiveSubmissionExecuteAndWait(request)).resolves.toEqual(response);

    expect(post).toHaveBeenCalledWith(
      'https://ledger.example.test/v2/interactive-submission/executeAndWait',
      { ...request, deduplicationPeriod: { Empty: {} } },
      {
        contentType: 'application/json',
        includeBearerToken: true,
      }
    );
  });

  it('posts executeAndWaitForTransaction with a generated-contract transaction format', async () => {
    const client = createClient();
    const response = {
      transaction: {
        updateId: 'update-2',
        effectiveAt: '2026-07-09T12:00:00Z',
        events: [
          {
            ArchivedEvent: {
              offset: 124,
              nodeId: 0,
              contractId: 'contract-1',
              templateId: 'pkg:Module:Template',
              witnessParties: ['party::fingerprint'],
              packageName: 'package-name',
            },
          },
        ],
        offset: 124,
        synchronizerId: 'synchronizer::id',
        recordTime: '2026-07-09T12:00:01Z',
      },
    };
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue(response);
    const request: InteractiveSubmissionExecuteAndWaitForTransactionRequest = {
      ...createExecuteAndWaitRequest(),
      transactionFormat: {
        eventFormat: {
          filtersByParty: {
            'party::fingerprint': {
              cumulative: [
                {
                  identifierFilter: {
                    WildcardFilter: {
                      value: { includeCreatedEventBlob: true },
                    },
                  },
                },
              ],
            },
          },
          verbose: true,
        },
        transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
      },
    };
    delete request.deduplicationPeriod;

    await expect(client.interactiveSubmissionExecuteAndWaitForTransaction(request)).resolves.toEqual(response);

    expect(post).toHaveBeenCalledWith(
      'https://ledger.example.test/v2/interactive-submission/executeAndWaitForTransaction',
      { ...request, deduplicationPeriod: { Empty: {} } },
      {
        contentType: 'application/json',
        includeBearerToken: true,
      }
    );
  });

  it('preserves JSON null values while omitting wire-null optional metadata', async () => {
    const client = createClient();
    jest.spyOn(client, 'makePostRequest').mockResolvedValue(createWireTransactionResponse());

    const result = await client.interactiveSubmissionExecuteAndWaitForTransaction(createExecuteAndWaitRequest());

    expect(result.transaction).not.toHaveProperty('traceContext');
    expect(result.transaction).not.toHaveProperty('externalTransactionHash');
    expect(result.transaction).not.toHaveProperty('paidTrafficCost');
    expect(result.transaction.events[0]).not.toHaveProperty('CreatedEvent.contractKey');
    expect(result.transaction.events[0]).toHaveProperty('CreatedEvent.contractKeyHash', '');
    expect(result.transaction.events[0]).toHaveProperty('CreatedEvent.createdEventBlob', '');
    expect(result.transaction.events[0]).toHaveProperty('CreatedEvent.interfaceViews.0.viewValue', null);
    expect(result.transaction.events[0]).toHaveProperty(
      'CreatedEvent.interfaceViews.0.viewStatus.details.0.valueDecoded',
      {
        reason: 'TEST_REASON',
        metadata: {
          retryable: false,
          attempts: [1, 2, null],
        },
      }
    );
    expect(result.transaction.events[0]).not.toHaveProperty('CreatedEvent.interfaceViews.0.implementationPackageId');
    expect(result.transaction.events[1]).not.toHaveProperty('ExercisedEvent.interfaceId');
  });

  it('omits JSON-valued transaction fields only when they are absent on the wire', async () => {
    const client = createClient();
    const response = createWireTransactionResponse();
    const transaction = response['transaction'] as { events: unknown[] };
    const createdEvent = transaction.events[0] as {
      CreatedEvent: {
        contractKey?: unknown;
        interfaceViews?: Array<{ viewValue?: unknown }>;
      };
    };
    delete createdEvent.CreatedEvent.contractKey;
    const interfaceView = createdEvent.CreatedEvent.interfaceViews?.[0];
    if (interfaceView) delete interfaceView.viewValue;
    jest.spyOn(client, 'makePostRequest').mockResolvedValue(response);

    const result = await client.interactiveSubmissionExecuteAndWaitForTransaction(createExecuteAndWaitRequest());

    expect(result.transaction.events[0]).not.toHaveProperty('CreatedEvent.contractKey');
    expect(result.transaction.events[0]).not.toHaveProperty('CreatedEvent.interfaceViews.0.viewValue');
  });

  it('normalizes explicit undefined optional fields before sending JSON', async () => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({
      updateId: 'update-3',
      completionOffset: 125,
    });
    const request = {
      ...createExecuteAndWaitRequest(),
      userId: undefined,
      minLedgerTime: undefined,
    } as unknown as InteractiveSubmissionExecuteAndWaitRequest;

    await client.interactiveSubmissionExecuteAndWait(request);

    const sentBody = post.mock.calls[0]?.[1];
    expect(sentBody).not.toHaveProperty('userId');
    expect(sentBody).not.toHaveProperty('minLedgerTime');
  });

  it('accepts zero as a deduplication offset', async () => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({
      updateId: 'update-3',
      completionOffset: 1,
    });
    const request = createExecuteAndWaitRequest();
    request.deduplicationPeriod = { DeduplicationOffset: { value: 0 } };

    await client.interactiveSubmissionExecuteAndWait(request);

    expect(post).toHaveBeenCalled();
  });

  it.each([
    ['maximum positive duration', { seconds: 315_576_000_000, nanos: 999_999_999 }],
    ['maximum negative duration', { seconds: -315_576_000_000, nanos: -999_999_999 }],
    ['negative nanos with zero seconds', { seconds: 0, nanos: -999_999_999 }],
  ])('accepts the protobuf %s boundary', async (_description, duration) => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({
      updateId: 'update-duration',
      completionOffset: 1,
    });
    const request = createExecuteAndWaitRequest();
    request.minLedgerTime = {
      time: {
        MinLedgerTimeRel: { value: duration },
      },
    };

    await client.interactiveSubmissionExecuteAndWait(request);

    expect(post).toHaveBeenCalled();
  });

  it('accepts the largest safe numeric Ledger offset', async () => {
    const client = createClient();
    jest.spyOn(client, 'makePostRequest').mockResolvedValue({
      updateId: 'update-safe-int',
      completionOffset: Number.MAX_SAFE_INTEGER,
    });

    await expect(client.interactiveSubmissionExecuteAndWait(createExecuteAndWaitRequest())).resolves.toEqual({
      updateId: 'update-safe-int',
      completionOffset: Number.MAX_SAFE_INTEGER,
    });
  });

  it.each([
    ['missing update id', { completionOffset: 125 }],
    ['non-integer completion offset', { updateId: 'update-3', completionOffset: 1.5 }],
    ['zero completion offset', { updateId: 'update-3', completionOffset: 0 }],
    ['unsafe completion offset', { updateId: 'update-3', completionOffset: Number.MAX_SAFE_INTEGER + 1 }],
  ])('rejects an executeAndWait response with %s', async (_description, response) => {
    const client = createClient();
    jest.spyOn(client, 'makePostRequest').mockResolvedValue(response);

    await expect(client.interactiveSubmissionExecuteAndWait(createExecuteAndWaitRequest())).rejects.toThrow(
      'Response validation failed'
    );
  });

  it('rejects fabricated fields in the asynchronous execute response', async () => {
    const client = createClient();
    jest.spyOn(client, 'makePostRequest').mockResolvedValue({ updateId: 'not-in-contract' });

    await expect(client.interactiveSubmissionExecute(createExecuteAndWaitRequest())).rejects.toThrow(
      'Response validation failed'
    );
  });

  it('rejects a transaction response missing required generated fields', async () => {
    const client = createClient();
    jest.spyOn(client, 'makePostRequest').mockResolvedValue({
      transaction: {
        updateId: 'update-4',
        effectiveAt: '2026-07-09T12:00:00Z',
        events: [],
        offset: 126,
        recordTime: '2026-07-09T12:00:01Z',
      },
    });

    await expect(
      client.interactiveSubmissionExecuteAndWaitForTransaction(createExecuteAndWaitRequest())
    ).rejects.toThrow('Response validation failed');
  });

  it('accepts a filtered transaction response with an empty event list', async () => {
    const client = createClient();
    const response = createWireTransactionResponse() as { transaction: { events: unknown[] } };
    response.transaction.events = [];
    jest.spyOn(client, 'makePostRequest').mockResolvedValue(response);

    const result = await client.interactiveSubmissionExecuteAndWaitForTransaction(createExecuteAndWaitRequest());

    expect(result.transaction.events).toEqual([]);
  });

  it('accepts empty protobuf Any bytes while preserving decoded JSON nulls', async () => {
    const client = createClient();
    const response = createWireTransactionResponse();
    firstProtoAny(response).value = '';
    jest.spyOn(client, 'makePostRequest').mockResolvedValue(response);

    const result = await client.interactiveSubmissionExecuteAndWaitForTransaction(createExecuteAndWaitRequest());

    expect(result.transaction.events[0]).toHaveProperty('CreatedEvent.interfaceViews.0.viewStatus.details.0.value', '');
  });

  it.each([
    ['created-event time', 'createdAt', '2026-07-09 12:00:00'],
    ['created-event blob Base64', 'createdEventBlob', 'not base64!'],
    ['contract-key hash Base64', 'contractKeyHash', 'not base64!'],
  ])('rejects a transaction response with invalid %s', async (_description, field, value) => {
    const client = createClient();
    const response = createWireTransactionResponse();
    const transaction = response['transaction'] as { events: unknown[] };
    const createdEvent = transaction.events[0] as { CreatedEvent: Record<string, unknown> };
    createdEvent.CreatedEvent[field] = value;
    jest.spyOn(client, 'makePostRequest').mockResolvedValue(response);

    await expect(
      client.interactiveSubmissionExecuteAndWaitForTransaction(createExecuteAndWaitRequest())
    ).rejects.toThrow('Response validation failed');
  });

  it('rejects malformed protobuf Any Base64 in a transaction response', async () => {
    const client = createClient();
    const response = createWireTransactionResponse();
    firstProtoAny(response).value = 'not base64!';
    jest.spyOn(client, 'makePostRequest').mockResolvedValue(response);

    await expect(
      client.interactiveSubmissionExecuteAndWaitForTransaction(createExecuteAndWaitRequest())
    ).rejects.toThrow('Response validation failed');
  });

  it.each([
    ['zero transaction offset', createWireTransactionResponse(0, 124)],
    ['zero event offset', createWireTransactionResponse(124, 0)],
  ])('rejects a transaction response with %s', async (_description, response) => {
    const client = createClient();
    jest.spyOn(client, 'makePostRequest').mockResolvedValue(response);

    await expect(
      client.interactiveSubmissionExecuteAndWaitForTransaction(createExecuteAndWaitRequest())
    ).rejects.toThrow('Response validation failed');
  });

  it.each([
    ['effective time', 'effectiveAt'],
    ['record time', 'recordTime'],
  ])('rejects a transaction response with a non-RFC3339 %s', async (_description, field) => {
    const client = createClient();
    const response = createWireTransactionResponse();
    const transaction = response['transaction'] as Record<string, unknown>;
    transaction[field] = '2026-07-09 12:00:00';
    jest.spyOn(client, 'makePostRequest').mockResolvedValue(response);

    await expect(
      client.interactiveSubmissionExecuteAndWaitForTransaction(createExecuteAndWaitRequest())
    ).rejects.toThrow('Response validation failed');
  });

  it.each([
    ['a malformed hash', 'not-a-canton-hash'],
    ['an uppercase hash', EXTERNAL_TRANSACTION_HASH.toUpperCase()],
  ])('rejects a transaction response with %s', async (_description, externalTransactionHash) => {
    const client = createClient();
    const response = createWireTransactionResponse();
    const transaction = response['transaction'] as Record<string, unknown>;
    transaction['externalTransactionHash'] = externalTransactionHash;
    jest.spyOn(client, 'makePostRequest').mockResolvedValue(response);

    await expect(
      client.interactiveSubmissionExecuteAndWaitForTransaction(createExecuteAndWaitRequest())
    ).rejects.toThrow('Response validation failed');
  });

  it.each([
    ['prepared transaction', { preparedTransaction: 'not base64!' }],
    ['prepared transaction hash', { preparedTransactionHash: 'not base64!' }],
    [
      'cost-estimation timestamp',
      {
        costEstimation: {
          estimationTimestamp: '2026-07-09 12:00:00',
          confirmationRequestTrafficCostEstimation: 100,
          confirmationResponseTrafficCostEstimation: 25,
          totalTrafficCostEstimation: 125,
        },
      },
    ],
  ])('rejects a prepare response with an invalid %s', async (_description, override) => {
    const client = createClient();
    jest.spyOn(client, 'makePostRequest').mockResolvedValue({
      preparedTransaction: PREPARED_TRANSACTION_BASE64,
      preparedTransactionHash: PREPARED_HASH_BASE64,
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V3',
      ...override,
    });

    await expect(client.interactiveSubmissionPrepare(createPrepareRequest())).rejects.toThrow(
      'Response validation failed'
    );
  });

  it('rejects a prepare response that omits required transaction data', async () => {
    const client = createClient();
    jest.spyOn(client, 'makePostRequest').mockResolvedValue({
      preparedTransactionHash: PREPARED_HASH_BASE64,
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V3',
    });

    await expect(
      client.interactiveSubmissionPrepare({
        commandId: 'command-2',
        commands: [{ CreateCommand: { templateId: 'pkg:Module:Template', createArguments: {} } }],
        actAs: ['Alice::fingerprint'],
      })
    ).rejects.toThrow('Response validation failed');
  });

  it.each([
    ['zero TAPS passes', 0],
    ['negative TAPS passes', -1],
    ['fractional TAPS passes', 1.5],
    ['overflowing TAPS passes', 2_147_483_648],
  ])('rejects prepare requests with %s', async (_description, tapsMaxPasses) => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest');

    await expect(client.interactiveSubmissionPrepare({ ...createPrepareRequest(), tapsMaxPasses })).rejects.toThrow(
      'Parameter validation failed'
    );
    expect(post).not.toHaveBeenCalled();
  });

  it.each([
    ['zero prefetch limit', 0],
    ['fractional prefetch limit', 1.5],
    ['overflowing prefetch limit', 2_147_483_648],
  ])('rejects prepare requests with %s', async (_description, limit) => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest');

    await expect(
      client.interactiveSubmissionPrepare({
        ...createPrepareRequest(),
        prefetchContractKeys: [{ templateId: 'pkg:Module:Template', contractKey: { owner: 'Alice' }, limit }],
      })
    ).rejects.toThrow('Parameter validation failed');
    expect(post).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty command list', { ...createPrepareRequest(), commands: [] }],
    ['an empty command ID', { ...createPrepareRequest(), commandId: '' }],
    ['an invalid command ID', { ...createPrepareRequest(), commandId: 'invalid@command' }],
    [
      'an empty template ID',
      {
        ...createPrepareRequest(),
        commands: [{ CreateCommand: { templateId: '', createArguments: {} } }],
      },
    ],
    [
      'an empty contract ID',
      {
        ...createPrepareRequest(),
        commands: [
          {
            ExerciseCommand: {
              templateId: 'pkg:Module:Template',
              contractId: '',
              choice: 'Archive',
              choiceArgument: {},
            },
          },
        ],
      },
    ],
    [
      'an empty choice name',
      {
        ...createPrepareRequest(),
        commands: [
          {
            ExerciseCommand: {
              templateId: 'pkg:Module:Template',
              contractId: 'contract-id',
              choice: '',
              choiceArgument: {},
            },
          },
        ],
      },
    ],
    [
      'an invalid choice name',
      {
        ...createPrepareRequest(),
        commands: [
          {
            ExerciseCommand: {
              templateId: 'pkg:Module:Template',
              contractId: 'contract-id',
              choice: 'Archive-Now',
              choiceArgument: {},
            },
          },
        ],
      },
    ],
    [
      'more than one command',
      {
        ...createPrepareRequest(),
        commands: [
          { CreateCommand: { templateId: 'pkg:Module:Template', createArguments: {} } },
          { CreateCommand: { templateId: 'pkg:Module:Template', createArguments: {} } },
        ],
      },
    ],
    ['an empty actAs list', { ...createPrepareRequest(), actAs: [] }],
    [
      'the unspecified hashing scheme sentinel',
      { ...createPrepareRequest(), hashingSchemeVersion: 'HASHING_SCHEME_VERSION_UNSPECIFIED' },
    ],
    [
      'the unspecified cost-estimation signing algorithm',
      {
        ...createPrepareRequest(),
        estimateTrafficCost: { expectedSignatures: ['SIGNING_ALGORITHM_SPEC_UNSPECIFIED'] },
      },
    ],
    [
      'a non-RFC3339 absolute minimum ledger time',
      {
        ...createPrepareRequest(),
        minLedgerTime: { time: { MinLedgerTimeAbs: { value: '2026-07-09 12:00:00' } } },
      },
    ],
    [
      'an absolute minimum ledger time without seconds',
      {
        ...createPrepareRequest(),
        minLedgerTime: { time: { MinLedgerTimeAbs: { value: '2026-07-09T12:00Z' } } },
      },
    ],
    [
      'an absolute minimum ledger time with excessive fractional precision',
      {
        ...createPrepareRequest(),
        minLedgerTime: { time: { MinLedgerTimeAbs: { value: '2026-07-09T12:00:00.1234567890Z' } } },
      },
    ],
    ['a non-RFC3339 maximum record time', { ...createPrepareRequest(), maxRecordTime: '2026-07-09 12:05:00' }],
    [
      'a malformed disclosed-contract blob',
      {
        ...createPrepareRequest(),
        disclosedContracts: [{ createdEventBlob: 'not base64!' }],
      },
    ],
  ])('rejects prepare requests with %s', async (_description, request) => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest');

    await expect(
      client.interactiveSubmissionPrepare(request as unknown as InteractiveSubmissionPrepareRequest)
    ).rejects.toThrow('Parameter validation failed');
    expect(post).not.toHaveBeenCalled();
  });

  it('rejects lossy JSON values in transaction event payloads', async () => {
    const client = createClient();
    const response = createWireTransactionResponse();
    const transaction = response['transaction'] as { events: unknown[] };
    const exercisedEvent = transaction.events[1] as { ExercisedEvent: { exerciseResult?: unknown } };
    exercisedEvent.ExercisedEvent.exerciseResult = -0;
    jest.spyOn(client, 'makePostRequest').mockResolvedValue(response);

    await expect(
      client.interactiveSubmissionExecuteAndWaitForTransaction(createExecuteAndWaitRequest())
    ).rejects.toThrow('Response validation failed');
  });

  it.each([
    ['nested undefined', { nested: { invalid: undefined } }],
    ['a bigint', { invalid: 1n }],
    ['a function', { invalid: () => undefined }],
    ['NaN', { invalid: Number.NaN }],
    ['negative zero', -0],
    ['a circular reference', cyclicJsonValue],
  ])('rejects command arguments containing %s', async (_description, createArguments) => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest');

    await expect(
      client.interactiveSubmissionPrepare({
        ...createPrepareRequest(),
        commands: [{ CreateCommand: { templateId: 'pkg:Module:Template', createArguments } }],
      } as unknown as InteractiveSubmissionPrepareRequest)
    ).rejects.toThrow('Parameter validation failed');
    expect(post).not.toHaveBeenCalled();
  });

  it('rejects lossy JSON values in prefetched contract keys', async () => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest');

    await expect(
      client.interactiveSubmissionPrepare({
        ...createPrepareRequest(),
        prefetchContractKeys: [
          {
            templateId: 'pkg:Module:Template',
            contractKey: { invalid: () => undefined },
          },
        ],
      } as unknown as InteractiveSubmissionPrepareRequest)
    ).rejects.toThrow('Parameter validation failed');
    expect(post).not.toHaveBeenCalled();
  });

  it('rejects request one-of values containing multiple branches', async () => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest');

    await expect(
      client.interactiveSubmissionPrepare({
        ...createPrepareRequest(),
        commands: [
          {
            CreateCommand: { templateId: 'pkg:Module:Template', createArguments: {} },
            ExerciseCommand: {
              templateId: 'pkg:Module:Template',
              contractId: 'contract-id',
              choice: 'Archive',
              choiceArgument: {},
            },
          },
        ],
      } as unknown as InteractiveSubmissionPrepareRequest)
    ).rejects.toThrow('Parameter validation failed');
    await expect(
      client.interactiveSubmissionExecuteAndWait({
        ...createExecuteAndWaitRequest(),
        deduplicationPeriod: {
          DeduplicationOffset: { value: 42 },
          Empty: {},
        },
      } as unknown as InteractiveSubmissionExecuteAndWaitRequest)
    ).rejects.toThrow('Parameter validation failed');
    expect(post).not.toHaveBeenCalled();
  });

  it.each([
    [
      'unknown top-level fields',
      { ...createExecuteAndWaitRequest(), typo: true } as unknown as InteractiveSubmissionExecuteAndWaitRequest,
    ],
    [
      'string deduplication offsets',
      {
        ...createExecuteAndWaitRequest(),
        deduplicationPeriod: { DeduplicationOffset: { value: '42' } },
      } as unknown as InteractiveSubmissionExecuteAndWaitRequest,
    ],
    [
      'negative deduplication offsets',
      {
        ...createExecuteAndWaitRequest(),
        deduplicationPeriod: { DeduplicationOffset: { value: -1 } },
      } as unknown as InteractiveSubmissionExecuteAndWaitRequest,
    ],
    [
      'fractional deduplication offsets',
      {
        ...createExecuteAndWaitRequest(),
        deduplicationPeriod: { DeduplicationOffset: { value: 1.5 } },
      } as unknown as InteractiveSubmissionExecuteAndWaitRequest,
    ],
    [
      'unsafe deduplication offsets',
      {
        ...createExecuteAndWaitRequest(),
        deduplicationPeriod: { DeduplicationOffset: { value: Number.MAX_SAFE_INTEGER + 1 } },
      } as unknown as InteractiveSubmissionExecuteAndWaitRequest,
    ],
    [
      'negative deduplication duration seconds',
      {
        ...createExecuteAndWaitRequest(),
        deduplicationPeriod: { DeduplicationDuration: { value: { seconds: -1, nanos: 0 } } },
      } as unknown as InteractiveSubmissionExecuteAndWaitRequest,
    ],
    [
      'negative deduplication duration nanos',
      {
        ...createExecuteAndWaitRequest(),
        deduplicationPeriod: { DeduplicationDuration: { value: { seconds: 0, nanos: -1 } } },
      } as unknown as InteractiveSubmissionExecuteAndWaitRequest,
    ],
    [
      'malformed prepared transaction Base64',
      {
        ...createExecuteAndWaitRequest(),
        preparedTransaction: 'not base64!',
      } as unknown as InteractiveSubmissionExecuteAndWaitRequest,
    ],
    [
      'base64url prepared transaction bytes',
      {
        ...createExecuteAndWaitRequest(),
        preparedTransaction: '-_8=',
      } as unknown as InteractiveSubmissionExecuteAndWaitRequest,
    ],
    [
      'unpadded prepared transaction Base64',
      {
        ...createExecuteAndWaitRequest(),
        preparedTransaction: 'YWJjZA',
      } as unknown as InteractiveSubmissionExecuteAndWaitRequest,
    ],
    [
      'noncanonical prepared transaction Base64 padding',
      {
        ...createExecuteAndWaitRequest(),
        preparedTransaction: 'YQ====',
      } as unknown as InteractiveSubmissionExecuteAndWaitRequest,
    ],
    [
      'malformed signature Base64',
      {
        ...createExecuteAndWaitRequest(),
        partySignatures: {
          signatures: [
            {
              ...createExecuteAndWaitRequest().partySignatures.signatures[0],
              signatures: [
                {
                  ...createExecuteAndWaitRequest().partySignatures.signatures[0].signatures[0],
                  signature: 'not base64!',
                },
              ],
            },
          ],
        },
      } as unknown as InteractiveSubmissionExecuteAndWaitRequest,
    ],
    [
      'a non-RFC3339 absolute minimum ledger time',
      {
        ...createExecuteAndWaitRequest(),
        minLedgerTime: { time: { MinLedgerTimeAbs: { value: '2026-07-09 12:00:00' } } },
      } as unknown as InteractiveSubmissionExecuteAndWaitRequest,
    ],
    [
      'an empty submission ID',
      {
        ...createExecuteAndWaitRequest(),
        submissionId: '',
      } as unknown as InteractiveSubmissionExecuteAndWaitRequest,
    ],
    [
      'empty party signature collections',
      {
        ...createExecuteAndWaitRequest(),
        partySignatures: { signatures: [] },
      } as unknown as InteractiveSubmissionExecuteAndWaitRequest,
    ],
    [
      'empty signatures for one party',
      {
        ...createExecuteAndWaitRequest(),
        partySignatures: {
          signatures: [{ party: 'party::fingerprint', signatures: [] }],
        },
      } as unknown as InteractiveSubmissionExecuteAndWaitRequest,
    ],
    [
      'unknown nested signature fields',
      {
        ...createExecuteAndWaitRequest(),
        partySignatures: {
          signatures: [
            {
              ...createExecuteAndWaitRequest().partySignatures.signatures[0],
              typo: true,
            },
          ],
        },
      } as unknown as InteractiveSubmissionExecuteAndWaitRequest,
    ],
    [
      'unknown signature formats',
      {
        ...createExecuteAndWaitRequest(),
        partySignatures: {
          signatures: [
            {
              party: 'party::fingerprint',
              signatures: [
                {
                  format: 'SIGNATURE_FORMAT_PEM',
                  signature: SIGNATURE_BASE64,
                  signedBy: 'fingerprint',
                  signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_ED25519',
                },
              ],
            },
          ],
        },
      } as unknown as InteractiveSubmissionExecuteAndWaitRequest,
    ],
    [
      'the unspecified signature format sentinel',
      {
        ...createExecuteAndWaitRequest(),
        partySignatures: {
          signatures: [
            {
              party: 'party::fingerprint',
              signatures: [
                {
                  format: 'SIGNATURE_FORMAT_UNSPECIFIED',
                  signature: SIGNATURE_BASE64,
                  signedBy: 'fingerprint',
                  signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_ED25519',
                },
              ],
            },
          ],
        },
      } as unknown as InteractiveSubmissionExecuteAndWaitRequest,
    ],
    [
      'unknown signing algorithms',
      {
        ...createExecuteAndWaitRequest(),
        partySignatures: {
          signatures: [
            {
              party: 'party::fingerprint',
              signatures: [
                {
                  format: 'SIGNATURE_FORMAT_RAW',
                  signature: SIGNATURE_BASE64,
                  signedBy: 'fingerprint',
                  signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_RSA_SHA_256',
                },
              ],
            },
          ],
        },
      } as unknown as InteractiveSubmissionExecuteAndWaitRequest,
    ],
    [
      'the unspecified signing algorithm sentinel',
      {
        ...createExecuteAndWaitRequest(),
        partySignatures: {
          signatures: [
            {
              party: 'party::fingerprint',
              signatures: [
                {
                  format: 'SIGNATURE_FORMAT_RAW',
                  signature: SIGNATURE_BASE64,
                  signedBy: 'fingerprint',
                  signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_UNSPECIFIED',
                },
              ],
            },
          ],
        },
      } as unknown as InteractiveSubmissionExecuteAndWaitRequest,
    ],
    [
      'the unspecified hashing scheme sentinel',
      {
        ...createExecuteAndWaitRequest(),
        hashingSchemeVersion: 'HASHING_SCHEME_VERSION_UNSPECIFIED',
      } as unknown as InteractiveSubmissionExecuteAndWaitRequest,
    ],
    [
      'duration seconds above the protobuf maximum',
      {
        ...createExecuteAndWaitRequest(),
        minLedgerTime: {
          time: { MinLedgerTimeRel: { value: { seconds: 315_576_000_001, nanos: 0 } } },
        },
      },
    ],
    [
      'duration seconds below the protobuf minimum',
      {
        ...createExecuteAndWaitRequest(),
        minLedgerTime: {
          time: { MinLedgerTimeRel: { value: { seconds: -315_576_000_001, nanos: 0 } } },
        },
      },
    ],
    [
      'duration nanos above the protobuf maximum',
      {
        ...createExecuteAndWaitRequest(),
        minLedgerTime: {
          time: { MinLedgerTimeRel: { value: { seconds: 0, nanos: 1_000_000_000 } } },
        },
      },
    ],
    [
      'duration nanos below the protobuf minimum',
      {
        ...createExecuteAndWaitRequest(),
        minLedgerTime: {
          time: { MinLedgerTimeRel: { value: { seconds: 0, nanos: -1_000_000_000 } } },
        },
      },
    ],
    [
      'a positive duration with negative nanos',
      {
        ...createExecuteAndWaitRequest(),
        minLedgerTime: {
          time: { MinLedgerTimeRel: { value: { seconds: 1, nanos: -1 } } },
        },
      },
    ],
    [
      'a negative duration with positive nanos',
      {
        ...createExecuteAndWaitRequest(),
        minLedgerTime: {
          time: { MinLedgerTimeRel: { value: { seconds: -1, nanos: 1 } } },
        },
      },
    ],
    [
      'unsafe protobuf int64 values',
      {
        ...createExecuteAndWaitRequest(),
        minLedgerTime: {
          time: {
            MinLedgerTimeRel: {
              value: {
                seconds: 5,
                nanos: 0,
                unknownFields: { fields: { '1': { varint: [Number.MAX_SAFE_INTEGER + 1] } } },
              },
            },
          },
        },
      },
    ],
    [
      'fractional protobuf unknown-field integers',
      {
        ...createExecuteAndWaitRequest(),
        minLedgerTime: {
          time: {
            MinLedgerTimeRel: {
              value: {
                seconds: 5,
                nanos: 0,
                unknownFields: { fields: { '1': { varint: [1.5] } } },
              },
            },
          },
        },
      },
    ],
    [
      'out-of-range protobuf fixed32 values',
      {
        ...createExecuteAndWaitRequest(),
        minLedgerTime: {
          time: {
            MinLedgerTimeRel: {
              value: {
                seconds: 5,
                nanos: 0,
                unknownFields: { fields: { '1': { fixed32: [2_147_483_648] } } },
              },
            },
          },
        },
      },
    ],
  ])('rejects %s before making a request', async (_description, request) => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest');

    await expect(client.interactiveSubmissionExecuteAndWait(request)).rejects.toThrow('Parameter validation failed');
    expect(post).not.toHaveBeenCalled();
  });

  it('rejects the unspecified transaction-shape sentinel before making a request', async () => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest');

    await expect(
      client.interactiveSubmissionExecuteAndWaitForTransaction({
        ...createExecuteAndWaitRequest(),
        transactionFormat: {
          eventFormat: {},
          transactionShape: 'TRANSACTION_SHAPE_UNSPECIFIED',
        },
      } as unknown as InteractiveSubmissionExecuteAndWaitForTransactionRequest)
    ).rejects.toThrow('Parameter validation failed');
    expect(post).not.toHaveBeenCalled();
  });

  it('uses the exact preferred-package-version URL and normalizes a wire-null preference', async () => {
    const client = createClient();
    const get = jest.spyOn(client, 'makeGetRequest').mockResolvedValue({ packagePreference: null });

    await expect(
      client.interactiveSubmissionGetPreferredPackageVersion({
        packageName: 'quickstart-licensing',
        parties: ['Alice::fingerprint', 'Bob::fingerprint'],
        synchronizerId: 'synchronizer::id',
        vettingValidAt: '2026-07-09T12:00:00Z',
      })
    ).resolves.toEqual({});

    const requestedUrl = get.mock.calls[0]?.[0];
    expect(requestedUrl).toBe(
      'https://ledger.example.test/v2/interactive-submission/preferred-package-version?parties=Alice%3A%3Afingerprint&parties=Bob%3A%3Afingerprint&package-name=quickstart-licensing&vetting_valid_at=2026-07-09T12%3A00%3A00Z&synchronizer-id=synchronizer%3A%3Aid'
    );
  });

  it.each([
    ['an empty package name', { packageName: '' }],
    ['an empty party', { packageName: 'quickstart-licensing', parties: [''] }],
    ['a non-RFC3339 vetting time', { packageName: 'quickstart-licensing', vettingValidAt: '2026-07-09 12:00:00' }],
  ])('rejects preferred-package-version requests with %s', async (_description, request) => {
    const client = createClient();
    const get = jest.spyOn(client, 'makeGetRequest');

    await expect(client.interactiveSubmissionGetPreferredPackageVersion(request)).rejects.toThrow(
      'Parameter validation failed'
    );
    expect(get).not.toHaveBeenCalled();
  });

  it('posts and validates exact non-empty preferred-package formats', async () => {
    const client = createClient();
    const response = {
      packageReferences: [{ packageId: 'package-id', packageName: 'quickstart-licensing', packageVersion: '1.0.0' }],
      synchronizerId: 'synchronizer::id',
    };
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue(response);
    const request = {
      packageVettingRequirements: [{ packageName: 'quickstart-licensing', parties: ['Alice::fingerprint'] }],
      synchronizerId: 'synchronizer::id',
    };

    await expect(client.interactiveSubmissionGetPreferredPackages(request)).resolves.toEqual(response);

    expect(post.mock.calls[0]?.[0]).toBe('https://ledger.example.test/v2/interactive-submission/preferred-packages');
    expect(post.mock.calls[0]?.[1]).toEqual(request);
  });

  it.each([
    ['no package requirements', { packageVettingRequirements: [] }],
    [
      'a requirement with no parties',
      { packageVettingRequirements: [{ packageName: 'quickstart-licensing', parties: [] }] },
    ],
    ['an empty package name', { packageVettingRequirements: [{ packageName: '', parties: ['Alice'] }] }],
    ['an empty party', { packageVettingRequirements: [{ packageName: 'quickstart-licensing', parties: [''] }] }],
    [
      'a non-RFC3339 vetting time',
      {
        packageVettingRequirements: [{ packageName: 'quickstart-licensing', parties: ['Alice'] }],
        vettingValidAt: '2026-07-09 12:00:00',
      },
    ],
  ])('rejects preferred-package requests with %s', async (_description, request) => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest');

    await expect(client.interactiveSubmissionGetPreferredPackages(request)).rejects.toThrow(
      'Parameter validation failed'
    );
    expect(post).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty package reference list', { packageReferences: [], synchronizerId: 'synchronizer::id' }],
    [
      'an incomplete package reference',
      {
        packageReferences: [{ packageId: 'package-id', packageName: 'quickstart-licensing' }],
        synchronizerId: 'synchronizer::id',
      },
    ],
    [
      'an empty package ID',
      {
        packageReferences: [{ packageId: '', packageName: 'quickstart-licensing', packageVersion: '1.0.0' }],
        synchronizerId: 'synchronizer::id',
      },
    ],
    [
      'an empty synchronizer ID',
      {
        packageReferences: [{ packageId: 'package-id', packageName: 'quickstart-licensing', packageVersion: '1.0.0' }],
        synchronizerId: '',
      },
    ],
    [
      'an unknown response property',
      {
        packageReferences: [{ packageId: 'package-id', packageName: 'quickstart-licensing', packageVersion: '1.0.0' }],
        synchronizerId: 'synchronizer::id',
        typo: true,
      },
    ],
  ])('rejects preferred-package responses with %s', async (_description, response) => {
    const client = createClient();
    jest.spyOn(client, 'makePostRequest').mockResolvedValue(response);

    await expect(
      client.interactiveSubmissionGetPreferredPackages({
        packageVettingRequirements: [{ packageName: 'quickstart-licensing', parties: ['Alice::fingerprint'] }],
      })
    ).rejects.toThrow('Response validation failed');
  });
});
