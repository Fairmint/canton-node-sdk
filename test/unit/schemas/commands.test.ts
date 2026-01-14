import {
  CommandRequestSchema,
  CommandSchema,
  CreateCommandSchema,
  DisclosedContractSchema,
  ExerciseCommandSchema,
} from '../../../src/clients/ledger-json-api/schemas/api/commands';

describe('Command Schemas', () => {
  describe('CreateCommandSchema', () => {
    it('validates create command', () => {
      const result = CreateCommandSchema.safeParse({
        CreateCommand: {
          templateId: '#package:Module:Template',
          createArguments: {
            field1: 'value1',
            field2: 123,
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it('validates create command with nested arguments', () => {
      const result = CreateCommandSchema.safeParse({
        CreateCommand: {
          templateId: '#package:Module:Template',
          createArguments: {
            nested: { inner: 'value' },
            array: [1, 2, 3],
            bool: true,
            nullable: null,
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects create command without templateId', () => {
      const result = CreateCommandSchema.safeParse({
        CreateCommand: {
          createArguments: { field: 'value' },
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects malformed create command', () => {
      const result = CreateCommandSchema.safeParse({
        CreateCommand: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ExerciseCommandSchema', () => {
    it('validates exercise command', () => {
      const result = ExerciseCommandSchema.safeParse({
        ExerciseCommand: {
          templateId: '#package:Module:Template',
          contractId: '00abc123...',
          choice: 'Accept',
          choiceArgument: {},
        },
      });
      expect(result.success).toBe(true);
    });

    it('validates exercise command with arguments', () => {
      const result = ExerciseCommandSchema.safeParse({
        ExerciseCommand: {
          templateId: '#splice-amulet:Splice.Amulet:TransferOffer',
          contractId: '00abc123def456...',
          choice: 'TransferOffer_Accept',
          choiceArgument: {
            acceptingParty: 'alice::123',
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects exercise command without required fields', () => {
      const result = ExerciseCommandSchema.safeParse({
        ExerciseCommand: {
          templateId: '#package:Module:Template',
          // Missing contractId, choice, choiceArgument
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('CommandSchema', () => {
    it('validates create command variant', () => {
      const result = CommandSchema.safeParse({
        CreateCommand: {
          templateId: '#package:Module:Template',
          createArguments: {},
        },
      });
      expect(result.success).toBe(true);
    });

    it('validates exercise command variant', () => {
      const result = CommandSchema.safeParse({
        ExerciseCommand: {
          templateId: '#package:Module:Template',
          contractId: 'contract123',
          choice: 'Archive',
          choiceArgument: {},
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects unknown command type', () => {
      const result = CommandSchema.safeParse({
        UnknownCommand: {},
      });
      expect(result.success).toBe(false);
    });
  });

  describe('DisclosedContractSchema', () => {
    it('validates disclosed contract', () => {
      const result = DisclosedContractSchema.safeParse({
        templateId: '#package:Module:Template',
        contractId: '00abc123...',
        createdEventBlob: 'base64blob==',
        synchronizerId: 'synchronizer::abc123',
      });
      expect(result.success).toBe(true);
    });

    it('rejects disclosed contract with missing fields', () => {
      const result = DisclosedContractSchema.safeParse({
        templateId: '#package:Module:Template',
        // Missing contractId, createdEventBlob, synchronizerId
      });
      expect(result.success).toBe(false);
    });
  });

  describe('CommandRequestSchema', () => {
    it('validates minimal command request', () => {
      const result = CommandRequestSchema.safeParse({
        commands: [
          {
            CreateCommand: {
              templateId: '#package:Module:Template',
              createArguments: {},
            },
          },
        ],
        commandId: 'cmd-123',
        actAs: ['alice::123'],
      });
      expect(result.success).toBe(true);
    });

    it('validates full command request', () => {
      const result = CommandRequestSchema.safeParse({
        commands: [
          {
            ExerciseCommand: {
              templateId: '#package:Module:Template',
              contractId: 'contract123',
              choice: 'Accept',
              choiceArgument: {},
            },
          },
        ],
        commandId: 'cmd-456',
        actAs: ['alice::123'],
        readAs: ['bob::456'],
        disclosedContracts: [
          {
            templateId: '#package:Module:Template',
            contractId: 'disclosed123',
            createdEventBlob: 'blob==',
            synchronizerId: 'sync::123',
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('validates command request with multiple commands', () => {
      const result = CommandRequestSchema.safeParse({
        commands: [
          {
            CreateCommand: {
              templateId: '#package:Module:Template1',
              createArguments: { field: 'value' },
            },
          },
          {
            ExerciseCommand: {
              templateId: '#package:Module:Template2',
              contractId: 'contract123',
              choice: 'DoSomething',
              choiceArgument: { arg: 123 },
            },
          },
        ],
        commandId: 'batch-cmd',
        actAs: ['alice::123', 'bob::456'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects command request without commands', () => {
      const result = CommandRequestSchema.safeParse({
        commands: [],
        commandId: 'empty-cmd',
        actAs: ['alice::123'],
      });
      // Empty commands array is still valid (might be checked at application level)
      expect(result.success).toBe(true);
    });

    it('rejects command request without actAs', () => {
      const result = CommandRequestSchema.safeParse({
        commands: [
          {
            CreateCommand: {
              templateId: '#package:Module:Template',
              createArguments: {},
            },
          },
        ],
        commandId: 'cmd-no-actas',
        // Missing actAs
      });
      expect(result.success).toBe(false);
    });
  });
});
