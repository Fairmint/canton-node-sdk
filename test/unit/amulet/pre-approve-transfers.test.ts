import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import type { CompositeCommand, ExerciseCommand } from '../../../src/clients/ledger-json-api/schemas/api/commands';
import type { ValidatorApiClient } from '../../../src/clients/validator-api';
import { preApproveTransfers } from '../../../src/utils/amulet/pre-approve-transfers';

// Helper to safely extract ExerciseCommand from a CompositeCommand
const getExerciseCommand = (command: CompositeCommand | undefined): ExerciseCommand['ExerciseCommand'] | undefined => {
  if (command && 'ExerciseCommand' in command) {
    return command.ExerciseCommand;
  }
  return undefined;
};

// Mock the dependencies
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
      owner: 'receiver::fingerprint',
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
    getDsoPartyId: jest.fn().mockResolvedValue({
      dso_party_id: 'dso-party::fingerprint',
    }),
    lookupFeaturedAppRight: jest.fn().mockResolvedValue({
      featured_app_right: {
        contract_id: 'featured-app-right-123',
        template_id: 'pkg:Splice.FeaturedAppRight:FeaturedAppRight',
        created_event_blob: 'featured-blob',
      },
    }),
  }) as unknown as jest.Mocked<ValidatorApiClient>;

interface MockTransactionTreeResponse {
  transactionTree: {
    updateId: string;
    commandId: string;
    effectiveAt: string;
    offset: string;
    eventsById: Record<string, { CreatedTreeEvent: { value: { contractId: string; templateId: string } } }>;
    rootEventIds: string[];
    synchronizerId: string;
    traceContext: undefined;
    recordTime: string;
  };
}

const createMockLedgerClient = (transactionTreeResponse: unknown): jest.Mocked<LedgerJsonApiClient> =>
  ({
    submitAndWaitForTransactionTree: jest.fn().mockResolvedValue(transactionTreeResponse),
  }) as unknown as jest.Mocked<LedgerJsonApiClient>;

const createTransactionTreeResponse = (preapprovalContractId: string): MockTransactionTreeResponse => ({
  transactionTree: {
    updateId: 'update-123',
    commandId: 'cmd-123',
    effectiveAt: '2026-01-01T00:00:00Z',
    offset: '100',
    eventsById: {
      '1': {
        CreatedTreeEvent: {
          value: {
            contractId: preapprovalContractId,
            templateId: 'pkg:Splice.AmuletRules:TransferPreapproval',
          },
        },
      },
    },
    rootEventIds: ['1'],
    synchronizerId: 'sync-123',
    traceContext: undefined,
    recordTime: '2026-01-01T00:00:00Z',
  },
});

