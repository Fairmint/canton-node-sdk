import { generateKeyPairSync } from 'node:crypto';
import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import {
  ApiError,
  NetworkError,
  OperationError,
  OperationErrorCode,
  UnknownMutationOutcomeError,
  ValidationError,
} from '../../../src/core/errors';
import {
  buildExternalPartyId,
  deriveCantonEd25519PublicKeyFingerprint,
} from '../../../src/utils/external-signing/canton-protocol';
import {
  classifyExternalPartyAllocationFailure,
  reconcileExternalPartyAllocationFailure,
  reconcileExternalPartyOnboarding,
} from '../../../src/utils/external-signing/external-party-lifecycle';

const SYNCHRONIZER_ID = 'global-domain::sync';

function createPartyFixture(): {
  readonly publicKeyBase64: string;
  readonly partyId: string;
} {
  const { publicKey } = generateKeyPairSync('ed25519');
  const publicKeyBase64 = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }))
    .subarray(-32)
    .toString('base64');
  return {
    publicKeyBase64,
    partyId: buildExternalPartyId('external-test', deriveCantonEd25519PublicKeyFingerprint(publicKeyBase64)),
  };
}

function createMockLedgerClient(partyId: string): jest.Mocked<LedgerJsonApiClient> {
  const client = Object.create(null) as jest.Mocked<LedgerJsonApiClient>;
  client.getPartyDetails = jest.fn().mockResolvedValue({ partyDetails: { party: partyId, isLocal: true } });
  client.getConnectedSynchronizers = jest.fn().mockResolvedValue({
    connectedSynchronizers: [{ synchronizerId: SYNCHRONIZER_ID, permission: 'SUBMISSION' }],
  });
  return client;
}

