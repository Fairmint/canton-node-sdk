import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import type { Command, ExerciseCommand } from '../../../src/clients/ledger-json-api/schemas/api/commands';
import type { ValidatorApiClient } from '../../../src/clients/validator-api';
import { transferToPreapproved } from '../../../src/utils/amulet/transfer-to-preapproved';

// Helper to safely extract ExerciseCommand from a Command
const getExerciseCommand = (command: Command | undefined): ExerciseCommand['ExerciseCommand'] | undefined => {
  if (command && 'ExerciseCommand' in command) {
    return command.ExerciseCommand;
  }
  return undefined;
};

// Mock dependencies
jest.mock('../../../src/utils/mining/mining-rounds', () => ({
  getCurrentMiningRoundContext: jest.fn().mockResolvedValue({
    openMiningRound: 'mining-round-contract-123',
    openMiningRoundContract: {
      contractId: 'mining-round-contract-123',
      templateId: 'pkg:Splice.Round:OpenMiningRound',
      createdEventBlob: 'mining-blob-123',
      synchronizerId: 'domain-123',
    },
    issuingMiningRounds: [],
  }),
}));

jest.mock('../../../src/utils/amulet/get-amulets-for-transfer', () => ({
  getAmuletsForTransfer: jest.fn().mockResolvedValue([
    {
      contractId: 'amulet-123',
      templateId: 'pkg:Splice.Amulet:Amulet',
      effectiveAmount: '1000',
      owner: 'sender::fingerprint',
    },
  ]),
}));

const createMockValidatorClient = (): jest.Mocked<ValidatorApiClient> =>
  ({
    getAmuletRules: jest.fn().mockResolvedValue({
      amulet_rules: {
        contract: {
          contract_id: 'amulet-rules-contract-123',
          template_id: 'pkg:Splice.AmuletRules:AmuletRules',
          created_event_blob: 'amulet-rules-blob',
        },
        domain_id: 'domain-123',
      },
    }),
    lookupTransferPreapprovalByParty: jest.fn().mockResolvedValue({
      transfer_preapproval: {
        contract: {
          contract_id: 'preapproval-contract-123',
          template_id: 'pkg:Splice.AmuletRules:TransferPreapproval',
          created_event_blob: 'preapproval-blob',
          created_at: '2026-01-01T00:00:00Z',
          payload: {},
        },
        domain_id: 'domain-123',
      },
    }),
    lookupFeaturedAppRight: jest.fn().mockResolvedValue({
      featured_app_right: {
        contract_id: 'featured-app-right-123',
        template_id: 'pkg:Splice.FeaturedAppRight:FeaturedAppRight',
        created_event_blob: 'featured-blob',
      },
    }),
  }) as unknown as jest.Mocked<ValidatorApiClient>;

const createMockLedgerClient = (): jest.Mocked<LedgerJsonApiClient> =>
  ({
    submitAndWaitForTransactionTree: jest.fn().mockResolvedValue({
      transactionTree: {
        updateId: 'update-123',
        commandId: 'cmd-123',
        effectiveAt: '2026-01-01T00:00:00Z',
        offset: '100',
        eventsById: {},
        rootEventIds: [],
        synchronizerId: 'sync-123',
        traceContext: undefined,
        recordTime: '2026-01-01T00:00:00Z',
      },
    }),
  }) as unknown as jest.Mocked<LedgerJsonApiClient>;

