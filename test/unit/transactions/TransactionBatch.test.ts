import type { LedgerJsonApiClient } from '../../../src/clients';
import type { Command, DisclosedContract } from '../../../src/clients/ledger-json-api/schemas';
import { TransactionBatch } from '../../../src/utils/transactions/TransactionBatch';

const createMockLedgerClient = (): jest.Mocked<LedgerJsonApiClient> =>
  ({
    submitAndWaitForTransactionTree: jest.fn().mockResolvedValue({
      transactionTree: { updateId: 'update-123' },
    }),
    submitAndWait: jest.fn().mockResolvedValue({ updateId: 'update-456' }),
    asyncSubmit: jest.fn().mockResolvedValue(undefined),
  }) as unknown as jest.Mocked<LedgerJsonApiClient>;

const createMockCommand = (id: string): Command => ({
  CreateCommand: {
    templateId: `pkg:Module:Template${id}`,
    createArguments: { id },
  },
});

const createMockDisclosedContract = (id: string): DisclosedContract => ({
  contractId: `contract-${id}`,
  templateId: `pkg:Module:Template${id}`,
  createdEventBlob: `blob-${id}`,
  synchronizerId: `sync-${id}`,
});

describe('TransactionBatch', () => {
  let mockClient: jest.Mocked<LedgerJsonApiClient>;

  beforeEach(() => {
    mockClient = createMockLedgerClient();
  });

  describe('constructor', () => {
    it('creates batch with actAs parties', () => {
      const batch = new TransactionBatch(mockClient, ['party1', 'party2']);
      expect(batch).toBeInstanceOf(TransactionBatch);
    });

    it('creates batch with actAs and readAs parties', () => {
      const batch = new TransactionBatch(mockClient, ['party1'], ['readParty1']);
      expect(batch).toBeInstanceOf(TransactionBatch);
    });
  });

  describe('addCommand', () => {
    it('adds a single command', async () => {
      const batch = new TransactionBatch(mockClient, ['party1']);
      const command = createMockCommand('1');

      batch.addCommand(command);
      await batch.submitAndWait();

      expect(mockClient.submitAndWait).toHaveBeenCalledWith(
        expect.objectContaining({
          commands: [command],
        })
      );
    });

    it('returns this for chaining', () => {
      const batch = new TransactionBatch(mockClient, ['party1']);
      const result = batch.addCommand(createMockCommand('1'));
      expect(result).toBe(batch);
    });
  });

  describe('addCommands', () => {
    it('adds multiple commands', async () => {
      const batch = new TransactionBatch(mockClient, ['party1']);
      const commands = [createMockCommand('1'), createMockCommand('2')];

      batch.addCommands(commands);
      await batch.submitAndWait();

      expect(mockClient.submitAndWait).toHaveBeenCalledWith(
        expect.objectContaining({
          commands,
        })
      );
    });

    it('accumulates commands from multiple calls', async () => {
      const batch = new TransactionBatch(mockClient, ['party1']);

      batch.addCommand(createMockCommand('1'));
      batch.addCommands([createMockCommand('2'), createMockCommand('3')]);

      await batch.submitAndWait();

      expect(mockClient.submitAndWait).toHaveBeenCalledWith(
        expect.objectContaining({
          commands: expect.arrayContaining([
            expect.objectContaining({
              CreateCommand: expect.objectContaining({ createArguments: { id: '1' } }) as Record<string, unknown>,
            }),
            expect.objectContaining({
              CreateCommand: expect.objectContaining({ createArguments: { id: '2' } }) as Record<string, unknown>,
            }),
            expect.objectContaining({
              CreateCommand: expect.objectContaining({ createArguments: { id: '3' } }) as Record<string, unknown>,
            }),
          ]) as unknown[],
        })
      );
    });
  });

  describe('addDisclosedContracts', () => {
    it('adds disclosed contracts', async () => {
      const batch = new TransactionBatch(mockClient, ['party1']);
      const contracts = [createMockDisclosedContract('1'), createMockDisclosedContract('2')];

      batch.addDisclosedContracts(contracts);
      batch.addCommand(createMockCommand('1'));
      await batch.submitAndWait();

      expect(mockClient.submitAndWait).toHaveBeenCalledWith(
        expect.objectContaining({
          disclosedContracts: contracts,
        })
      );
    });

    it('returns this for chaining', () => {
      const batch = new TransactionBatch(mockClient, ['party1']);
      const result = batch.addDisclosedContracts([createMockDisclosedContract('1')]);
      expect(result).toBe(batch);
    });
  });

  describe('addBuiltCommand', () => {
    it('adds command and disclosed contracts together', async () => {
      const batch = new TransactionBatch(mockClient, ['party1']);
      const command = createMockCommand('1');
      const contracts = [createMockDisclosedContract('1')];

      batch.addBuiltCommand({ command, disclosedContracts: contracts });
      await batch.submitAndWait();

      expect(mockClient.submitAndWait).toHaveBeenCalledWith(
        expect.objectContaining({
          commands: [command],
          disclosedContracts: contracts,
        })
      );
    });

    it('adds command without disclosed contracts', async () => {
      const batch = new TransactionBatch(mockClient, ['party1']);
      const command = createMockCommand('1');

      batch.addBuiltCommand({ command });
      await batch.submitAndWait();

      expect(mockClient.submitAndWait).toHaveBeenCalledWith(
        expect.objectContaining({
          commands: [command],
        })
      );
      expect(mockClient.submitAndWait).toHaveBeenCalledWith(
        expect.not.objectContaining({
          disclosedContracts: expect.anything() as unknown,
        })
      );
    });

    it('handles empty disclosed contracts array', async () => {
      const batch = new TransactionBatch(mockClient, ['party1']);
      const command = createMockCommand('1');

      batch.addBuiltCommand({ command, disclosedContracts: [] });
      await batch.submitAndWait();

      // Should not include empty disclosedContracts
      const callArgs = mockClient.submitAndWait.mock.calls[0]?.[0];
      expect(callArgs).not.toHaveProperty('disclosedContracts');
    });
  });

  describe('clear', () => {
    it('clears commands and disclosed contracts', async () => {
      const batch = new TransactionBatch(mockClient, ['party1']);

      batch.addCommand(createMockCommand('1'));
      batch.addDisclosedContracts([createMockDisclosedContract('1')]);
      batch.clear();
      batch.addCommand(createMockCommand('2'));

      await batch.submitAndWait();

      expect(mockClient.submitAndWait).toHaveBeenCalledWith(
        expect.objectContaining({
          commands: [createMockCommand('2')],
        })
      );
    });

    it('returns this for chaining', () => {
      const batch = new TransactionBatch(mockClient, ['party1']);
      const result = batch.clear();
      expect(result).toBe(batch);
    });
  });

  describe('submitAndWaitForTransactionTree', () => {
    it('submits batch and returns updateId', async () => {
      const batch = new TransactionBatch(mockClient, ['party1']);
      batch.addCommand(createMockCommand('1'));

      const result = await batch.submitAndWaitForTransactionTree();

      expect(result).toEqual({ updateId: 'update-123' });
      expect(mockClient.submitAndWaitForTransactionTree).toHaveBeenCalled();
    });

    it('includes actAs parties', async () => {
      const batch = new TransactionBatch(mockClient, ['party1', 'party2']);
      batch.addCommand(createMockCommand('1'));

      await batch.submitAndWaitForTransactionTree();

      expect(mockClient.submitAndWaitForTransactionTree).toHaveBeenCalledWith(
        expect.objectContaining({
          actAs: ['party1', 'party2'],
        })
      );
    });

    it('includes readAs parties when provided', async () => {
      const batch = new TransactionBatch(mockClient, ['party1'], ['readParty1']);
      batch.addCommand(createMockCommand('1'));

      await batch.submitAndWaitForTransactionTree();

      expect(mockClient.submitAndWaitForTransactionTree).toHaveBeenCalledWith(
        expect.objectContaining({
          actAs: ['party1'],
          readAs: ['readParty1'],
        })
      );
    });

    it('deduplicates disclosed contracts by contractId', async () => {
      const batch = new TransactionBatch(mockClient, ['party1']);
      const contract1 = createMockDisclosedContract('1');
      const contract1Duplicate = { ...contract1 }; // Same contractId

      batch.addDisclosedContracts([contract1]);
      batch.addDisclosedContracts([contract1Duplicate]);
      batch.addCommand(createMockCommand('1'));

      await batch.submitAndWaitForTransactionTree();

      const callArgs = mockClient.submitAndWaitForTransactionTree.mock.calls[0]?.[0];
      expect(callArgs?.disclosedContracts).toHaveLength(1);
    });
  });

  describe('submitAndWait', () => {
    it('submits batch and returns updateId', async () => {
      const batch = new TransactionBatch(mockClient, ['party1']);
      batch.addCommand(createMockCommand('1'));

      const result = await batch.submitAndWait();

      expect(result).toEqual({ updateId: 'update-456' });
      expect(mockClient.submitAndWait).toHaveBeenCalled();
    });
  });

  describe('asyncSubmit', () => {
    it('submits batch asynchronously', async () => {
      const batch = new TransactionBatch(mockClient, ['party1']);
      batch.addCommand(createMockCommand('1'));

      await batch.asyncSubmit();

      expect(mockClient.asyncSubmit).toHaveBeenCalled();
    });

    it('returns void', async () => {
      const batch = new TransactionBatch(mockClient, ['party1']);
      batch.addCommand(createMockCommand('1'));

      await batch.asyncSubmit();

      // asyncSubmit returns void, which is expected
    });
  });

  describe('chaining', () => {
    it('supports fluent API', async () => {
      const batch = new TransactionBatch(mockClient, ['party1']);

      await batch
        .addCommand(createMockCommand('1'))
        .addCommands([createMockCommand('2')])
        .addDisclosedContracts([createMockDisclosedContract('1')])
        .submitAndWait();

      expect(mockClient.submitAndWait).toHaveBeenCalledWith(
        expect.objectContaining({
          commands: expect.arrayContaining([createMockCommand('1'), createMockCommand('2')]) as unknown[],
          disclosedContracts: [createMockDisclosedContract('1')],
        })
      );
    });
  });
});
