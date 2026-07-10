import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { ApiError, NetworkError, OperationError, OperationErrorCode } from '../../../src/core/errors';
import {
  CantonEd25519SigningPurpose,
  createExternalPartyWithEd25519Signer,
  executeExternalTransactionWithEd25519Signer,
  ExternalPartyOnboardingError,
  ExternalTransactionSubmissionError,
  MAX_CANTON_ED25519_SIGNING_REQUEST_TTL_MS,
  signAndVerifyCantonEd25519Payload,
  type CantonEd25519Signature,
  type CantonEd25519Signer,
  type CantonEd25519SigningRequest,
} from '../../../src/utils/external-signing';
import {
  buildExternalPartyId,
  deriveCantonEd25519PublicKeyFingerprint,
  normalizeEd25519PublicKeyForCanton,
} from '../../../src/utils/external-signing/canton-protocol';

const SYNCHRONIZER_ID = 'global-domain::sync';
const MULTI_HASH_HEX = `1220${'11'.repeat(32)}`;
const NOW_MS = Date.parse('2026-07-09T12:00:00.000Z');

interface SigningFixture {
  readonly privateKey: KeyObject;
  readonly publicKeyBase64: string;
  readonly publicKeyFingerprint: string;
  readonly partyId: string;
  readonly signer: CantonEd25519Signer;
  readonly signCantonPayload: jest.MockedFunction<CantonEd25519Signer['signCantonPayload']>;
}

function createSigningFixture(): SigningFixture {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyBase64 = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }))
    .subarray(-32)
    .toString('base64');
  const publicKeyFingerprint = deriveCantonEd25519PublicKeyFingerprint(publicKeyBase64);
  const signCantonPayload = jest.fn(
    async (request: CantonEd25519SigningRequest): Promise<CantonEd25519Signature> => ({
      signatureHex: sign(null, Buffer.from(request.payloadHex, 'hex'), privateKey).toString('hex'),
    })
  );
  return {
    privateKey,
    publicKeyBase64,
    publicKeyFingerprint,
    partyId: buildExternalPartyId('external-test', publicKeyFingerprint),
    signer: { publicKeyBase64, signCantonPayload },
    signCantonPayload,
  };
}

function createMockLedgerClient(fixture: SigningFixture): jest.Mocked<LedgerJsonApiClient> {
  const client = Object.create(null) as jest.Mocked<LedgerJsonApiClient>;
  client.generateExternalPartyTopology = jest.fn().mockResolvedValue({
    partyId: fixture.partyId,
    multiHash: Buffer.from(MULTI_HASH_HEX, 'hex').toString('base64'),
    topologyTransactions: ['topology-1'],
  });
  client.allocateExternalParty = jest.fn().mockResolvedValue({ partyId: fixture.partyId });
  client.getPartyDetails = jest.fn().mockResolvedValue({
    partyDetails: { party: fixture.partyId, isLocal: true },
  });
  client.getConnectedSynchronizers = jest.fn().mockResolvedValue({
    connectedSynchronizers: [{ synchronizerId: SYNCHRONIZER_ID, permission: 'SUBMISSION' }],
  });
  client.interactiveSubmissionPrepare = jest.fn().mockResolvedValue({
    preparedTransaction: 'prepared-transaction-base64',
    preparedTransactionHash: Buffer.from('interactive-hash').toString('base64'),
    hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
  });
  client.getApiUrl = jest.fn().mockReturnValue('https://ledger.example.test');
  client.makePostRequest = jest.fn().mockResolvedValue({ updateId: 'update-123' });
  return client;
}