describe('preApproveTransfers', () => {
  let mockLedgerClient: jest.Mocked<LedgerJsonApiClient>;
  let mockValidatorClient: jest.Mocked<ValidatorApiClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockValidatorClient = createMockValidatorClient();
    mockLedgerClient = createMockLedgerClient(createTransactionTreeResponse('preapproval-contract-123'));
  });

  it('creates transfer preapproval and returns result', async () => {
    const result = await preApproveTransfers(mockLedgerClient, mockValidatorClient, {
      receiverPartyId: 'receiver::fingerprint',
    });

    expect(result.contractId).toBe('preapproval-contract-123');
    expect(result.domainId).toBe('domain-123');
    expect(result.amuletPaid).toBe('0');
  });

  it('fetches required network information', async () => {
    await preApproveTransfers(mockLedgerClient, mockValidatorClient, {
      receiverPartyId: 'receiver::fingerprint',
    });

    expect(mockValidatorClient.getAmuletRules).toHaveBeenCalledTimes(1);
    expect(mockValidatorClient.getDsoPartyId).toHaveBeenCalledTimes(1);
    expect(mockValidatorClient.lookupFeaturedAppRight).toHaveBeenCalledWith({
      partyId: 'receiver::fingerprint',
    });
  });

  it('submits correct command structure', async () => {
    await preApproveTransfers(mockLedgerClient, mockValidatorClient, {
      receiverPartyId: 'receiver::fingerprint',
    });

    expect(mockLedgerClient.submitAndWaitForTransactionTree).toHaveBeenCalledTimes(1);
    const callArgs = mockLedgerClient.submitAndWaitForTransactionTree.mock.calls[0]?.[0];

    expect(callArgs?.commands).toHaveLength(1);
    const command = callArgs?.commands[0];
    expect(command).toHaveProperty('ExerciseCommand');
    const exerciseCmd = getExerciseCommand(command);
    expect(exerciseCmd?.choice).toBe('AmuletRules_CreateTransferPreapproval');
    expect(exerciseCmd?.choiceArgument).toMatchObject({
      receiver: 'receiver::fingerprint',
      expectedDso: 'dso-party::fingerprint',
    });
  });

  it('uses receiverPartyId as providerPartyId by default', async () => {
    await preApproveTransfers(mockLedgerClient, mockValidatorClient, {
      receiverPartyId: 'receiver::fingerprint',
    });

    const callArgs = mockLedgerClient.submitAndWaitForTransactionTree.mock.calls[0]?.[0];
    const exerciseCmd = getExerciseCommand(callArgs?.commands[0]);
    expect(exerciseCmd?.choiceArgument['provider']).toBe('receiver::fingerprint');
  });

  it('uses custom providerPartyId when provided', async () => {
    await preApproveTransfers(mockLedgerClient, mockValidatorClient, {
      receiverPartyId: 'receiver::fingerprint',
      providerPartyId: 'provider::fingerprint',
    });

    const callArgs = mockLedgerClient.submitAndWaitForTransactionTree.mock.calls[0]?.[0];
    const exerciseCmd = getExerciseCommand(callArgs?.commands[0]);
    expect(exerciseCmd?.choiceArgument['provider']).toBe('provider::fingerprint');
  });

  it('uses custom expiresAt when provided', async () => {
    const customExpiry = new Date('2026-12-31T23:59:59Z');

    await preApproveTransfers(mockLedgerClient, mockValidatorClient, {
      receiverPartyId: 'receiver::fingerprint',
      expiresAt: customExpiry,
    });

    const callArgs = mockLedgerClient.submitAndWaitForTransactionTree.mock.calls[0]?.[0];
    const exerciseCmd = getExerciseCommand(callArgs?.commands[0]);
    expect(exerciseCmd?.choiceArgument['expiresAt']).toBe('2026-12-31T23:59:59.000Z');
  });

  it('defaults expiresAt to 1 year from now', async () => {
    const beforeCall = Date.now();

    await preApproveTransfers(mockLedgerClient, mockValidatorClient, {
      receiverPartyId: 'receiver::fingerprint',
    });

    const callArgs = mockLedgerClient.submitAndWaitForTransactionTree.mock.calls[0]?.[0];
    const exerciseCmd = getExerciseCommand(callArgs?.commands[0]);
    const expiresAtStr = exerciseCmd?.choiceArgument['expiresAt'] as string;
    const expiresAt = new Date(expiresAtStr).getTime();

    // Should be roughly 365 days from now
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    const expectedMinExpiry = beforeCall + oneYear - 5000;
    const expectedMaxExpiry = beforeCall + oneYear + 5000;

    expect(expiresAt).toBeGreaterThan(expectedMinExpiry);
    expect(expiresAt).toBeLessThan(expectedMaxExpiry);
  });

  it('includes disclosed contracts', async () => {
    await preApproveTransfers(mockLedgerClient, mockValidatorClient, {
      receiverPartyId: 'receiver::fingerprint',
    });

    const callArgs = mockLedgerClient.submitAndWaitForTransactionTree.mock.calls[0]?.[0];
    expect(callArgs?.disclosedContracts).toBeDefined();
    expect(callArgs?.disclosedContracts?.length).toBeGreaterThan(0);

    // Should include AmuletRules contract
    const amuletRulesContract = callArgs?.disclosedContracts?.find((c) => c.contractId === 'amulet-rules-contract-123');
    expect(amuletRulesContract).toBeDefined();

    // Should include mining round contract
    const miningRoundContract = callArgs?.disclosedContracts?.find((c) => c.contractId === 'mining-round-contract-123');
    expect(miningRoundContract).toBeDefined();
  });

  it('includes featured app right in disclosed contracts when available', async () => {
    await preApproveTransfers(mockLedgerClient, mockValidatorClient, {
      receiverPartyId: 'receiver::fingerprint',
    });

    const callArgs = mockLedgerClient.submitAndWaitForTransactionTree.mock.calls[0]?.[0];
    const featuredContract = callArgs?.disclosedContracts?.find((c) => c.contractId === 'featured-app-right-123');
    expect(featuredContract).toBeDefined();
  });

  it('handles missing featured app right', async () => {
    mockValidatorClient.lookupFeaturedAppRight.mockResolvedValue({});

    const result = await preApproveTransfers(mockLedgerClient, mockValidatorClient, {
      receiverPartyId: 'receiver::fingerprint',
    });

    expect(result.contractId).toBe('preapproval-contract-123');

    // Should still work, just without featured app right contract
    const callArgs = mockLedgerClient.submitAndWaitForTransactionTree.mock.calls[0]?.[0];
    const exerciseCmd = getExerciseCommand(callArgs?.commands[0]);
    const context = exerciseCmd?.choiceArgument['context'] as { context: { featuredAppRight: string | null } };
    expect(context.context.featuredAppRight).toBeNull();
  });

  it('uses receiver party as actAs', async () => {
    await preApproveTransfers(mockLedgerClient, mockValidatorClient, {
      receiverPartyId: 'receiver::fingerprint',
    });

    const callArgs = mockLedgerClient.submitAndWaitForTransactionTree.mock.calls[0]?.[0];
    expect(callArgs?.actAs).toEqual(['receiver::fingerprint']);
  });

  it('throws when no amulets found for provider party', async () => {
    const { getAmuletsForTransfer } = await import('../../../src/utils/amulet/get-amulets-for-transfer');
    (getAmuletsForTransfer as jest.Mock).mockResolvedValueOnce([]);

    await expect(
      preApproveTransfers(mockLedgerClient, mockValidatorClient, {
        receiverPartyId: 'receiver::fingerprint',
      })
    ).rejects.toThrow('No unlocked amulets found for provider party receiver::fingerprint');
  });

  it('throws when transaction returns no preapproval contract', async () => {
    mockLedgerClient.submitAndWaitForTransactionTree.mockResolvedValue({
      transactionTree: {
        updateId: 'update-123',
        commandId: 'cmd-123',
        workflowId: 'workflow-123',
        effectiveAt: '2026-01-01T00:00:00Z',
        offset: 100,
        synchronizerId: 'sync-123',
        recordTime: '2026-01-01T00:00:00Z',
        eventsById: {
          '1': {
            CreatedTreeEvent: {
              value: {
                offset: 100,
                nodeId: 1,
                contractId: 'other-contract-123',
                templateId: 'pkg:Some.Other:Contract', // Not TransferPreapproval
                createdEventBlob: 'blob-123',
                createdAt: '2026-01-01T00:00:00Z',
                witnessParties: ['party1'],
                signatories: ['party1'],
                observers: [],
                packageName: 'test-package',
                representativePackageId: 'pkg-123',
                acsDelta: true,
              },
            },
          },
        },
      },
    });

    await expect(
      preApproveTransfers(mockLedgerClient, mockValidatorClient, {
        receiverPartyId: 'receiver::fingerprint',
      })
    ).rejects.toThrow('Failed to create TransferPreapproval contract');
  });

  it('includes amulet inputs from provider party', async () => {
    await preApproveTransfers(mockLedgerClient, mockValidatorClient, {
      receiverPartyId: 'receiver::fingerprint',
    });

    const callArgs = mockLedgerClient.submitAndWaitForTransactionTree.mock.calls[0]?.[0];
    const exerciseCmd = getExerciseCommand(callArgs?.commands[0]);
    expect(exerciseCmd?.choiceArgument['inputs']).toEqual([{ tag: 'InputAmulet', value: 'amulet-123' }]);
  });
});
