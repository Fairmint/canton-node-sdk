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

interface MockTransactionResponse {
  transaction: {
    updateId: string;
    commandId: string;
    effectiveAt: string;
    offset: string;
    events: Array<
      { CreatedEvent: { contractId: string; templateId: string } } | { ExercisedEvent: { contractId: string } }
    >;
    synchronizerId: string;
    traceContext: undefined;
    recordTime: string;
  };
}

const createMockLedgerClient = (transactionResponse: unknown): jest.Mocked<LedgerJsonApiClient> =>
  ({
    getNetwork: jest.fn().mockReturnValue('localnet'),
    getPartyId: jest.fn().mockReturnValue('validator-party::fingerprint'),
    submitAndWaitForTransaction: jest.fn().mockResolvedValue(transactionResponse),
  }) as unknown as jest.Mocked<LedgerJsonApiClient>;

const createTransactionResponse = (contractId: string): MockTransactionResponse => ({
  transaction: {
    updateId: 'update-123',
    commandId: 'cmd-123',
    effectiveAt: '2026-01-01T00:00:00Z',
    offset: '100',
    events: [
      {
        CreatedEvent: {
          contractId,
          templateId: 'pkg:Splice.Wallet.TransferOffer:TransferOffer',
        },
      },
    ],
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
    const mockClient = createMockLedgerClient(createTransactionResponse('transfer-offer-contract-123'));

    const result = await createTransferOffer({
      ledgerClient: mockClient,
      receiverPartyId: 'receiver::fingerprint',
      amount: '100',
      description: 'Test transfer',
    });

    expect(result).toBe('transfer-offer-contract-123');
    expect(mockClient.submitAndWaitForTransaction).toHaveBeenCalledTimes(1);
  });

  it('finds transfer offer created events without relying on event order', async () => {
    const mockResponse = createTransactionResponse('transfer-offer-contract-123');
    mockResponse.transaction.events = [
      {
        CreatedEvent: {
          contractId: 'other-contract-123',
          templateId: 'pkg:Splice.Wallet.TransferOffer:NotTransferOffer',
        },
      },
      {
        CreatedEvent: {
          contractId: 'transfer-offer-contract-123',
          templateId: 'pkg:Splice.Wallet.TransferOffer:TransferOffer',
        },
      },
    ];
    const mockClient = createMockLedgerClient(mockResponse);

    const result = await createTransferOffer({
      ledgerClient: mockClient,
      receiverPartyId: 'receiver::fingerprint',
      amount: '100',
      description: 'Test transfer',
    });

    expect(result).toBe('transfer-offer-contract-123');
  });

  it('uses validator party as actAs', async () => {
    const mockClient = createMockLedgerClient(createTransactionResponse('contract-123'));

    await createTransferOffer({
      ledgerClient: mockClient,
      receiverPartyId: 'receiver::fingerprint',
      amount: '100',
      description: 'Test transfer',
    });

    expect(mockClient.submitAndWaitForTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        actAs: ['validator-party::fingerprint'],
      })
    );
  });

  it('submits correct command structure', async () => {
    const mockClient = createMockLedgerClient(createTransactionResponse('contract-123'));

    await createTransferOffer({
      ledgerClient: mockClient,
      receiverPartyId: 'receiver::fingerprint',
      amount: '100',
      description: 'Test transfer',
    });

    const callArgs = mockClient.submitAndWaitForTransaction.mock.calls[0]?.[0];
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
    const mockClient = createMockLedgerClient(createTransactionResponse('contract-123'));

    await createTransferOffer({
      ledgerClient: mockClient,
      receiverPartyId: 'receiver::fingerprint',
      amount: '100',
      description: 'Test transfer',
    });

    const mockEnvLoaderInstance = EnvLoader.getInstance();
    expect(mockEnvLoaderInstance.getValidatorWalletAppInstallContractId).toHaveBeenCalledWith('localnet');

    const callArgs = mockClient.submitAndWaitForTransaction.mock.calls[0]?.[0];
    const exerciseCmd = getExerciseCommand(callArgs?.commands[0]);
    expect(exerciseCmd?.contractId).toBe('wallet-install-contract-id');
  });

  it('uses provided expiresAt date', async () => {
    const mockClient = createMockLedgerClient(createTransactionResponse('contract-123'));
    const customExpiry = new Date('2026-12-31T23:59:59Z');

    await createTransferOffer({
      ledgerClient: mockClient,
      receiverPartyId: 'receiver::fingerprint',
      amount: '100',
      description: 'Test transfer',
      expiresAt: customExpiry,
    });

    const callArgs = mockClient.submitAndWaitForTransaction.mock.calls[0]?.[0];
    const exerciseCmd = getExerciseCommand(callArgs?.commands[0]);
    expect(exerciseCmd?.choiceArgument['expiresAt']).toBe('2026-12-31T23:59:59.000Z');
  });

  it('defaults expiresAt to 24 hours from now', async () => {
    const mockClient = createMockLedgerClient(createTransactionResponse('contract-123'));
    const beforeCall = Date.now();

    await createTransferOffer({
      ledgerClient: mockClient,
      receiverPartyId: 'receiver::fingerprint',
      amount: '100',
      description: 'Test transfer',
    });

    const callArgs = mockClient.submitAndWaitForTransaction.mock.calls[0]?.[0];
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
      transaction: {
        updateId: 'update-123',
        events: [
          {
            ExercisedEvent: { contractId: 'contract-123' },
          },
        ],
      },
    });

    await expect(
      createTransferOffer({
        ledgerClient: mockClient,
        receiverPartyId: 'receiver::fingerprint',
        amount: '100',
        description: 'Test transfer',
      })
    ).rejects.toThrow('Failed to create TransferOffer contract');
  });

  it('throws when response has no events', async () => {
    const mockClient = createMockLedgerClient({
      transaction: {
        updateId: 'update-123',
        events: [],
      },
    });

    await expect(
      createTransferOffer({
        ledgerClient: mockClient,
        receiverPartyId: 'receiver::fingerprint',
        amount: '100',
        description: 'Test transfer',
      })
    ).rejects.toThrow('Failed to create TransferOffer contract');
  });
});

