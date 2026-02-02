import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import type { CompositeCommand, ExerciseCommand } from '../../../src/clients/ledger-json-api/schemas/api/commands';
import { EnvLoader } from '../../../src/core/config/EnvLoader';
import { acceptTransferOffer, createTransferOffer } from '../../../src/utils/amulet/offers';

// Helper to safely extract ExerciseCommand from a CompositeCommand
const getExerciseCommand = (command: CompositeCommand | undefined): ExerciseCommand['ExerciseCommand'] | undefined => {
  if (command && 'ExerciseCommand' in command) {
    return command.ExerciseCommand;
  }
  return undefined;
};

// Mock EnvLoader
jest.mock('../../../src/core/config/EnvLoader', () => ({
  EnvLoader: {
    getInstance: jest.fn().mockReturnValue({
      getValidatorWalletAppInstallContractId: jest.fn().mockReturnValue('wallet-install-contract-id'),
    }),
  },
}));

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
    getNetwork: jest.fn().mockReturnValue('localnet'),
    getPartyId: jest.fn().mockReturnValue('validator-party::fingerprint'),
    submitAndWaitForTransactionTree: jest.fn().mockResolvedValue(transactionTreeResponse),
  }) as unknown as jest.Mocked<LedgerJsonApiClient>;

const createTransactionTreeResponse = (contractId: string): MockTransactionTreeResponse => ({
  transactionTree: {
    updateId: 'update-123',
    commandId: 'cmd-123',
    effectiveAt: '2026-01-01T00:00:00Z',
    offset: '100',
    eventsById: {
      '1': {
        CreatedTreeEvent: {
          value: {
            contractId,
            templateId: 'pkg:Splice.Wallet.TransferOffer:TransferOffer',
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

describe('createTransferOffer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a transfer offer and returns contract ID', async () => {
    const mockClient = createMockLedgerClient(createTransactionTreeResponse('transfer-offer-contract-123'));

    const result = await createTransferOffer({
      ledgerClient: mockClient,
      receiverPartyId: 'receiver::fingerprint',
      amount: '100',
      description: 'Test transfer',
    });

    expect(result).toBe('transfer-offer-contract-123');
    expect(mockClient.submitAndWaitForTransactionTree).toHaveBeenCalledTimes(1);
  });

  it('uses validator party as actAs', async () => {
    const mockClient = createMockLedgerClient(createTransactionTreeResponse('contract-123'));

    await createTransferOffer({
      ledgerClient: mockClient,
      receiverPartyId: 'receiver::fingerprint',
      amount: '100',
      description: 'Test transfer',
    });

    expect(mockClient.submitAndWaitForTransactionTree).toHaveBeenCalledWith(
      expect.objectContaining({
        actAs: ['validator-party::fingerprint'],
      })
    );
  });

  it('submits correct command structure', async () => {
    const mockClient = createMockLedgerClient(createTransactionTreeResponse('contract-123'));

    await createTransferOffer({
      ledgerClient: mockClient,
      receiverPartyId: 'receiver::fingerprint',
      amount: '100',
      description: 'Test transfer',
    });

    const callArgs = mockClient.submitAndWaitForTransactionTree.mock.calls[0]?.[0];
    expect(callArgs?.commands).toHaveLength(1);

    const command = callArgs?.commands[0];
    expect(command).toHaveProperty('ExerciseCommand');
    const exerciseCmd = getExerciseCommand(command);
    expect(exerciseCmd?.templateId).toBe('#splice-wallet:Splice.Wallet.Install:WalletAppInstall');
    expect(exerciseCmd?.choice).toBe('WalletAppInstall_CreateTransferOffer');
    expect(exerciseCmd?.choiceArgument).toEqual(
      expect.objectContaining({
        receiver: 'receiver::fingerprint',
        amount: { amount: '100', unit: 'AmuletUnit' },
        description: 'Test transfer',
      })
    );
  });

  it('uses wallet app install contract ID from EnvLoader', async () => {
    const mockClient = createMockLedgerClient(createTransactionTreeResponse('contract-123'));

    await createTransferOffer({
      ledgerClient: mockClient,
      receiverPartyId: 'receiver::fingerprint',
      amount: '100',
      description: 'Test transfer',
    });

    const mockEnvLoaderInstance = EnvLoader.getInstance();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockEnvLoaderInstance.getValidatorWalletAppInstallContractId).toHaveBeenCalledWith('localnet');

    const callArgs = mockClient.submitAndWaitForTransactionTree.mock.calls[0]?.[0];
    const exerciseCmd = getExerciseCommand(callArgs?.commands[0]);
    expect(exerciseCmd?.contractId).toBe('wallet-install-contract-id');
  });

  it('uses provided expiresAt date', async () => {
    const mockClient = createMockLedgerClient(createTransactionTreeResponse('contract-123'));
    const customExpiry = new Date('2026-12-31T23:59:59Z');

    await createTransferOffer({
      ledgerClient: mockClient,
      receiverPartyId: 'receiver::fingerprint',
      amount: '100',
      description: 'Test transfer',
      expiresAt: customExpiry,
    });

    const callArgs = mockClient.submitAndWaitForTransactionTree.mock.calls[0]?.[0];
    const exerciseCmd = getExerciseCommand(callArgs?.commands[0]);
    expect(exerciseCmd?.choiceArgument['expiresAt']).toBe('2026-12-31T23:59:59.000Z');
  });

  it('defaults expiresAt to 24 hours from now', async () => {
    const mockClient = createMockLedgerClient(createTransactionTreeResponse('contract-123'));
    const beforeCall = Date.now();

    await createTransferOffer({
      ledgerClient: mockClient,
      receiverPartyId: 'receiver::fingerprint',
      amount: '100',
      description: 'Test transfer',
    });

    const callArgs = mockClient.submitAndWaitForTransactionTree.mock.calls[0]?.[0];
    const exerciseCmd = getExerciseCommand(callArgs?.commands[0]);
    const expiresAtStr = exerciseCmd?.choiceArgument['expiresAt'] as string;
    const expiresAt = new Date(expiresAtStr).getTime();

    // Should be roughly 24 hours from now
    const expectedMinExpiry = beforeCall + 24 * 60 * 60 * 1000 - 1000; // Allow 1 second tolerance
    const expectedMaxExpiry = beforeCall + 24 * 60 * 60 * 1000 + 5000; // Allow 5 second tolerance
    expect(expiresAt).toBeGreaterThan(expectedMinExpiry);
    expect(expiresAt).toBeLessThan(expectedMaxExpiry);
  });

  it('throws when response has no created event', async () => {
    const mockClient = createMockLedgerClient({
      transactionTree: {
        updateId: 'update-123',
        eventsById: {
          '1': {
            ExercisedTreeEvent: {
              value: { contractId: 'contract-123' },
            },
          },
        },
      },
    });

    await expect(
      createTransferOffer({
        ledgerClient: mockClient,
        receiverPartyId: 'receiver::fingerprint',
        amount: '100',
        description: 'Test transfer',
      })
    ).rejects.toThrow('Expected CreatedTreeEvent but got ExercisedTreeEvent');
  });

  it('throws when response has no events', async () => {
    const mockClient = createMockLedgerClient({
      transactionTree: {
        updateId: 'update-123',
        eventsById: {},
      },
    });

    await expect(
      createTransferOffer({
        ledgerClient: mockClient,
        receiverPartyId: 'receiver::fingerprint',
        amount: '100',
        description: 'Test transfer',
      })
    ).rejects.toThrow('Expected CreatedTreeEvent but got undefined');
  });
});

describe('acceptTransferOffer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts a transfer offer', async () => {
    const mockResponse = createTransactionTreeResponse('accepted-contract-123');
    const mockClient = createMockLedgerClient(mockResponse);

    const result = await acceptTransferOffer({
      ledgerClient: mockClient,
      transferOfferContractId: 'offer-contract-123',
      acceptingPartyId: 'receiver::fingerprint',
    });

    expect(result).toBe(mockResponse);
    expect(mockClient.submitAndWaitForTransactionTree).toHaveBeenCalledTimes(1);
  });

  it('submits correct command structure', async () => {
    const mockClient = createMockLedgerClient(createTransactionTreeResponse('contract-123'));

    await acceptTransferOffer({
      ledgerClient: mockClient,
      transferOfferContractId: 'offer-contract-123',
      acceptingPartyId: 'receiver::fingerprint',
    });

    const callArgs = mockClient.submitAndWaitForTransactionTree.mock.calls[0]?.[0];
    expect(callArgs?.commands).toHaveLength(1);

    const command = callArgs?.commands[0];
    expect(command).toHaveProperty('ExerciseCommand');
    const exerciseCmd = getExerciseCommand(command);
    expect(exerciseCmd?.templateId).toBe('#splice-wallet:Splice.Wallet.TransferOffer:TransferOffer');
    expect(exerciseCmd?.contractId).toBe('offer-contract-123');
    expect(exerciseCmd?.choice).toBe('TransferOffer_Accept');
    expect(exerciseCmd?.choiceArgument).toEqual({});
  });

  it('uses accepting party as actAs', async () => {
    const mockClient = createMockLedgerClient(createTransactionTreeResponse('contract-123'));

    await acceptTransferOffer({
      ledgerClient: mockClient,
      transferOfferContractId: 'offer-contract-123',
      acceptingPartyId: 'receiver::fingerprint',
    });

    expect(mockClient.submitAndWaitForTransactionTree).toHaveBeenCalledWith(
      expect.objectContaining({
        actAs: ['receiver::fingerprint'],
      })
    );
  });

  it('generates command IDs with accept-transfer prefix', async () => {
    const mockClient = createMockLedgerClient(createTransactionTreeResponse('contract-123'));

    await acceptTransferOffer({
      ledgerClient: mockClient,
      transferOfferContractId: 'offer-1',
      acceptingPartyId: 'receiver::fingerprint',
    });

    const commandId = mockClient.submitAndWaitForTransactionTree.mock.calls[0]?.[0]?.commandId;

    expect(commandId).toMatch(/^accept-transfer-\d+$/);
  });
});