describe('external-party lifecycle reconciliation', (): void => {
  it('returns ready when the party exists and is submission-capable', async (): Promise<void> => {
    const fixture = createPartyFixture();
    const ledgerClient = createMockLedgerClient(fixture.partyId);

    await expect(
      reconcileExternalPartyOnboarding({
        ledgerClient,
        partyId: fixture.partyId,
        publicKeyBase64: fixture.publicKeyBase64,
        synchronizerId: SYNCHRONIZER_ID,
      })
    ).resolves.toMatchObject({
      state: 'ready',
      partyId: fixture.partyId,
      exists: true,
      ready: true,
    });
  });

  it('returns in-flight when an allocated party is not yet submission-capable', async (): Promise<void> => {
    const fixture = createPartyFixture();
    const ledgerClient = createMockLedgerClient(fixture.partyId);
    ledgerClient.getConnectedSynchronizers.mockResolvedValueOnce({
      connectedSynchronizers: [
        {
          synchronizerAlias: 'global',
          synchronizerId: SYNCHRONIZER_ID,
          permission: 'PARTICIPANT_PERMISSION_OBSERVATION',
        },
      ],
    });

    await expect(
      reconcileExternalPartyOnboarding({
        ledgerClient,
        partyId: fixture.partyId,
        publicKeyBase64: fixture.publicKeyBase64,
        synchronizerId: SYNCHRONIZER_ID,
      })
    ).resolves.toMatchObject({
      state: 'in-flight',
      exists: true,
      ready: false,
      readiness: { reason: 'not-submit-capable' },
    });
  });

  it('returns allocated when local observation is the intended terminal state', async (): Promise<void> => {
    const fixture = createPartyFixture();
    const ledgerClient = createMockLedgerClient(fixture.partyId);
    ledgerClient.getConnectedSynchronizers.mockResolvedValueOnce({ connectedSynchronizers: [] });

    await expect(
      reconcileExternalPartyOnboarding({
        ledgerClient,
        partyId: fixture.partyId,
        publicKeyBase64: fixture.publicKeyBase64,
        synchronizerId: SYNCHRONIZER_ID,
        expectSubmitReady: false,
      })
    ).resolves.toMatchObject({
      state: 'allocated',
      exists: true,
      ready: false,
    });
  });

  it('distinguishes not-found from unknown lookup failures', async (): Promise<void> => {
    const fixture = createPartyFixture();
    const ledgerClient = createMockLedgerClient(fixture.partyId);
    ledgerClient.getPartyDetails.mockRejectedValueOnce(new ApiError('missing', 404));

    await expect(
      reconcileExternalPartyOnboarding({
        ledgerClient,
        partyId: fixture.partyId,
        publicKeyBase64: fixture.publicKeyBase64,
        synchronizerId: SYNCHRONIZER_ID,
      })
    ).resolves.toMatchObject({ state: 'not-found', exists: false, ready: false });

    ledgerClient.getPartyDetails.mockRejectedValueOnce(new NetworkError('ledger unavailable'));
    await expect(
      reconcileExternalPartyOnboarding({
        ledgerClient,
        partyId: fixture.partyId,
        publicKeyBase64: fixture.publicKeyBase64,
        synchronizerId: SYNCHRONIZER_ID,
      })
    ).resolves.toMatchObject({
      state: 'unknown',
      exists: null,
      ready: false,
      failedAt: 'party-details',
      failure: { name: 'NetworkError' },
    });
  });

  it('returns unknown with exists=true when only the readiness check fails', async (): Promise<void> => {
    const fixture = createPartyFixture();
    const ledgerClient = createMockLedgerClient(fixture.partyId);
    ledgerClient.getConnectedSynchronizers.mockRejectedValueOnce(new NetworkError('ledger unavailable'));

    await expect(
      reconcileExternalPartyOnboarding({
        ledgerClient,
        partyId: fixture.partyId,
        publicKeyBase64: fixture.publicKeyBase64,
        synchronizerId: SYNCHRONIZER_ID,
      })
    ).resolves.toMatchObject({
      state: 'unknown',
      exists: true,
      ready: false,
      failedAt: 'readiness',
      failure: { name: 'NetworkError' },
    });
  });

  it('throws cancellation instead of normalizing an aborted reconciliation as unknown', async (): Promise<void> => {
    const fixture = createPartyFixture();
    const ledgerClient = createMockLedgerClient(fixture.partyId);
    const controller = new AbortController();
    ledgerClient.getPartyDetails.mockImplementationOnce(async () => new Promise<never>(() => undefined));
    const reconciliation = reconcileExternalPartyOnboarding({
      ledgerClient,
      partyId: fixture.partyId,
      publicKeyBase64: fixture.publicKeyBase64,
      synchronizerId: SYNCHRONIZER_ID,
      signal: controller.signal,
    });

    controller.abort();

    await expect(reconciliation).rejects.toThrow('Canton external-party reconciliation was aborted');
    expect(ledgerClient.getConnectedSynchronizers).not.toHaveBeenCalled();
  });

  it('cancels an unresolved readiness read during reconciliation', async (): Promise<void> => {
    const fixture = createPartyFixture();
    const ledgerClient = createMockLedgerClient(fixture.partyId);
    const controller = new AbortController();
    let markReadinessStarted: (() => void) | undefined;
    const readinessStarted = new Promise<void>((resolve) => {
      markReadinessStarted = resolve;
    });
    ledgerClient.getConnectedSynchronizers.mockImplementationOnce(async () => {
      markReadinessStarted?.();
      return new Promise<never>(() => undefined);
    });
    const reconciliation = reconcileExternalPartyOnboarding({
      ledgerClient,
      partyId: fixture.partyId,
      publicKeyBase64: fixture.publicKeyBase64,
      synchronizerId: SYNCHRONIZER_ID,
      signal: controller.signal,
    });

    await readinessStarted;
    controller.abort();

    await expect(reconciliation).rejects.toMatchObject({
      message: 'Canton external-party reconciliation was aborted',
      context: { step: 'readiness' },
    });
  });
});

