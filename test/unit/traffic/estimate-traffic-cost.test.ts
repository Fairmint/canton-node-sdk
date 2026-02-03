import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { estimateTrafficCost } from '../../../src/utils/traffic/estimate-traffic-cost';

describe('estimateTrafficCost', () => {
  const mockPrepareResponse = {
    preparedTransactionHash: 'hash-123',
    preparedTransaction: 'tx-data',
    hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2' as const,
    costEstimation: {
      confirmationRequestTrafficCostEstimation: 1500,
      confirmationResponseTrafficCostEstimation: 500,
      totalTrafficCostEstimation: 2000,
      estimationTimestamp: '2024-01-15T10:30:00Z',
    },
  };

  const mockCommands = [
    {
      CreateCommand: {
        templateId: 'MyModule:MyTemplate',
        createArguments: { fields: { owner: { party: 'alice::1234' } } },
      },
    },
  ];

  // Use `unknown` to allow flexible mock responses for different test scenarios
  const createMockLedgerClient = (response?: unknown): LedgerJsonApiClient =>
    ({
      interactiveSubmissionPrepare: jest.fn().mockResolvedValue(response ?? mockPrepareResponse),
      getUserId: jest.fn().mockReturnValue('test-user'),
      getPartyId: jest.fn().mockReturnValue('test-party::abc'),
    }) as unknown as LedgerJsonApiClient;

  it('should return traffic cost estimate for commands', async () => {
    const client = createMockLedgerClient();

    const result = await estimateTrafficCost({
      ledgerClient: client,
      commands: mockCommands,
      synchronizerId: 'domain-123',
    });

    expect(result).toEqual({
      requestCost: 1500,
      responseCost: 500,
      totalCost: 2000,
      estimatedAt: '2024-01-15T10:30:00Z',
    });
  });

  it('should use default userId and actAs from client', async () => {
    const client = createMockLedgerClient();

    await estimateTrafficCost({
      ledgerClient: client,
      commands: mockCommands,
      synchronizerId: 'domain-123',
    });

    expect(client.interactiveSubmissionPrepare).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'test-user',
        actAs: ['test-party::abc'],
        readAs: [],
        synchronizerId: 'domain-123',
        verboseHashing: false,
        packageIdSelectionPreference: [],
      })
    );
  });

  it('should use provided userId and actAs when specified', async () => {
    const client = createMockLedgerClient();

    await estimateTrafficCost({
      ledgerClient: client,
      commands: mockCommands,
      synchronizerId: 'domain-456',
      userId: 'custom-user',
      actAs: ['party-a::123', 'party-b::456'],
      readAs: ['party-c::789'],
    });

    expect(client.interactiveSubmissionPrepare).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'custom-user',
        actAs: ['party-a::123', 'party-b::456'],
        readAs: ['party-c::789'],
        synchronizerId: 'domain-456',
      })
    );
  });

  it('should return undefined when costEstimation is not present', async () => {
    const client = createMockLedgerClient({
      preparedTransactionHash: 'hash-123',
      preparedTransaction: 'tx-data',
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2' as const,
    });

    const result = await estimateTrafficCost({
      ledgerClient: client,
      commands: mockCommands,
      synchronizerId: 'domain-123',
    });

    expect(result).toBeUndefined();
  });

  it('should handle cost estimation without timestamp', async () => {
    const client = createMockLedgerClient({
      preparedTransactionHash: 'hash-123',
      preparedTransaction: 'tx-data',
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
      costEstimation: {
        confirmationRequestTrafficCostEstimation: 800,
        confirmationResponseTrafficCostEstimation: 200,
        totalTrafficCostEstimation: 1000,
      },
    });

    const result = await estimateTrafficCost({
      ledgerClient: client,
      commands: mockCommands,
      synchronizerId: 'domain-123',
    });

    expect(result).toEqual({
      requestCost: 800,
      responseCost: 200,
      totalCost: 1000,
      estimatedAt: undefined,
    });
  });

  it('should generate unique commandId for each call', async () => {
    const client = createMockLedgerClient();

    await estimateTrafficCost({
      ledgerClient: client,
      commands: mockCommands,
      synchronizerId: 'domain-123',
    });

    await estimateTrafficCost({
      ledgerClient: client,
      commands: mockCommands,
      synchronizerId: 'domain-123',
    });

    const { calls } = (client.interactiveSubmissionPrepare as jest.Mock).mock;
    expect(calls[0][0].commandId).not.toBe(calls[1][0].commandId);
  });

  it('should pass through disclosedContracts and packageIdSelectionPreference', async () => {
    const client = createMockLedgerClient();
    const disclosedContracts = [
      {
        contractId: 'contract-1',
        templateId: 'MyModule:MyContract',
        synchronizerId: 'domain-123',
      },
    ];
    const packageIdSelectionPreference = [{ packageId: 'pkg-123' }];

    await estimateTrafficCost({
      ledgerClient: client,
      commands: mockCommands,
      synchronizerId: 'domain-123',
      disclosedContracts,
      packageIdSelectionPreference,
    });

    expect(client.interactiveSubmissionPrepare).toHaveBeenCalledWith(
      expect.objectContaining({
        disclosedContracts,
        packageIdSelectionPreference,
      })
    );
  });

  it('should handle multiple commands', async () => {
    const client = createMockLedgerClient({
      preparedTransactionHash: 'hash-multi',
      costEstimation: {
        confirmationRequestTrafficCostEstimation: 3000,
        confirmationResponseTrafficCostEstimation: 1000,
        totalTrafficCostEstimation: 4000,
      },
    });

    const multipleCommands = [
      {
        CreateCommand: {
          templateId: 'MyModule:Contract1',
          createArguments: { fields: {} },
        },
      },
      {
        ExerciseCommand: {
          templateId: 'MyModule:Contract2',
          contractId: 'contract-id-123',
          choice: 'Archive',
          choiceArgument: { fields: {} },
        },
      },
    ];

    const result = await estimateTrafficCost({
      ledgerClient: client,
      commands: multipleCommands,
      synchronizerId: 'domain-123',
    });

    expect(result).toEqual({
      requestCost: 3000,
      responseCost: 1000,
      totalCost: 4000,
      estimatedAt: undefined,
    });
    expect(client.interactiveSubmissionPrepare).toHaveBeenCalledWith(
      expect.objectContaining({
        commands: multipleCommands,
      })
    );
  });

  it('should throw error when userId cannot be resolved', async () => {
    const client = {
      interactiveSubmissionPrepare: jest.fn().mockResolvedValue(mockPrepareResponse),
      getUserId: jest.fn().mockReturnValue(undefined),
      getPartyId: jest.fn().mockReturnValue('test-party::abc'),
    } as unknown as LedgerJsonApiClient;

    await expect(
      estimateTrafficCost({
        ledgerClient: client,
        commands: mockCommands,
        synchronizerId: 'domain-123',
      })
    ).rejects.toThrow('userId is required: provide it in options or configure it on the ledger client');
  });

  it('should throw error when actAs cannot be resolved', async () => {
    const client = {
      interactiveSubmissionPrepare: jest.fn().mockResolvedValue(mockPrepareResponse),
      getUserId: jest.fn().mockReturnValue('test-user'),
      getPartyId: jest.fn().mockReturnValue(''),
    } as unknown as LedgerJsonApiClient;

    await expect(
      estimateTrafficCost({
        ledgerClient: client,
        commands: mockCommands,
        synchronizerId: 'domain-123',
      })
    ).rejects.toThrow('actAs is required: provide it in options or configure partyId on the ledger client');
  });

  it('should not throw when userId is explicitly provided even if client has no default', async () => {
    const client = {
      interactiveSubmissionPrepare: jest.fn().mockResolvedValue(mockPrepareResponse),
      getUserId: jest.fn().mockReturnValue(undefined),
      getPartyId: jest.fn().mockReturnValue('test-party::abc'),
    } as unknown as LedgerJsonApiClient;

    const result = await estimateTrafficCost({
      ledgerClient: client,
      commands: mockCommands,
      synchronizerId: 'domain-123',
      userId: 'explicit-user',
    });

    expect(result).toBeDefined();
    expect(client.interactiveSubmissionPrepare).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'explicit-user' })
    );
  });

  it('should not throw when actAs is explicitly provided even if client has no default', async () => {
    const client = {
      interactiveSubmissionPrepare: jest.fn().mockResolvedValue(mockPrepareResponse),
      getUserId: jest.fn().mockReturnValue('test-user'),
      getPartyId: jest.fn().mockReturnValue(''),
    } as unknown as LedgerJsonApiClient;

    const result = await estimateTrafficCost({
      ledgerClient: client,
      commands: mockCommands,
      synchronizerId: 'domain-123',
      actAs: ['explicit-party::123'],
    });

    expect(result).toBeDefined();
    expect(client.interactiveSubmissionPrepare).toHaveBeenCalledWith(
      expect.objectContaining({ actAs: ['explicit-party::123'] })
    );
  });
});
