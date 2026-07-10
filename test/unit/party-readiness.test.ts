import {
  assertCommonSynchronizerReady,
  assertPartySynchronizerReady,
  canSubmitWithPermission,
  checkPartySynchronizerReadiness,
  listConnectedSynchronizerIds,
  partyCanSubmitOnSynchronizer,
  readConnectedSynchronizers,
  readSingleConnectedSynchronizerId,
  resolveActiveSubmissionSynchronizer,
  resolveCommonSynchronizerIds,
  waitForPartyCanSubmit,
  type PartySynchronizerReadinessLedgerClient,
} from '../../src';

type MockLedgerClient = PartySynchronizerReadinessLedgerClient & {
  readonly getConnectedSynchronizers: jest.MockedFunction<
    PartySynchronizerReadinessLedgerClient['getConnectedSynchronizers']
  >;
};

function createMockLedgerClient(responses: Record<string, unknown>): MockLedgerClient {
  return {
    getConnectedSynchronizers: jest.fn(
      async (params: { readonly party: string }) => responses[params.party] ?? { connectedSynchronizers: [] }
    ),
  };
}

describe('party synchronizer readiness helpers', (): void => {
  it('parses connected synchronizers from Canton and legacy-shaped responses', (): void => {
    expect(
      readConnectedSynchronizers({
        connectedSynchronizers: [
          {
            synchronizerAlias: 'global',
            synchronizerId: ' global-domain::sync ',
            permission: 'SUBMISSION',
          },
          {
            synchronizer_alias: 'ignored-duplicate',
            synchronizer_id: 'global-domain::sync',
            permission: 'OBSERVATION',
          },
          ' other-domain::sync ',
          { domainId: 'legacy-domain::sync' },
          { id: 'id-domain::sync', participant_permission: 'CONFIRMATION' },
          { synchronizerId: ' ' },
        ],
      })
    ).toEqual([
      {
        synchronizerAlias: 'global',
        synchronizerId: 'global-domain::sync',
        permission: 'SUBMISSION',
        raw: expect.any(Object) as object,
      },
      {
        synchronizerId: 'other-domain::sync',
        raw: ' other-domain::sync ',
      },
      {
        synchronizerId: 'legacy-domain::sync',
        raw: expect.any(Object) as object,
      },
      {
        synchronizerId: 'id-domain::sync',
        permission: 'CONFIRMATION',
        raw: expect.any(Object) as object,
      },
    ]);

    expect(readConnectedSynchronizers({ connected_synchronizers: [{ synchronizer: 'snake::sync' }] })).toEqual([
      {
        synchronizerId: 'snake::sync',
        raw: expect.any(Object) as object,
      },
    ]);
  });

  it('lists connected synchronizer IDs and passes participantId when supplied', async (): Promise<void> => {
    const ledgerClient = createMockLedgerClient({
      'issuer::party': {
        connectedSynchronizers: [{ synchronizerId: 'sync-2' }, { synchronizerId: 'sync-1' }],
      },
    });

    await expect(
      listConnectedSynchronizerIds({
        ledgerClient,
        party: ' issuer::party ',
        participantId: ' participant::node ',
      })
    ).resolves.toMatchObject({
      party: 'issuer::party',
      synchronizerIds: ['sync-2', 'sync-1'],
    });

    expect(ledgerClient.getConnectedSynchronizers).toHaveBeenCalledWith({
      party: 'issuer::party',
      participantId: 'participant::node',
    });
  });

  it('checks one party for submit readiness on a synchronizer', async (): Promise<void> => {
    const ledgerClient = createMockLedgerClient({
      'issuer::party': {
        connectedSynchronizers: [
          { synchronizerId: 'global-domain::sync', permission: 'Submission' },
          { synchronizerId: 'observer-domain::sync', permission: 'Observation' },
        ],
      },
    });

    await expect(
      checkPartySynchronizerReadiness({
        ledgerClient,
        party: 'issuer::party',
        synchronizerId: 'global-domain::sync',
      })
    ).resolves.toMatchObject({
      party: 'issuer::party',
      synchronizerId: 'global-domain::sync',
      ready: true,
      connected: true,
      canSubmit: true,
      connectedSynchronizerIds: ['global-domain::sync', 'observer-domain::sync'],
    });

    await expect(
      checkPartySynchronizerReadiness({
        ledgerClient,
        party: 'issuer::party',
        synchronizerId: 'observer-domain::sync',
      })
    ).resolves.toMatchObject({
      ready: false,
      connected: true,
      canSubmit: false,
      reason: 'not-submit-capable',
    });

    await expect(
      checkPartySynchronizerReadiness({
        ledgerClient,
        party: 'issuer::party',
        synchronizerId: 'missing-domain::sync',
      })
    ).resolves.toMatchObject({
      ready: false,
      connected: false,
      canSubmit: false,
      reason: 'not-connected',
    });
  });

  it('exposes a boolean helper for submit readiness on a synchronizer', async (): Promise<void> => {
    const ledgerClient = createMockLedgerClient({
      'issuer::party': {
        connectedSynchronizers: [
          { synchronizerId: 'global-domain::sync', permission: 'PARTICIPANT_PERMISSION_SUBMISSION' },
          { synchronizerId: 'observer-domain::sync', permission: 'PARTICIPANT_PERMISSION_OBSERVATION' },
        ],
      },
    });

    await expect(
      partyCanSubmitOnSynchronizer({
        ledgerClient,
        party: 'issuer::party',
        synchronizerId: 'global-domain::sync',
      })
    ).resolves.toBe(true);
    await expect(
      partyCanSubmitOnSynchronizer({
        ledgerClient,
        party: 'issuer::party',
        synchronizerId: 'observer-domain::sync',
      })
    ).resolves.toBe(false);
  });

  it('asserts party readiness with actionable failures', async (): Promise<void> => {
    const ledgerClient = createMockLedgerClient({
      'external::party': {
        connectedSynchronizers: [{ synchronizerId: 'observer-domain::sync', permission: 'OBSERVATION' }],
      },
    });

    await expect(
      assertPartySynchronizerReady({
        ledgerClient,
        party: 'external::party',
        synchronizerId: 'observer-domain::sync',
      })
    ).rejects.toThrow('without submit permission');

    await expect(
      assertPartySynchronizerReady({
        ledgerClient,
        party: 'external::party',
        synchronizerId: 'global-domain::sync',
      })
    ).rejects.toThrow('not connected to the synchronizer');
  });

  it('resolves common submit-capable synchronizers across parties', async (): Promise<void> => {
    const ledgerClient = createMockLedgerClient({
      'transfer-agent::party': {
        connectedSynchronizers: [
          { synchronizerId: 'global-domain::sync', permission: 'Submission' },
          { synchronizerId: 'read-only-domain::sync', permission: 'Observation' },
        ],
      },
      'issuer::party': {
        connectedSynchronizers: [
          { synchronizerId: 'global-domain::sync', permission: 'Confirmation' },
          { synchronizerId: 'read-only-domain::sync', permission: 'Observation' },
          { synchronizerId: 'issuer-only-domain::sync', permission: 'Submission' },
        ],
      },
      'external::party': {
        connectedSynchronizers: [
          { synchronizerId: 'global-domain::sync' },
          { synchronizerId: 'read-only-domain::sync', permission: 'Observation' },
        ],
      },
    });

    await expect(
      resolveCommonSynchronizerIds({
        ledgerClient,
        parties: ['transfer-agent::party', 'issuer::party', 'external::party'],
      })
    ).resolves.toMatchObject({
      parties: ['transfer-agent::party', 'issuer::party', 'external::party'],
      synchronizerIds: ['global-domain::sync'],
    });

    await expect(
      resolveCommonSynchronizerIds({
        ledgerClient,
        parties: ['transfer-agent::party', 'issuer::party', 'external::party'],
        requireSubmitPermission: false,
      })
    ).resolves.toMatchObject({
      synchronizerIds: ['global-domain::sync', 'read-only-domain::sync'],
    });
  });

  it('resolves the active submission synchronizer using anchor-party order', async (): Promise<void> => {
    const ledgerClient = createMockLedgerClient({
      'transfer-agent::party': {
        connectedSynchronizers: [
          { synchronizerId: 'sync-b', permission: 'Submission' },
          { synchronizerId: 'sync-a', permission: 'Submission' },
        ],
      },
      'issuer::party': {
        connectedSynchronizers: [
          { synchronizerId: 'sync-a', permission: 'Submission' },
          { synchronizerId: 'sync-b', permission: 'Submission' },
        ],
      },
      'external::party': {
        connectedSynchronizers: [{ synchronizerId: 'sync-b', permission: 'Submission' }],
      },
    });

    await expect(
      resolveActiveSubmissionSynchronizer({
        ledgerClient,
        anchorParty: 'transfer-agent::party',
        parties: ['issuer::party', 'external::party'],
      })
    ).resolves.toBe('sync-b');
  });

  it('resolves the active submission synchronizer for an anchor party without counterparties', async (): Promise<void> => {
    const ledgerClient = createMockLedgerClient({
      'transfer-agent::party': {
        connectedSynchronizers: [
          { synchronizerId: 'observer-domain::sync', permission: 'Observation' },
          { synchronizerId: 'global-domain::sync', permission: 'Submission' },
        ],
      },
    });

    await expect(
      resolveActiveSubmissionSynchronizer({
        ledgerClient,
        anchorParty: 'transfer-agent::party',
      })
    ).resolves.toBe('global-domain::sync');
  });

  it('reports active submission synchronizer failures with party context', async (): Promise<void> => {
    const ledgerClient = createMockLedgerClient({
      'transfer-agent::party': {
        connectedSynchronizers: [{ synchronizerId: 'sync-a', permission: 'Submission' }],
      },
      'external::party': {
        connectedSynchronizers: [{ synchronizerId: 'sync-b', permission: 'Submission' }],
      },
    });

    await expect(
      resolveActiveSubmissionSynchronizer({
        ledgerClient,
        anchorParty: 'transfer-agent::party',
        parties: ['external::party'],
      })
    ).rejects.toThrow('do not share a submission-capable synchronizer');
  });

  it('asserts common synchronizer readiness for an expected synchronizer', async (): Promise<void> => {
    const ledgerClient = createMockLedgerClient({
      'transfer-agent::party': {
        connectedSynchronizers: [{ synchronizerId: 'global-domain::sync', permission: 'Submission' }],
      },
      'issuer::party': {
        connectedSynchronizers: [{ synchronizerId: 'global-domain::sync', permission: 'Confirmation' }],
      },
      'external::party': {
        connectedSynchronizers: [{ synchronizerId: 'other-domain::sync', permission: 'Confirmation' }],
      },
    });

    await expect(
      assertCommonSynchronizerReady({
        ledgerClient,
        parties: ['transfer-agent::party', 'issuer::party'],
        synchronizerId: 'global-domain::sync',
      })
    ).resolves.toMatchObject({
      synchronizerId: 'global-domain::sync',
    });

    await expect(
      assertCommonSynchronizerReady({
        ledgerClient,
        parties: ['transfer-agent::party', 'issuer::party', 'external::party'],
        synchronizerId: 'global-domain::sync',
      })
    ).rejects.toThrow('not ready on the requested synchronizer');
  });

  it('waits for a party to become submission-capable and ignores transient check errors', async (): Promise<void> => {
    const onCheckError = jest.fn();
    const ledgerClient: MockLedgerClient = {
      getConnectedSynchronizers: jest
        .fn<
          ReturnType<PartySynchronizerReadinessLedgerClient['getConnectedSynchronizers']>,
          [{ readonly party: string }]
        >()
        .mockRejectedValueOnce(new Error('ledger unavailable'))
        .mockResolvedValueOnce({
          connectedSynchronizers: [{ synchronizerId: 'global-domain::sync', permission: 'Observation' }],
        })
        .mockResolvedValueOnce({
          connectedSynchronizers: [{ synchronizerId: 'global-domain::sync', permission: 'Submission' }],
        }),
    };

    await expect(
      waitForPartyCanSubmit({
        ledgerClient,
        party: 'external::party',
        synchronizerId: 'global-domain::sync',
        delaysMs: [0, 0, 0],
        onCheckError,
      })
    ).resolves.toBe(true);
    expect(onCheckError).toHaveBeenCalledTimes(1);
    expect(ledgerClient.getConnectedSynchronizers).toHaveBeenCalledTimes(3);
  });

  it('returns false when party submit readiness does not settle within the wait window', async (): Promise<void> => {
    const ledgerClient = createMockLedgerClient({
      'external::party': {
        connectedSynchronizers: [{ synchronizerId: 'global-domain::sync', permission: 'Observation' }],
      },
    });

    await expect(
      waitForPartyCanSubmit({
        ledgerClient,
        party: 'external::party',
        synchronizerId: 'global-domain::sync',
        delaysMs: [0, 0],
      })
    ).resolves.toBe(false);
  });

  it('rejects a pre-aborted readiness wait without calling Canton', async (): Promise<void> => {
    const controller = new AbortController();
    controller.abort();
    const ledgerClient = createMockLedgerClient({});

    await expect(
      waitForPartyCanSubmit({
        ledgerClient,
        party: 'external::party',
        synchronizerId: 'global-domain::sync',
        delaysMs: [0],
        signal: controller.signal,
      })
    ).rejects.toThrow('Canton party readiness wait was aborted');
    expect(ledgerClient.getConnectedSynchronizers).not.toHaveBeenCalled();
  });

  it('cancels a pending readiness delay without running the check', async (): Promise<void> => {
    const controller = new AbortController();
    const ledgerClient = createMockLedgerClient({});
    const waiting = waitForPartyCanSubmit({
      ledgerClient,
      party: 'external::party',
      synchronizerId: 'global-domain::sync',
      delaysMs: [60_000],
      signal: controller.signal,
    });

    controller.abort();

    await expect(waiting).rejects.toThrow('Canton party readiness wait was aborted');
    expect(ledgerClient.getConnectedSynchronizers).not.toHaveBeenCalled();
  });

  it('cancels an unresolved readiness read without treating abort as a transient error', async (): Promise<void> => {
    const controller = new AbortController();
    const onCheckError = jest.fn();
    const ledgerClient: MockLedgerClient = {
      getConnectedSynchronizers: jest.fn(
        async (_params: { readonly party: string; readonly participantId?: string }) =>
          new Promise<unknown>(() => undefined)
      ),
    };
    const waiting = waitForPartyCanSubmit({
      ledgerClient,
      party: 'external::party',
      synchronizerId: 'global-domain::sync',
      delaysMs: [0],
      signal: controller.signal,
      onCheckError,
    });

    controller.abort();

    await expect(waiting).rejects.toThrow('Canton party readiness wait was aborted');
    expect(onCheckError).not.toHaveBeenCalled();
  });

  it('handles single-synchronizer and permission helper edge cases', (): void => {
    expect(
      readSingleConnectedSynchronizerId({ connectedSynchronizers: [' sync-1 ', { synchronizerId: 'sync-1' }] })
    ).toBe('sync-1');
    expect(readSingleConnectedSynchronizerId(null)).toBeNull();
    expect(() => readSingleConnectedSynchronizerId({ connectedSynchronizers: ['sync-1', 'sync-2'] })).toThrow(
      'multiple connected synchronizers'
    );

    expect(canSubmitWithPermission(undefined)).toBe(true);
    expect(canSubmitWithPermission('SUBMISSION')).toBe(true);
    expect(canSubmitWithPermission('Confirmation')).toBe(true);
    expect(canSubmitWithPermission('Observation')).toBe(false);
  });
});