describe('external-party allocation failure classification', (): void => {
  it('recognizes structured ALREADY_EXISTS conflicts without inspecting messages', (): void => {
    expect(
      classifyExternalPartyAllocationFailure(
        new ApiError('localized message can change', 409, 'Conflict', { code: 'ALREADY_EXISTS' })
      )
    ).toMatchObject({
      kind: 'already-exists',
      definite: true,
      shouldReconcile: true,
      status: 409,
      code: 'ALREADY_EXISTS',
    });
  });

  it('separates definite local/API rejection from ambiguous transport outcomes', (): void => {
    const preDispatchAbort = new Error('allocation canceled before dispatch');
    preDispatchAbort.name = 'AbortError';
    expect(classifyExternalPartyAllocationFailure(preDispatchAbort)).toMatchObject({
      kind: 'definite-rejection',
      definite: true,
      shouldReconcile: false,
    });
    expect(
      classifyExternalPartyAllocationFailure(
        new UnknownMutationOutcomeError(
          { method: 'POST', endpoint: 'https://ledger.example.test/v2/parties/external', attempts: 1 },
          preDispatchAbort
        )
      )
    ).toMatchObject({
      kind: 'ambiguous',
      definite: false,
      shouldReconcile: true,
    });
    expect(classifyExternalPartyAllocationFailure(new ValidationError('invalid signature'))).toMatchObject({
      kind: 'definite-rejection',
      definite: true,
      shouldReconcile: false,
    });
    expect(
      classifyExternalPartyAllocationFailure(
        new OperationError('allocation response party mismatch', OperationErrorCode.TRANSACTION_FAILED)
      )
    ).toMatchObject({
      kind: 'definite-rejection',
      definite: true,
      shouldReconcile: false,
    });
    expect(classifyExternalPartyAllocationFailure(new ApiError('invalid', 400))).toMatchObject({
      kind: 'definite-rejection',
      definite: true,
      shouldReconcile: false,
    });
    expect(classifyExternalPartyAllocationFailure(new NetworkError('connection reset'))).toMatchObject({
      kind: 'ambiguous',
      definite: false,
      shouldReconcile: true,
    });
    expect(
      classifyExternalPartyAllocationFailure(
        new ApiError('server did not commit', 503, 'Unavailable', { definiteAnswer: true })
      )
    ).toMatchObject({
      kind: 'definite-rejection',
      definite: true,
      shouldReconcile: false,
    });
    expect(
      classifyExternalPartyAllocationFailure(
        new ApiError('explicitly uncertain rejection', 400, 'Bad Request', { definiteAnswer: false })
      )
    ).toMatchObject({
      kind: 'ambiguous',
      definite: false,
      shouldReconcile: true,
    });

    const rawDefiniteServerError = Object.assign(new Error('committed rejection'), {
      status: 503,
      definiteAnswer: true,
    });
    expect(classifyExternalPartyAllocationFailure(rawDefiniteServerError)).toMatchObject({
      kind: 'definite-rejection',
      definite: true,
      shouldReconcile: false,
    });

    const rawUncertainClientError = Object.assign(new Error('uncertain rejection'), {
      status: 400,
      definiteAnswer: false,
    });
    expect(classifyExternalPartyAllocationFailure(rawUncertainClientError)).toMatchObject({
      kind: 'ambiguous',
      definite: false,
      shouldReconcile: true,
    });
  });

  it('preserves diagnostics from non-Error thrown objects with a serialization fallback', (): void => {
    expect(classifyExternalPartyAllocationFailure({ code: 'PROVIDER_FAILURE', retryable: true })).toMatchObject({
      details: {
        name: 'UnknownError',
        message: '{"code":"PROVIDER_FAILURE","retryable":true}',
      },
    });

    const circular = Object.create(null) as { self?: unknown };
    circular.self = circular;
    expect(classifyExternalPartyAllocationFailure(circular)).toMatchObject({
      details: { name: 'UnknownError', message: 'Unserializable thrown value' },
    });
  });

  it('combines structured failure classification with current lifecycle state', async (): Promise<void> => {
    const fixture = createPartyFixture();
    const ledgerClient = createMockLedgerClient(fixture.partyId);
    ledgerClient.getConnectedSynchronizers.mockResolvedValueOnce({ connectedSynchronizers: [] });

    await expect(
      reconcileExternalPartyAllocationFailure({
        ledgerClient,
        partyId: fixture.partyId,
        publicKeyBase64: fixture.publicKeyBase64,
        synchronizerId: SYNCHRONIZER_ID,
        error: new NetworkError('connection reset after upload'),
      })
    ).resolves.toMatchObject({
      failure: { kind: 'ambiguous', shouldReconcile: true },
      status: { state: 'in-flight', exists: true, ready: false },
    });
  });
});
