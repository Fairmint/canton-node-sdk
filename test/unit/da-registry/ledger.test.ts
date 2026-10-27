import { type LedgerJsonApiClient } from '../../../src/clients';
import { createDaRegistryLedger } from '../../../src/da-registry';
import { type LedgerSubmission } from '../../../src/utils/ledger';

const SYNC = 'global-domain::1220aaaa';

function mockClient(): LedgerJsonApiClient {
  return {
    getActiveContracts: jest.fn().mockResolvedValue([]),
    submitAndWaitForTransaction: jest.fn().mockResolvedValue({ transaction: { updateId: 'u-1', events: [] } }),
    getAuthenticatedUser: jest.fn().mockResolvedValue({ user: { id: 'ledger-user' } }),
    listUserRights: jest.fn().mockResolvedValue({ rights: [{ kind: { ParticipantAdmin: {} } }] }),
    listPackages: jest.fn().mockResolvedValue({ packageIds: ['pkg-1'] }),
    getConnectedSynchronizers: jest.fn().mockResolvedValue({ connectedSynchronizers: [{ synchronizerId: SYNC }] }),
    interactiveSubmissionGetPreferredPackages: jest
      .fn()
      .mockResolvedValue({ packageReferences: [], synchronizerId: SYNC }),
    uploadDar: jest.fn().mockResolvedValue({}),
  } as unknown as LedgerJsonApiClient;
}

describe('createDaRegistryLedger', () => {
  it('reads active contracts scoped to the configured synchronizer', async () => {
    const client = mockClient();
    const ledger = createDaRegistryLedger(client, {
      synchronizerId: SYNC,
      packageIdSelectionPreference: ['pkg-1'],
    });

    await ledger.activeContracts(
      ['ota::1220bb'],
      ['#utility-registry-v0:Utility.Registry.V0.Rule.Transfer:TransferRule']
    );

    expect(client.getActiveContracts).toHaveBeenCalledWith({
      parties: ['ota::1220bb'],
      templateIds: ['#utility-registry-v0:Utility.Registry.V0.Rule.Transfer:TransferRule'],
    });
  });

  it('submits on the configured synchronizer with the package-id preference', async () => {
    const client = mockClient();
    const ledger = createDaRegistryLedger(client, {
      synchronizerId: SYNC,
      packageIdSelectionPreference: ['pkg-1'],
    });
    const submission: LedgerSubmission = {
      commandIdPrefix: 'test-step',
      actAs: ['ota::1220bb'],
      commands: [
        {
          ExerciseCommand: {
            templateId: '#utility-registry-v0:Utility.Registry.V0.Rule.Transfer:TransferRule',
            contractId: 'cid-1',
            choice: 'Archive',
            choiceArgument: {},
          },
        },
      ],
    };

    const result = await ledger.submit(submission);

    expect(result.updateId).toBe('u-1');
    expect(client.submitAndWaitForTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        actAs: ['ota::1220bb'],
        synchronizerId: SYNC,
        packageIdSelectionPreference: ['pkg-1'],
      })
    );
  });

  it('delegates access, package, synchronizer and DAR operations', async () => {
    const client = mockClient();
    const ledger = createDaRegistryLedger(client, {
      synchronizerId: SYNC,
      packageIdSelectionPreference: [],
    });

    await expect(ledger.checkActAs(['ota::1220bb'])).resolves.toEqual({
      userId: 'ledger-user',
      missing: ['ota::1220bb'],
      participantAdmin: true,
    });
    await expect(ledger.listPackageIds()).resolves.toEqual(['pkg-1']);
    await expect(ledger.connectedSynchronizerIds('ota::1220bb')).resolves.toEqual([SYNC]);
    await ledger.preferredPackages(['ota::1220bb'], ['utility-registry-v0'], SYNC);
    expect(client.interactiveSubmissionGetPreferredPackages).toHaveBeenCalledWith({
      packageVettingRequirements: [{ parties: ['ota::1220bb'], packageName: 'utility-registry-v0' }],
      synchronizerId: SYNC,
    });
    const dar = Buffer.from('dar');
    await ledger.uploadDar(dar, SYNC);
    expect(client.uploadDar).toHaveBeenCalledWith({ darFile: dar, vetAllPackages: true, synchronizerId: SYNC });
  });
});
