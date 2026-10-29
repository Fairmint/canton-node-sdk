import { type LedgerJsonApiClient } from '../../../src/clients';
import {
  checkUserActAs,
  getActiveContractsByTemplate,
  getConnectedSynchronizerIds,
  getPreferredPackages,
  listUploadedPackageIds,
  resolveLedgerVisibility,
  submitLedgerCommands,
  uploadAndVetDar,
  type LedgerSubmission,
} from '../../../src/utils/ledger';

const SYNC = 'global-domain::1220aaaa';

const activeItem = (
  contractId: string,
  templateId: string,
  synchronizerId = SYNC,
  createArgument: Record<string, unknown> = {}
): Record<string, unknown> => ({
  workflowId: `wf-${contractId}`,
  contractEntry: {
    JsActiveContract: {
      synchronizerId,
      reassignmentCounter: 0,
      createdEvent: {
        offset: 1,
        nodeId: 1,
        contractId,
        templateId,
        contractKey: null,
        createArgument,
        createdEventBlob: `blob-${contractId}`,
        interfaceViews: [],
        witnessParties: [],
        signatories: [],
        observers: [],
        createdAt: '2026-01-01T00:00:00Z',
        packageName: 'utility-registry-app-v0',
      },
    },
  },
});

function mockClient(overrides: Record<string, unknown> = {}): LedgerJsonApiClient {
  return {
    getActiveContracts: jest.fn().mockResolvedValue([]),
    submitAndWaitForTransaction: jest.fn().mockResolvedValue({ transaction: { updateId: 'update-1', events: [] } }),
    getAuthenticatedUser: jest.fn().mockResolvedValue({ user: { id: 'ledger-user' } }),
    listUserRights: jest.fn().mockResolvedValue({ rights: [] }),
    listPackages: jest.fn().mockResolvedValue({ packageIds: ['pkg-1', 'pkg-2'] }),
    getConnectedSynchronizers: jest.fn().mockResolvedValue({ connectedSynchronizers: [{ synchronizerId: SYNC }] }),
    interactiveSubmissionGetPreferredPackages: jest.fn().mockResolvedValue({
      packageReferences: [{ packageName: 'utility-registry-v0', packageId: 'pkg-1', packageVersion: '0.8.2' }],
      synchronizerId: SYNC,
    }),
    uploadDar: jest.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as LedgerJsonApiClient;
}

describe('getActiveContractsByTemplate', () => {
  it('unwraps active contracts and drops empty pages', async () => {
    const client = mockClient({
      getActiveContracts: jest
        .fn()
        .mockResolvedValue([
          activeItem('cid-1', 'deadbeef:Utility.Registry.V0.Rule.Transfer:TransferRule', SYNC, { operator: 'op' }),
          { contractEntry: { JsEmpty: {} } },
        ]),
    });

    const contracts = await getActiveContractsByTemplate(client, {
      parties: ['alice::1220aa'],
      templateIds: ['#utility-registry-v0:Utility.Registry.V0.Rule.Transfer:TransferRule'],
    });

    expect(contracts).toEqual([
      {
        contractId: 'cid-1',
        templateId: 'deadbeef:Utility.Registry.V0.Rule.Transfer:TransferRule',
        createArgument: { operator: 'op' },
        synchronizerId: SYNC,
        createdEventBlob: 'blob-cid-1',
      },
    ]);
    expect(client.getActiveContracts).toHaveBeenCalledWith({
      parties: ['alice::1220aa'],
      templateIds: ['#utility-registry-v0:Utility.Registry.V0.Rule.Transfer:TransferRule'],
    });
  });

  it('keeps only contracts on the requested synchronizer', async () => {
    const client = mockClient({
      getActiveContracts: jest
        .fn()
        .mockResolvedValue([
          activeItem('cid-1', 'pkg:M:E', SYNC),
          activeItem('cid-2', 'pkg:M:E', 'other-sync::1220bb'),
        ]),
    });

    const contracts = await getActiveContractsByTemplate(client, {
      parties: ['alice::1220aa'],
      templateIds: ['#pkg:M:E'],
      synchronizerId: SYNC,
    });

    expect(contracts.map((c) => c.contractId)).toEqual(['cid-1']);
  });

  it('passes includeCreatedEventBlob through', async () => {
    const client = mockClient();
    await getActiveContractsByTemplate(client, {
      parties: ['alice::1220aa'],
      templateIds: ['#pkg:M:E'],
      includeCreatedEventBlob: true,
    });
    expect(client.getActiveContracts).toHaveBeenCalledWith(expect.objectContaining({ includeCreatedEventBlob: true }));
  });

  it('rejects an empty party list instead of falling back to the client default party', async () => {
    const client = mockClient();
    await expect(getActiveContractsByTemplate(client, { parties: [], templateIds: ['#pkg:M:E'] })).rejects.toThrow(
      /at least one party/
    );
    expect(client.getActiveContracts).not.toHaveBeenCalled();
  });
});

describe('submitLedgerCommands', () => {
  const submission: LedgerSubmission = {
    commandIdPrefix: 'da-registry-devnet-supply',
    actAs: ['ota::1220aa'],
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

  it('submits with a unique prefixed command id and returns created contracts', async () => {
    const submit = jest.fn().mockResolvedValue({
      transaction: {
        updateId: 'update-9',
        events: [
          {
            CreatedEvent: {
              contractId: 'cid-new',
              templateId: 'pkg:M:E',
              createArgument: {},
              witnessParties: [],
              signatories: [],
              observers: [],
              createdAt: '2026-01-01T00:00:00Z',
              packageName: 'pkg',
            },
          },
        ],
      },
    });
    const client = mockClient({ submitAndWaitForTransaction: submit });

    const result = await submitLedgerCommands(client, submission, {
      synchronizerId: SYNC,
      packageIdSelectionPreference: ['pkg-1'],
    });

    expect(result.updateId).toBe('update-9');
    expect(result.created).toEqual([{ contractId: 'cid-new', templateId: 'pkg:M:E' }]);
    const params = submit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params['synchronizerId']).toBe(SYNC);
    expect(params['actAs']).toEqual(['ota::1220aa']);
    expect(params['packageIdSelectionPreference']).toEqual(['pkg-1']);
    expect(String(params['commandId'])).toMatch(/^da-registry-devnet-supply-[0-9a-f-]{36}$/);
  });

  it('accepts a readonly package-id preference and copies it', async () => {
    const submit = jest.fn().mockResolvedValue({ transaction: { updateId: 'u', events: [] } });
    const client = mockClient({ submitAndWaitForTransaction: submit });
    const pins = ['pkg-1', 'pkg-2'] as const;

    await submitLedgerCommands(client, submission, { synchronizerId: SYNC, packageIdSelectionPreference: pins });

    const params = submit.mock.calls[0]?.[0] as { packageIdSelectionPreference?: string[] };
    expect(params.packageIdSelectionPreference).toEqual(['pkg-1', 'pkg-2']);
    expect(params.packageIdSelectionPreference).not.toBe(pins);
  });

  it('omits disclosed contracts and package preference when absent, and unique-ifies repeated submissions', async () => {
    const submit = jest.fn().mockResolvedValue({ transaction: { updateId: 'u', events: [] } });
    const client = mockClient({ submitAndWaitForTransaction: submit });

    await submitLedgerCommands(client, submission, { synchronizerId: SYNC });
    await submitLedgerCommands(client, submission, { synchronizerId: SYNC });

    const first = submit.mock.calls[0]?.[0] as Record<string, unknown>;
    const second = submit.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(first['disclosedContracts']).toBeUndefined();
    expect(first['packageIdSelectionPreference']).toBeUndefined();
    expect(first['commandId']).not.toBe(second['commandId']);
  });

  it('passes disclosed contracts through when present', async () => {
    const submit = jest.fn().mockResolvedValue({ transaction: { updateId: 'u', events: [] } });
    const client = mockClient({ submitAndWaitForTransaction: submit });
    const disclosed = [{ templateId: 'pkg:M:E', contractId: 'cid-1', createdEventBlob: 'blob', synchronizerId: SYNC }];

    await submitLedgerCommands(client, { ...submission, disclosedContracts: disclosed }, { synchronizerId: SYNC });

    expect((submit.mock.calls[0]?.[0] as Record<string, unknown>)['disclosedContracts']).toEqual(disclosed);
  });
});

describe('checkUserActAs', () => {
  it('reports parties the user cannot act as and participant admin', async () => {
    const client = mockClient({
      listUserRights: jest.fn().mockResolvedValue({
        rights: [
          { kind: { CanActAs: { party: 'alice::1220aa' } } },
          { kind: { ParticipantAdmin: {} } },
          { kind: { CanReadAs: { party: 'carol::1220cc' } } },
        ],
      }),
    });

    const status = await checkUserActAs(client, ['alice::1220aa', 'bob::1220bb']);

    expect(status).toEqual({ userId: 'ledger-user', missing: ['bob::1220bb'], participantAdmin: true });
  });

  it('accepts the request-shaped right nesting under `value`', async () => {
    const client = mockClient({
      listUserRights: jest
        .fn()
        .mockResolvedValue({ rights: [{ kind: { CanActAs: { value: { party: 'alice::1220aa' } } } }] }),
    });

    const status = await checkUserActAs(client, ['alice::1220aa']);

    expect(status.missing).toEqual([]);
    expect(status.participantAdmin).toBe(false);
  });

  it('throws when the ledger returns no user', async () => {
    const client = mockClient({ getAuthenticatedUser: jest.fn().mockResolvedValue({}) });
    await expect(checkUserActAs(client, [])).rejects.toThrow('authenticated user');
  });
});

describe('resolveLedgerVisibility', () => {
  it('detects CanReadAsAnyParty and unions CanActAs and CanReadAs in both right shapes', async () => {
    const listUserRights = jest.fn().mockResolvedValue({
      rights: [
        { kind: { CanActAs: { party: 'alice::1220aa' } } },
        { kind: { CanReadAs: { value: { party: 'carol::1220cc' } } } },
        { kind: { CanActAs: { value: { party: 'bob::1220bb' } } } },
        { kind: { CanReadAs: { party: 'alice::1220aa' } } },
        { kind: { CanExecuteAs: { value: { party: 'dave::1220dd' } } } },
        { kind: { CanReadAsAnyParty: { value: {} } } },
        { kind: { ParticipantAdmin: {} } },
      ],
    });
    const client = mockClient({ listUserRights });

    await expect(resolveLedgerVisibility(client)).resolves.toEqual({
      userId: 'ledger-user',
      canReadAsAnyParty: true,
      readableParties: ['alice::1220aa', 'bob::1220bb', 'carol::1220cc'],
      participantAdmin: true,
    });
    expect(listUserRights).toHaveBeenCalledWith({ userId: 'ledger-user' });
  });

  it('accepts the unwrapped CanReadAsAnyParty shape', async () => {
    const client = mockClient({
      listUserRights: jest.fn().mockResolvedValue({ rights: [{ kind: { CanReadAsAnyParty: {} } }] }),
    });

    await expect(resolveLedgerVisibility(client)).resolves.toMatchObject({
      canReadAsAnyParty: true,
      readableParties: [],
      participantAdmin: false,
    });
  });

  it('does not treat CanExecuteAsAnyParty, ParticipantAdmin or IdentityProviderAdmin as read rights', async () => {
    const client = mockClient({
      listUserRights: jest.fn().mockResolvedValue({
        rights: [
          { kind: { CanExecuteAsAnyParty: { value: {} } } },
          { kind: { ParticipantAdmin: { value: {} } } },
          { kind: { IdentityProviderAdmin: { value: {} } } },
        ],
      }),
    });

    await expect(resolveLedgerVisibility(client)).resolves.toEqual({
      userId: 'ledger-user',
      canReadAsAnyParty: false,
      readableParties: [],
      participantAdmin: true,
    });
  });

  it('checks the given user without asking for the authenticated one', async () => {
    const getAuthenticatedUser = jest.fn();
    const listUserRights = jest.fn().mockResolvedValue({ rights: [] });
    const client = mockClient({ getAuthenticatedUser, listUserRights });

    await expect(resolveLedgerVisibility(client, { userId: 'saver' })).resolves.toEqual({
      userId: 'saver',
      canReadAsAnyParty: false,
      readableParties: [],
      participantAdmin: false,
    });
    expect(getAuthenticatedUser).not.toHaveBeenCalled();
    expect(listUserRights).toHaveBeenCalledWith({ userId: 'saver' });
  });

  it('throws when the ledger returns no user', async () => {
    const client = mockClient({ getAuthenticatedUser: jest.fn().mockResolvedValue({}) });
    await expect(resolveLedgerVisibility(client)).rejects.toThrow('authenticated user');
  });
});

describe('package and synchronizer helpers', () => {
  it('listUploadedPackageIds returns the uploaded package ids', async () => {
    await expect(listUploadedPackageIds(mockClient())).resolves.toEqual(['pkg-1', 'pkg-2']);
  });

  it('getPreferredPackages maps names to vetting requirements', async () => {
    const client = mockClient();
    const result = await getPreferredPackages(client, {
      parties: ['ota::1220aa', 'operator::1220bb'],
      packageNames: ['utility-registry-v0'],
      synchronizerId: SYNC,
    });

    expect(result).toEqual([{ packageName: 'utility-registry-v0', packageId: 'pkg-1', packageVersion: '0.8.2' }]);
    expect(client.interactiveSubmissionGetPreferredPackages).toHaveBeenCalledWith({
      packageVettingRequirements: [
        { parties: ['ota::1220aa', 'operator::1220bb'], packageName: 'utility-registry-v0' },
      ],
      synchronizerId: SYNC,
    });
  });

  it('uploadAndVetDar uploads with vetting on the given synchronizer', async () => {
    const client = mockClient();
    const dar = Buffer.from('dar-bytes');

    await uploadAndVetDar(client, { darFile: dar, synchronizerId: SYNC });

    expect(client.uploadDar).toHaveBeenCalledWith({ darFile: dar, vetAllPackages: true, synchronizerId: SYNC });
  });

  it('getConnectedSynchronizerIds returns the synchronizer ids', async () => {
    const client = mockClient();
    await expect(getConnectedSynchronizerIds(client, 'alice::1220aa')).resolves.toEqual([SYNC]);
    expect(client.getConnectedSynchronizers).toHaveBeenCalledWith({ party: 'alice::1220aa' });
  });
});
