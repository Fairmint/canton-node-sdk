import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { prepareExternalTransaction } from '../../../src/utils/external-signing/prepare-external-transaction';

const createMockLedgerClient = (): jest.Mocked<LedgerJsonApiClient> =>
  ({
    interactiveSubmissionPrepare: jest.fn().mockResolvedValue({
      preparedTransaction: 'prepared-tx-base64',
      preparedTransactionHash: 'hash-abc123',
    }),
  }) as unknown as jest.Mocked<LedgerJsonApiClient>;

describe('prepareExternalTransaction', () => {
  let mockClient: jest.Mocked<LedgerJsonApiClient>;

  beforeEach(() => {
    mockClient = createMockLedgerClient();
  });

  it('prepares external transaction and returns result with commandId', async () => {
    const result = await prepareExternalTransaction({
      ledgerClient: mockClient,
      commands: [{ CreateCommand: { templateId: 'pkg:Module:Template', createArguments: {} } }],
      userId: 'user-123',
      actAs: ['party::fingerprint'],
      synchronizerId: 'sync-123',
    });

    expect(result.preparedTransaction).toBe('prepared-tx-base64');
    expect(result.preparedTransactionHash).toBe('hash-abc123');
    expect(result.commandId).toBeDefined();
    expect(typeof result.commandId).toBe('string');
  });

  it('uses provided commandId', async () => {
    const result = await prepareExternalTransaction({
      ledgerClient: mockClient,
      commands: [],
      userId: 'user-123',
      actAs: ['party::fingerprint'],
      synchronizerId: 'sync-123',
      commandId: 'custom-command-id',
    });

    expect(result.commandId).toBe('custom-command-id');
    expect(mockClient.interactiveSubmissionPrepare).toHaveBeenCalledWith(
      expect.objectContaining({
        commandId: 'custom-command-id',
      })
    );
  });

  it('generates UUID commandId when not provided', async () => {
    const result = await prepareExternalTransaction({
      ledgerClient: mockClient,
      commands: [],
      userId: 'user-123',
      actAs: ['party::fingerprint'],
      synchronizerId: 'sync-123',
    });

    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    expect(result.commandId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('passes required parameters to ledger client', async () => {
    await prepareExternalTransaction({
      ledgerClient: mockClient,
      commands: [{ CreateCommand: { templateId: 'pkg:Module:Template', createArguments: { foo: 'bar' } } }],
      userId: 'user-123',
      actAs: ['party1::fp', 'party2::fp'],
      synchronizerId: 'sync-123',
    });

    expect(mockClient.interactiveSubmissionPrepare).toHaveBeenCalledWith({
      commands: [{ CreateCommand: { templateId: 'pkg:Module:Template', createArguments: { foo: 'bar' } } }],
      commandId: expect.any(String) as string,
      userId: 'user-123',
      actAs: ['party1::fp', 'party2::fp'],
      readAs: [],
      disclosedContracts: undefined,
      synchronizerId: 'sync-123',
      verboseHashing: false,
      packageIdSelectionPreference: [],
    });
  });

  it('passes optional readAs parameter', async () => {
    await prepareExternalTransaction({
      ledgerClient: mockClient,
      commands: [],
      userId: 'user-123',
      actAs: ['party::fingerprint'],
      synchronizerId: 'sync-123',
      readAs: ['read-party1::fp', 'read-party2::fp'],
    });

    expect(mockClient.interactiveSubmissionPrepare).toHaveBeenCalledWith(
      expect.objectContaining({
        readAs: ['read-party1::fp', 'read-party2::fp'],
      })
    );
  });

  it('passes optional disclosedContracts parameter', async () => {
    const disclosedContracts = [
      {
        contractId: 'contract-123',
        templateId: 'pkg:Module:Template',
        createdEventBlob: 'blob-123',
        synchronizerId: 'sync-123',
      },
    ];

    await prepareExternalTransaction({
      ledgerClient: mockClient,
      commands: [],
      userId: 'user-123',
      actAs: ['party::fingerprint'],
      synchronizerId: 'sync-123',
      disclosedContracts,
    });

    expect(mockClient.interactiveSubmissionPrepare).toHaveBeenCalledWith(
      expect.objectContaining({
        disclosedContracts,
      })
    );
  });

  it('passes optional verboseHashing parameter', async () => {
    await prepareExternalTransaction({
      ledgerClient: mockClient,
      commands: [],
      userId: 'user-123',
      actAs: ['party::fingerprint'],
      synchronizerId: 'sync-123',
      verboseHashing: true,
    });

    expect(mockClient.interactiveSubmissionPrepare).toHaveBeenCalledWith(
      expect.objectContaining({
        verboseHashing: true,
      })
    );
  });

  it('passes optional packageIdSelectionPreference parameter', async () => {
    await prepareExternalTransaction({
      ledgerClient: mockClient,
      commands: [],
      userId: 'user-123',
      actAs: ['party::fingerprint'],
      synchronizerId: 'sync-123',
      packageIdSelectionPreference: [{ packageId: 'package-1' }, { packageId: 'package-2' }],
    });

    expect(mockClient.interactiveSubmissionPrepare).toHaveBeenCalledWith(
      expect.objectContaining({
        packageIdSelectionPreference: [{ packageId: 'package-1' }, { packageId: 'package-2' }],
      })
    );
  });

  it('defaults verboseHashing to false', async () => {
    await prepareExternalTransaction({
      ledgerClient: mockClient,
      commands: [],
      userId: 'user-123',
      actAs: ['party::fingerprint'],
      synchronizerId: 'sync-123',
    });

    expect(mockClient.interactiveSubmissionPrepare).toHaveBeenCalledWith(
      expect.objectContaining({
        verboseHashing: false,
      })
    );
  });

  it('defaults packageIdSelectionPreference to empty array', async () => {
    await prepareExternalTransaction({
      ledgerClient: mockClient,
      commands: [],
      userId: 'user-123',
      actAs: ['party::fingerprint'],
      synchronizerId: 'sync-123',
    });

    expect(mockClient.interactiveSubmissionPrepare).toHaveBeenCalledWith(
      expect.objectContaining({
        packageIdSelectionPreference: [],
      })
    );
  });

  it('defaults readAs to empty array', async () => {
    await prepareExternalTransaction({
      ledgerClient: mockClient,
      commands: [],
      userId: 'user-123',
      actAs: ['party::fingerprint'],
      synchronizerId: 'sync-123',
    });

    expect(mockClient.interactiveSubmissionPrepare).toHaveBeenCalledWith(
      expect.objectContaining({
        readAs: [],
      })
    );
  });
});
