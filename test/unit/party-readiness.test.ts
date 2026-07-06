import {
  assertCommonSynchronizerReady,
  assertPartySynchronizerReady,
  canSubmitWithPermission,
  checkPartySynchronizerReadiness,
  listConnectedSynchronizerIds,
  readConnectedSynchronizers,
  readSingleConnectedSynchronizerId,
  resolveCommonSynchronizerIds,
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