describe('transferToPreapproved', () => {
  let mockLedgerClient: jest.Mocked<LedgerJsonApiClient>;
  let mockValidatorClient: jest.Mocked<ValidatorApiClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLedgerClient = createMockLedgerClient();
    mockValidatorClient = createMockValidatorClient();
  });

  it('transfers to single preapproved recipient', async () => {
    const result = await transferToPreapproved(mockLedgerClient, mockValidatorClient, {
      senderPartyId: 'sender::fingerprint',
      transfers: [{ recipientPartyId: 'recipient::fingerprint', amount: '100', description: 'Test' }],
    });

    expect(result.transferResults).toHaveLength(1);
    expect(result.transferResults[0]?.recipientPartyId).toBe('recipient::fingerprint');
    expect(result.transferResults[0]?.contractId).toBe('preapproval-contract-123');
    expect(result.transferResults[0]?.domainId).toBe('domain-123');
  });

  it('transfers to multiple preapproved recipients', async () => {
    // Setup different preapproval contracts for each recipient
    mockValidatorClient.lookupTransferPreapprovalByParty
      .mockResolvedValueOnce({
        transfer_preapproval: {
          contract: {
            contract_id: 'preapproval-1',
            template_id: 'pkg:Splice.AmuletRules:TransferPreapproval',
            created_event_blob: 'blob-1',
            created_at: '2026-01-01T00:00:00Z',
            payload: {},
          },
          domain_id: 'domain-123',
        },
      })
      .mockResolvedValueOnce({
        transfer_preapproval: {
          contract: {
            contract_id: 'preapproval-2',
            template_id: 'pkg:Splice.AmuletRules:TransferPreapproval',
            created_event_blob: 'blob-2',
            created_at: '2026-01-01T00:00:00Z',
            payload: {},
          },
          domain_id: 'domain-123',
        },
      });

    const result = await transferToPreapproved(mockLedgerClient, mockValidatorClient, {
      senderPartyId: 'sender::fingerprint',
      transfers: [
        { recipientPartyId: 'recipient1::fingerprint', amount: '100' },
        { recipientPartyId: 'recipient2::fingerprint', amount: '50' },
      ],
    });

    expect(result.transferResults).toHaveLength(2);
    expect(mockLedgerClient.submitAndWaitForTransactionTree).toHaveBeenCalledTimes(2);
  });

  it('throws when no transfers provided', async () => {
    await expect(
      transferToPreapproved(mockLedgerClient, mockValidatorClient, {
        senderPartyId: 'sender::fingerprint',
        transfers: [],
      })
    ).rejects.toThrow('At least one transfer must be provided');
  });

  it('throws when sender has no amulets', async () => {
    const { getAmuletsForTransfer } = await import('../../../src/utils/amulet/get-amulets-for-transfer');
    (getAmuletsForTransfer as jest.Mock).mockResolvedValueOnce([]);

    await expect(
      transferToPreapproved(mockLedgerClient, mockValidatorClient, {
        senderPartyId: 'sender::fingerprint',
        transfers: [{ recipientPartyId: 'recipient::fingerprint', amount: '100' }],
      })
    ).rejects.toThrow('No unlocked amulets found for sender party sender::fingerprint');
  });

  it('throws when recipient has no preapproval domain ID', async () => {
    mockValidatorClient.lookupTransferPreapprovalByParty.mockResolvedValue({
      transfer_preapproval: {
        contract: {
          contract_id: 'preapproval-123',
          template_id: 'pkg:Splice.AmuletRules:TransferPreapproval',
          created_event_blob: 'blob',
          created_at: '2026-01-01T00:00:00Z',
          payload: {},
        },
        domain_id: '', // Empty domain ID
      },
    });

    await expect(
      transferToPreapproved(mockLedgerClient, mockValidatorClient, {
        senderPartyId: 'sender::fingerprint',
        transfers: [{ recipientPartyId: 'recipient::fingerprint', amount: '100' }],
      })
    ).rejects.toThrow('No domain ID found for transfer preapproval for party recipient::fingerprint');
  });

  it('throws when recipient has no featured app right', async () => {
    mockValidatorClient.lookupFeaturedAppRight.mockResolvedValue({});

    await expect(
      transferToPreapproved(mockLedgerClient, mockValidatorClient, {
        senderPartyId: 'sender::fingerprint',
        transfers: [{ recipientPartyId: 'recipient::fingerprint', amount: '100' }],
      })
    ).rejects.toThrow('No featured app right found for party recipient::fingerprint');
  });

  it('submits correct command structure', async () => {
    await transferToPreapproved(mockLedgerClient, mockValidatorClient, {
      senderPartyId: 'sender::fingerprint',
      transfers: [{ recipientPartyId: 'recipient::fingerprint', amount: '100', description: 'Payment' }],
    });

    const callArgs = mockLedgerClient.submitAndWaitForTransactionTree.mock.calls[0]?.[0];
    expect(callArgs?.commands).toHaveLength(1);

    const exerciseCmd = getExerciseCommand(callArgs?.commands[0]);
    expect(exerciseCmd?.templateId).toBe('#splice-amulet:Splice.AmuletRules:TransferPreapproval');
    expect(exerciseCmd?.contractId).toBe('preapproval-contract-123');
    expect(exerciseCmd?.choice).toBe('TransferPreapproval_Send');
    expect(exerciseCmd?.choiceArgument).toMatchObject({
      amount: '100',
      sender: 'sender::fingerprint',
      description: 'Payment',
    });
  });

  it('uses null for description when not provided', async () => {
    await transferToPreapproved(mockLedgerClient, mockValidatorClient, {
      senderPartyId: 'sender::fingerprint',
      transfers: [{ recipientPartyId: 'recipient::fingerprint', amount: '100' }],
    });

    const callArgs = mockLedgerClient.submitAndWaitForTransactionTree.mock.calls[0]?.[0];
    const exerciseCmd = getExerciseCommand(callArgs?.commands[0]);
    expect(exerciseCmd?.choiceArgument['description']).toBeNull();
  });

  it('uses sender as actAs', async () => {
    await transferToPreapproved(mockLedgerClient, mockValidatorClient, {
      senderPartyId: 'sender::fingerprint',
      transfers: [{ recipientPartyId: 'recipient::fingerprint', amount: '100' }],
    });

    const callArgs = mockLedgerClient.submitAndWaitForTransactionTree.mock.calls[0]?.[0];
    expect(callArgs?.actAs).toEqual(['sender::fingerprint']);
  });

  it('includes disclosed contracts', async () => {
    await transferToPreapproved(mockLedgerClient, mockValidatorClient, {
      senderPartyId: 'sender::fingerprint',
      transfers: [{ recipientPartyId: 'recipient::fingerprint', amount: '100' }],
    });

    const callArgs = mockLedgerClient.submitAndWaitForTransactionTree.mock.calls[0]?.[0];
    expect(callArgs?.disclosedContracts).toBeDefined();
    expect(callArgs?.disclosedContracts?.length).toBeGreaterThan(0);

    // Should include amulet rules, mining round, featured app right, and preapproval contracts
    const contractIds = callArgs?.disclosedContracts?.map((c: { contractId: string }) => c.contractId) ?? [];
    expect(contractIds).toContain('amulet-rules-contract-123');
    expect(contractIds).toContain('mining-round-contract-123');
    expect(contractIds).toContain('featured-app-right-123');
    expect(contractIds).toContain('preapproval-contract-123');
  });

  it('includes amulet inputs in command', async () => {
    await transferToPreapproved(mockLedgerClient, mockValidatorClient, {
      senderPartyId: 'sender::fingerprint',
      transfers: [{ recipientPartyId: 'recipient::fingerprint', amount: '100' }],
    });

    const callArgs = mockLedgerClient.submitAndWaitForTransactionTree.mock.calls[0]?.[0];
    const exerciseCmd = getExerciseCommand(callArgs?.commands[0]);
    expect(exerciseCmd?.choiceArgument['inputs']).toEqual([{ tag: 'InputAmulet', value: 'amulet-123' }]);
  });

  it('fetches network information', async () => {
    await transferToPreapproved(mockLedgerClient, mockValidatorClient, {
      senderPartyId: 'sender::fingerprint',
      transfers: [{ recipientPartyId: 'recipient::fingerprint', amount: '100' }],
    });

    expect(mockValidatorClient.getAmuletRules).toHaveBeenCalledTimes(1);
    expect(mockValidatorClient.lookupTransferPreapprovalByParty).toHaveBeenCalledWith({
      partyId: 'recipient::fingerprint',
    });
    expect(mockValidatorClient.lookupFeaturedAppRight).toHaveBeenCalledWith({
      partyId: 'recipient::fingerprint',
    });
  });

  it('generates unique command IDs per transfer', async () => {
    mockValidatorClient.lookupTransferPreapprovalByParty
      .mockResolvedValueOnce({
        transfer_preapproval: {
          contract: {
            contract_id: 'preapproval-1',
            template_id: 'pkg:Splice.AmuletRules:TransferPreapproval',
            created_event_blob: 'blob-1',
            created_at: '2026-01-01T00:00:00Z',
            payload: {},
          },
          domain_id: 'domain-123',
        },
      })
      .mockResolvedValueOnce({
        transfer_preapproval: {
          contract: {
            contract_id: 'preapproval-2',
            template_id: 'pkg:Splice.AmuletRules:TransferPreapproval',
            created_event_blob: 'blob-2',
            created_at: '2026-01-01T00:00:00Z',
            payload: {},
          },
          domain_id: 'domain-123',
        },
      });

    await transferToPreapproved(mockLedgerClient, mockValidatorClient, {
      senderPartyId: 'sender::fingerprint',
      transfers: [
        { recipientPartyId: 'recipient1::fingerprint', amount: '100' },
        { recipientPartyId: 'recipient2::fingerprint', amount: '50' },
      ],
    });

    const call1CommandId = mockLedgerClient.submitAndWaitForTransactionTree.mock.calls[0]?.[0]?.commandId;
    const call2CommandId = mockLedgerClient.submitAndWaitForTransactionTree.mock.calls[1]?.[0]?.commandId;

    expect(call1CommandId).not.toBe(call2CommandId);
    expect(call1CommandId).toContain('recipient1::fingerprint');
    expect(call2CommandId).toContain('recipient2::fingerprint');
  });

  it('throws when amulet rules domain ID is missing', async () => {
    mockValidatorClient.getAmuletRules.mockResolvedValue({
      amulet_rules: {
        contract: {
          contract_id: 'amulet-rules-contract-123',
          template_id: 'pkg:Splice.AmuletRules:AmuletRules',
          created_event_blob: 'amulet-rules-blob',
          created_at: '2026-01-01T00:00:00Z',
          payload: {},
        },
        domain_id: '', // Empty
      },
    });

    await expect(
      transferToPreapproved(mockLedgerClient, mockValidatorClient, {
        senderPartyId: 'sender::fingerprint',
        transfers: [{ recipientPartyId: 'recipient::fingerprint', amount: '100' }],
      })
    ).rejects.toThrow('Amulet rules domain ID is required');
  });
});
