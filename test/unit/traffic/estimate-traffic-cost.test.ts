import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { estimateTrafficCost, type EstimateTrafficCostOptions } from '../../../src/utils/traffic/estimate-traffic-cost';
import { UPDATE_CONFIRMATION_OVERHEAD_BYTES } from '../../../src/utils/traffic/types';

const HASHING_SCHEME_VERSION = 'HASHING_SCHEME_VERSION_V2' as const;

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

  // Helper to calculate expected values
  const calculateExpectedCosts = (
    totalCost: number
  ): { totalCostWithOverhead: number; costInCents: number; costInDollars: number } => {
    const totalCostWithOverhead = totalCost + UPDATE_CONFIRMATION_OVERHEAD_BYTES;
    const costInCents = (6000 * totalCostWithOverhead) / (1024 * 1024);
    return { totalCostWithOverhead, costInCents, costInDollars: costInCents / 100 };
  };

  const mockCommands: EstimateTrafficCostOptions['commands'] = [
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
      hashingSchemeVersion: HASHING_SCHEME_VERSION,
    });

    const expected = calculateExpectedCosts(2000);
    expect(result).toEqual({
      requestCost: 1500,
      responseCost: 500,
      totalCost: 2000,
      totalCostWithOverhead: expected.totalCostWithOverhead,
      costInCents: expected.costInCents,
      costInDollars: expected.costInDollars,
      estimatedAt: '2024-01-15T10:30:00Z',
    });
  });

  it('should use default userId and actAs from client', async () => {
    const client = createMockLedgerClient();

    await estimateTrafficCost({
      ledgerClient: client,
      commands: mockCommands,
      synchronizerId: 'domain-123',
      hashingSchemeVersion: HASHING_SCHEME_VERSION,
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
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V3',
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
        hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V3',
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
      hashingSchemeVersion: HASHING_SCHEME_VERSION,
    });

    expect(result).toBeUndefined();
  });

  it('should preserve the required estimation timestamp from a V3 prepare response', async () => {
    const client = createMockLedgerClient({
      preparedTransactionHash: 'hash-123',
      preparedTransaction: 'tx-data',
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V3',
      costEstimation: {
        estimationTimestamp: '2026-07-09T12:00:00Z',
        confirmationRequestTrafficCostEstimation: 800,
        confirmationResponseTrafficCostEstimation: 200,
        totalTrafficCostEstimation: 1000,
      },
    });

    const result = await estimateTrafficCost({
      ledgerClient: client,
      commands: mockCommands,
      synchronizerId: 'domain-123',
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V3',
    });

    const expected = calculateExpectedCosts(1000);
    expect(result).toEqual({
      requestCost: 800,
      responseCost: 200,
      totalCost: 1000,
      totalCostWithOverhead: expected.totalCostWithOverhead,
      costInCents: expected.costInCents,
      costInDollars: expected.costInDollars,
      estimatedAt: '2026-07-09T12:00:00Z',
    });
  });

  it('should generate unique commandId for each call', async () => {
    const client = createMockLedgerClient();

    await estimateTrafficCost({
      ledgerClient: client,
      commands: mockCommands,
      synchronizerId: 'domain-123',
      hashingSchemeVersion: HASHING_SCHEME_VERSION,
    });

    await estimateTrafficCost({
      ledgerClient: client,
      commands: mockCommands,
      synchronizerId: 'domain-123',
      hashingSchemeVersion: HASHING_SCHEME_VERSION,
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
        createdEventBlob: 'created-event-blob',
        synchronizerId: 'domain-123',
      },
    ];
    const packageIdSelectionPreference = ['pkg-123'];

    await estimateTrafficCost({
      ledgerClient: client,
      commands: mockCommands,
      synchronizerId: 'domain-123',
      hashingSchemeVersion: HASHING_SCHEME_VERSION,
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
        hashingSchemeVersion: HASHING_SCHEME_VERSION,
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
        hashingSchemeVersion: HASHING_SCHEME_VERSION,
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
      hashingSchemeVersion: HASHING_SCHEME_VERSION,
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
      hashingSchemeVersion: HASHING_SCHEME_VERSION,
      actAs: ['explicit-party::123'],
    });

    expect(result).toBeDefined();
    expect(client.interactiveSubmissionPrepare).toHaveBeenCalledWith(
      expect.objectContaining({ actAs: ['explicit-party::123'] })
    );
  });
});