describe('acceptTransferOffer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts a transfer offer', async () => {
    const mockResponse = createTransactionResponse('accepted-contract-123');
    const mockClient = createMockLedgerClient(mockResponse);

    const result = await acceptTransferOffer({
      ledgerClient: mockClient,
      transferOfferContractId: 'offer-contract-123',
      acceptingPartyId: 'receiver::fingerprint',
    });

    expect(result).toBe(mockResponse);
    expect(mockClient.submitAndWaitForTransaction).toHaveBeenCalledTimes(1);
  });

  it('submits correct command structure', async () => {
    const mockClient = createMockLedgerClient(createTransactionResponse('contract-123'));

    await acceptTransferOffer({
      ledgerClient: mockClient,
      transferOfferContractId: 'offer-contract-123',
      acceptingPartyId: 'receiver::fingerprint',
    });

    const callArgs = mockClient.submitAndWaitForTransaction.mock.calls[0]?.[0];
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
    const mockClient = createMockLedgerClient(createTransactionResponse('contract-123'));

    await acceptTransferOffer({
      ledgerClient: mockClient,
      transferOfferContractId: 'offer-contract-123',
      acceptingPartyId: 'receiver::fingerprint',
    });

    expect(mockClient.submitAndWaitForTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        actAs: ['receiver::fingerprint'],
      })
    );
  });

  it('generates command IDs with accept-transfer prefix', async () => {
    const mockClient = createMockLedgerClient(createTransactionResponse('contract-123'));

    await acceptTransferOffer({
      ledgerClient: mockClient,
      transferOfferContractId: 'offer-1',
      acceptingPartyId: 'receiver::fingerprint',
    });

    const commandId = mockClient.submitAndWaitForTransaction.mock.calls[0]?.[0]?.commandId;

    expect(commandId).toMatch(/^accept-transfer-\d+$/);
  });
});