describe('Canton Ed25519 external signing orchestration', (): void => {
  it('prepares, signs, independently verifies, allocates, and reconciles an external party', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);

    const result = await createExternalPartyWithEd25519Signer({
      ledgerClient,
      synchronizerId: SYNCHRONIZER_ID,
      partyHint: 'external-test',
      signer: fixture.signer,
      readinessDelaysMs: [0],
      requestTtlMs: 60_000,
      now: () => NOW_MS,
      signingContext: { provider: 'test-provider', managed: false, attempt: 1 },
    });

    expect(fixture.signCantonPayload).toHaveBeenCalledWith(
      {
        purpose: CantonEd25519SigningPurpose.EXTERNAL_PARTY_TOPOLOGY,
        operationId: fixture.partyId,
        partyId: fixture.partyId,
        publicKeyBase64: normalizeEd25519PublicKeyForCanton(fixture.publicKeyBase64),
        publicKeyFingerprint: fixture.publicKeyFingerprint,
        synchronizerId: SYNCHRONIZER_ID,
        payloadHex: MULTI_HASH_HEX,
        payloadBase64: Buffer.from(MULTI_HASH_HEX, 'hex').toString('base64'),
        issuedAt: '2026-07-09T12:00:00.000Z',
        expiresAt: '2026-07-09T12:01:00.000Z',
        context: { provider: 'test-provider', managed: false, attempt: 1 },
      },
      { signal: expect.any(AbortSignal) as AbortSignal }
    );
    expect(ledgerClient.allocateExternalParty).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      partyId: fixture.partyId,
      publicKeyFingerprint: fixture.publicKeyFingerprint,
      alreadyExisted: false,
      status: { state: 'ready', exists: true, ready: true },
    });
  });

  it('rejects a signer response that does not verify before allocating or executing', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const other = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    fixture.signCantonPayload.mockImplementation(async (request) => ({
      signatureBase64: sign(null, Buffer.from(request.payloadHex, 'hex'), other.privateKey).toString('base64'),
    }));

    await expect(
      createExternalPartyWithEd25519Signer({
        ledgerClient,
        synchronizerId: SYNCHRONIZER_ID,
        partyHint: 'external-test',
        signer: fixture.signer,
        waitForReady: false,
      })
    ).rejects.toThrow('External Canton signer returned an invalid Ed25519 signature');
    expect(ledgerClient.allocateExternalParty.mock.calls).toHaveLength(0);
    expect(ledgerClient.makePostRequest.mock.calls).toHaveLength(0);
  });

  it('rejects signing-request TTLs above the security bound before calling the signer', async (): Promise<void> => {
    const fixture = createSigningFixture();

    await expect(
      signAndVerifyCantonEd25519Payload({
        signer: fixture.signer,
        purpose: CantonEd25519SigningPurpose.EXTERNAL_PARTY_TOPOLOGY,
        operationId: fixture.partyId,
        partyId: fixture.partyId,
        synchronizerId: SYNCHRONIZER_ID,
        payloadHex: MULTI_HASH_HEX,
        requestTtlMs: MAX_CANTON_ED25519_SIGNING_REQUEST_TTL_MS + 1,
      })
    ).rejects.toThrow('requestTtlMs must be a positive safe integer');
    expect(fixture.signCantonPayload.mock.calls).toHaveLength(0);
  });

  it('rejects a signature that returns after its request expires', async (): Promise<void> => {
    const fixture = createSigningFixture();
    let now = NOW_MS;
    fixture.signCantonPayload.mockImplementation(async (request) => {
      now = NOW_MS + 1_000;
      return {
        signatureHex: sign(null, Buffer.from(request.payloadHex, 'hex'), fixture.privateKey).toString('hex'),
      };
    });

    await expect(
      signAndVerifyCantonEd25519Payload({
        signer: fixture.signer,
        purpose: CantonEd25519SigningPurpose.EXTERNAL_PARTY_TOPOLOGY,
        operationId: fixture.partyId,
        partyId: fixture.partyId,
        synchronizerId: SYNCHRONIZER_ID,
        payloadHex: MULTI_HASH_HEX,
        requestTtlMs: 1_000,
        now: () => now,
      })
    ).rejects.toThrow('signing request expired before the signer completed');
  });

  it('aborts a signer that does not settle before the request deadline', async (): Promise<void> => {
    const fixture = createSigningFixture();
    let signerSignal: AbortSignal | undefined;
    fixture.signCantonPayload.mockImplementation(
      async (_request, options) =>
        new Promise<CantonEd25519Signature>(() => {
          signerSignal = options?.signal;
        })
    );

    await expect(
      signAndVerifyCantonEd25519Payload({
        signer: fixture.signer,
        purpose: CantonEd25519SigningPurpose.EXTERNAL_PARTY_TOPOLOGY,
        operationId: fixture.partyId,
        partyId: fixture.partyId,
        synchronizerId: SYNCHRONIZER_ID,
        payloadHex: MULTI_HASH_HEX,
        requestTtlMs: 10,
      })
    ).rejects.toThrow('signing request expired before the signer completed');
    expect(signerSignal?.aborted).toBe(true);
  });

  it('does not invoke a signer when its request is aborted before the queued call starts', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const controller = new AbortController();
    const signed = signAndVerifyCantonEd25519Payload({
      signer: fixture.signer,
      purpose: CantonEd25519SigningPurpose.EXTERNAL_PARTY_TOPOLOGY,
      operationId: fixture.partyId,
      partyId: fixture.partyId,
      synchronizerId: SYNCHRONIZER_ID,
      payloadHex: MULTI_HASH_HEX,
      signal: controller.signal,
    });

    controller.abort();

    await expect(signed).rejects.toThrow('signing request was aborted');
    expect(fixture.signCantonPayload).not.toHaveBeenCalled();
  });

  it('returns structured reconciliation after an ambiguous allocation outcome', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    const controller = new AbortController();
    ledgerClient.allocateExternalParty.mockImplementationOnce(async () => {
      controller.abort();
      throw new NetworkError('connection reset after upload');
    });

    try {
      await createExternalPartyWithEd25519Signer({
        ledgerClient,
        synchronizerId: SYNCHRONIZER_ID,
        partyHint: 'external-test',
        signer: fixture.signer,
        signal: controller.signal,
      });
      throw new Error('Expected external-party onboarding to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ExternalPartyOnboardingError);
      expect(error).toMatchObject({
        reconciliation: {
          failure: { kind: 'ambiguous', shouldReconcile: true },
          status: { state: 'ready', exists: true, ready: true },
        },
        signingRequest: { partyId: fixture.partyId },
        signatureBase64: expect.any(String) as string,
      });
    }
  });

  it('aborts readiness after allocation without returning a successful onboarding result', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    const controller = new AbortController();
    ledgerClient.allocateExternalParty.mockImplementationOnce(async () => {
      controller.abort();
      return { partyId: fixture.partyId };
    });

    await expect(
      createExternalPartyWithEd25519Signer({
        ledgerClient,
        synchronizerId: SYNCHRONIZER_ID,
        partyHint: 'external-test',
        signer: fixture.signer,
        readinessDelaysMs: [0],
        signal: controller.signal,
      })
    ).rejects.toThrow('Canton party readiness wait was aborted');
    expect(ledgerClient.getConnectedSynchronizers).not.toHaveBeenCalled();
  });

  it('rejects when submit readiness does not settle within the requested wait window', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    ledgerClient.getConnectedSynchronizers.mockResolvedValue({
      connectedSynchronizers: [
        {
          synchronizerAlias: 'global-domain',
          synchronizerId: SYNCHRONIZER_ID,
          permission: 'PARTICIPANT_PERMISSION_OBSERVATION',
        },
      ],
    });

    try {
      await createExternalPartyWithEd25519Signer({
        ledgerClient,
        synchronizerId: SYNCHRONIZER_ID,
        partyHint: 'external-test',
        signer: fixture.signer,
        readinessDelaysMs: [0],
      });
      throw new Error('Expected external-party readiness to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(OperationError);
      expect(error).toMatchObject({
        code: OperationErrorCode.MISSING_DOMAIN_ID,
        context: {
          party: fixture.partyId,
          synchronizerId: SYNCHRONIZER_ID,
          readyWithinWaitWindow: false,
          status: { state: 'in-flight', exists: true, ready: false },
        },
      });
    }
  });

  it('accepts readiness observed by final reconciliation after the poll window', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    ledgerClient.getConnectedSynchronizers
      .mockResolvedValueOnce({
        connectedSynchronizers: [
          {
            synchronizerAlias: 'global-domain',
            synchronizerId: SYNCHRONIZER_ID,
            permission: 'PARTICIPANT_PERMISSION_OBSERVATION',
          },
        ],
      })
      .mockResolvedValueOnce({
        connectedSynchronizers: [
          {
            synchronizerAlias: 'global-domain',
            synchronizerId: SYNCHRONIZER_ID,
            permission: 'PARTICIPANT_PERMISSION_SUBMISSION',
          },
        ],
      });

    await expect(
      createExternalPartyWithEd25519Signer({
        ledgerClient,
        synchronizerId: SYNCHRONIZER_ID,
        partyHint: 'external-test',
        signer: fixture.signer,
        readinessDelaysMs: [0],
      })
    ).resolves.toMatchObject({
      partyId: fixture.partyId,
      status: { state: 'ready', exists: true, ready: true },
    });
  });

  it('treats observation-only onboarding as allocated without polling for submit readiness', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    ledgerClient.getConnectedSynchronizers.mockResolvedValue({
      connectedSynchronizers: [
        {
          synchronizerAlias: 'global-domain',
          synchronizerId: SYNCHRONIZER_ID,
          permission: 'PARTICIPANT_PERMISSION_OBSERVATION',
        },
      ],
    });

    await expect(
      createExternalPartyWithEd25519Signer({
        ledgerClient,
        synchronizerId: SYNCHRONIZER_ID,
        partyHint: 'external-test',
        signer: fixture.signer,
        localParticipantObservationOnly: true,
        waitForReady: true,
        readinessDelaysMs: [0],
      })
    ).resolves.toMatchObject({
      partyId: fixture.partyId,
      status: { state: 'allocated', exists: true, ready: false },
    });
    expect(ledgerClient.getConnectedSynchronizers).toHaveBeenCalledTimes(1);
  });

  it('prepares, signs, verifies, executes, and waits for an interactive submission', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);

    const result = await executeExternalTransactionWithEd25519Signer({
      ledgerClient,
      commands: [
        {
          ExerciseCommand: {
            templateId: '#pkg:Module:Template',
            contractId: 'contract-1',
            choice: 'Archive',
            choiceArgument: {},
          },
        },
      ],
      commandId: 'command-123',
      submissionId: 'submission-123',
      userId: 'user-123',
      partyId: fixture.partyId,
      synchronizerId: SYNCHRONIZER_ID,
      signer: fixture.signer,
    });

    const preparedTransactionHashHex = Buffer.from('interactive-hash').toString('hex');
    expect(ledgerClient.interactiveSubmissionPrepare).toHaveBeenCalledWith(
      expect.objectContaining({
        commandId: 'command-123',
        actAs: [fixture.partyId],
        synchronizerId: SYNCHRONIZER_ID,
      })
    );
    expect(fixture.signCantonPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: CantonEd25519SigningPurpose.INTERACTIVE_SUBMISSION,
        operationId: 'command-123',
        partyId: fixture.partyId,
        payloadHex: preparedTransactionHashHex,
      }),
      { signal: expect.any(AbortSignal) as AbortSignal }
    );
    expect(ledgerClient.makePostRequest.mock.calls).toEqual([
      [
        'https://ledger.example.test/v2/interactive-submission/executeAndWait',
        expect.objectContaining({
          submissionId: 'submission-123',
          partySignatures: {
            signatures: [
              {
                party: fixture.partyId,
                signatures: [
                  expect.objectContaining({
                    signature: expect.any(String) as string,
                    signedBy: fixture.publicKeyFingerprint,
                  }),
                ],
              },
            ],
          },
        }),
        { contentType: 'application/json', includeBearerToken: true },
      ],
    ]);
    expect(result).toMatchObject({
      commandId: 'command-123',
      submissionId: 'submission-123',
      preparedTransactionHashHex,
      submitted: { updateId: 'update-123' },
    });
  });

  it('rejects an interactive submission whose party is not controlled by the signer before preparing', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const other = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);

    await expect(
      executeExternalTransactionWithEd25519Signer({
        ledgerClient,
        commands: [],
        commandId: 'command-mismatch',
        submissionId: 'submission-mismatch',
        userId: 'user-123',
        partyId: other.partyId,
        synchronizerId: SYNCHRONIZER_ID,
        signer: fixture.signer,
      })
    ).rejects.toThrow('Canton party ID does not match the submitted public key');
    expect(ledgerClient.interactiveSubmissionPrepare.mock.calls).toHaveLength(0);
  });

  it('preserves caller-stable IDs and signing evidence on an ambiguous submission outcome', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    ledgerClient.makePostRequest.mockRejectedValueOnce(new NetworkError('connection reset after submit'));

    try {
      await executeExternalTransactionWithEd25519Signer({
        ledgerClient,
        commands: [],
        commandId: 'stable-command',
        submissionId: 'stable-submission',
        userId: 'user-123',
        partyId: fixture.partyId,
        synchronizerId: SYNCHRONIZER_ID,
        signer: fixture.signer,
      });
      throw new Error('Expected interactive submission to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ExternalTransactionSubmissionError);
      expect(error).toMatchObject({
        kind: 'ambiguous',
        definite: false,
        commandId: 'stable-command',
        submissionId: 'stable-submission',
        partyId: fixture.partyId,
        preparedTransaction: 'prepared-transaction-base64',
        hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
        prepared: {
          commandId: 'stable-command',
          preparedTransaction: 'prepared-transaction-base64',
        },
        resubmission: {
          userId: 'user-123',
          preparedTransaction: 'prepared-transaction-base64',
          submissionId: 'stable-submission',
          hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
          deduplicationPeriod: {
            DeduplicationDuration: { value: { duration: '30s' } },
          },
          partySignatures: expect.any(Array) as unknown[],
        },
        signingRequest: { operationId: 'stable-command' },
        signatureBase64: expect.any(String) as string,
      });
    }
  });

  it('honors structured Canton submission certainty over HTTP status heuristics', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    ledgerClient.makePostRequest
      .mockRejectedValueOnce(new ApiError('committed rejection', 503, 'Unavailable', { definiteAnswer: true }))
      .mockRejectedValueOnce(new ApiError('uncertain rejection', 400, 'Bad Request', { definiteAnswer: false }));

    const execute = async (suffix: string): Promise<void> => {
      await executeExternalTransactionWithEd25519Signer({
        ledgerClient,
        commands: [],
        commandId: `certainty-${suffix}`,
        submissionId: `certainty-${suffix}`,
        userId: 'user-123',
        partyId: fixture.partyId,
        synchronizerId: SYNCHRONIZER_ID,
        signer: fixture.signer,
      });
    };

    await expect(execute('definite')).rejects.toMatchObject({
      kind: 'definite-rejection',
      definite: true,
      status: 503,
    });
    await expect(execute('ambiguous')).rejects.toMatchObject({
      kind: 'ambiguous',
      definite: false,
      status: 400,
    });
  });
});
