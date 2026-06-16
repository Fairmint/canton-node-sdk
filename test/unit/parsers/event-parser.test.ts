import {
  extractEventsFromTransaction,
  hasTemplateName,
  parseArchivedEvent,
  parseCreatedEvent,
  parseExercisedEvent,
  parseTemplateId,
} from '../../../src/utils/parsers/event-parser';

describe('event-parser', () => {
  describe('parseTemplateId', () => {
    it('parses package id, module, and template name', () => {
      expect(parseTemplateId('#splice-amulet:Splice.Amulet:AppRewardCoupon')).toEqual({
        packageId: '#splice-amulet',
        module: 'Splice.Amulet',
        templateName: 'AppRewardCoupon',
      });
    });

    it('keeps extra module delimiters with the module component', () => {
      expect(parseTemplateId('pkg:Module:Nested:Template')).toEqual({
        packageId: 'pkg',
        module: 'Module:Nested',
        templateName: 'Template',
      });
    });

    it('throws for invalid template ids', () => {
      expect(() => parseTemplateId('pkg:OnlyModule')).toThrow('Invalid templateId');
    });

    it('matches exact template names', () => {
      expect(hasTemplateName('pkg:Module:TransferPreapproval', 'TransferPreapproval')).toBe(true);
      expect(hasTemplateName('pkg:Module:NotTransferPreapproval', 'TransferPreapproval')).toBe(false);
      expect(hasTemplateName('pkg::TransferPreapproval', 'TransferPreapproval')).toBe(false);
      expect(hasTemplateName('TransferPreapproval', 'TransferPreapproval')).toBe(false);
    });
  });

  describe('parseCreatedEvent', () => {
    it('parses CreatedTreeEvent wrappers', () => {
      const result = parseCreatedEvent({
        CreatedTreeEvent: {
          value: {
            contractId: 'contract-1',
            templateId: 'pkg:Module:Template',
            packageName: 'package-name',
            createArgument: { owner: 'alice' },
            witnessParties: ['alice'],
            signatories: ['alice'],
            observers: ['bob'],
            offset: 12,
            nodeId: 1,
            createdEventBlob: 'blob',
          },
        },
      });

      expect(result).toEqual({
        contractId: 'contract-1',
        templateId: 'pkg:Module:Template',
        packageName: 'package-name',
        createArgument: { owner: 'alice' },
        witnessParties: ['alice'],
        signatories: ['alice'],
        observers: ['bob'],
        offset: 12,
        nodeId: 1,
        createdEventBlob: 'blob',
      });
    });

    it('parses CreatedEvent wrappers and defaults missing createArgument', () => {
      expect(
        parseCreatedEvent({
          CreatedEvent: {
            value: {
              contractId: 'contract-1',
              templateId: 'pkg:Module:Template',
            },
          },
          synchronizerId: 'sync-1',
        })
      ).toEqual({
        contractId: 'contract-1',
        templateId: 'pkg:Module:Template',
        createArgument: {},
        synchronizerId: 'sync-1',
      });
    });

    it('parses flattened CreatedEvent wrappers', () => {
      expect(
        parseCreatedEvent({
          CreatedEvent: {
            contractId: 'contract-1',
            templateId: 'pkg:Module:Template',
            createArguments: { owner: 'alice' },
          },
        })
      ).toEqual({
        contractId: 'contract-1',
        templateId: 'pkg:Module:Template',
        createArgument: { owner: 'alice' },
      });
    });

    it('parses lowercase createdEvent wrappers', () => {
      expect(
        parseCreatedEvent({
          createdEvent: {
            contractId: 'contract-1',
            templateId: 'pkg:Module:Template',
          },
        })
      ).toEqual({
        contractId: 'contract-1',
        templateId: 'pkg:Module:Template',
        createArgument: {},
      });
    });

    it('returns null for malformed created events', () => {
      expect(parseCreatedEvent({ CreatedTreeEvent: { value: { templateId: 'pkg:Module:Template' } } })).toBeNull();
      expect(parseCreatedEvent({ ExercisedTreeEvent: { value: { contractId: 'contract-1' } } })).toBeNull();
    });
  });

  describe('parseArchivedEvent', () => {
    it('parses ArchivedTreeEvent wrappers', () => {
      expect(
        parseArchivedEvent({
          ArchivedTreeEvent: {
            value: {
              contractId: 'contract-1',
              templateId: 'pkg:Module:Template',
              witnessParties: ['alice'],
              offset: 99,
            },
          },
        })
      ).toEqual({
        contractId: 'contract-1',
        templateId: 'pkg:Module:Template',
        witnessParties: ['alice'],
        offset: 99,
      });
    });

    it('parses flattened ArchivedEvent wrappers', () => {
      expect(
        parseArchivedEvent({
          ArchivedEvent: {
            contractId: 'contract-1',
            templateId: 'pkg:Module:Template',
          },
        })
      ).toEqual({
        contractId: 'contract-1',
        templateId: 'pkg:Module:Template',
      });
    });

    it('returns null for malformed archived events', () => {
      expect(parseArchivedEvent({ ArchivedTreeEvent: { value: { contractId: 'contract-1' } } })).toBeNull();
    });
  });

  describe('parseExercisedEvent', () => {
    it('parses ExercisedTreeEvent wrappers', () => {
      expect(
        parseExercisedEvent({
          ExercisedTreeEvent: {
            value: {
              contractId: 'contract-1',
              templateId: 'pkg:Module:Template',
              choice: 'Archive',
              choiceArgument: { reason: 'done' },
              exerciseResult: { archived: true },
              actingParties: ['alice'],
              consuming: true,
              offset: 10,
            },
          },
        })
      ).toEqual({
        contractId: 'contract-1',
        templateId: 'pkg:Module:Template',
        choice: 'Archive',
        exerciseArgument: { reason: 'done' },
        exerciseResult: { archived: true },
        actingParties: ['alice'],
        consuming: true,
        offset: 10,
      });
    });

    it('parses flattened ExercisedEvent wrappers', () => {
      expect(
        parseExercisedEvent({
          ExercisedEvent: {
            contractId: 'contract-1',
            templateId: 'pkg:Module:Template',
            choice: 'Archive',
          },
        })
      ).toEqual({
        contractId: 'contract-1',
        templateId: 'pkg:Module:Template',
        choice: 'Archive',
      });
    });

    it('preserves non-record exercise values', () => {
      expect(
        parseExercisedEvent({
          ExercisedEvent: {
            contractId: 'contract-1',
            templateId: 'pkg:Module:Template',
            choice: 'Archive',
            choiceArgument: ['contract-1'],
            exerciseResult: null,
          },
        })
      ).toEqual({
        contractId: 'contract-1',
        templateId: 'pkg:Module:Template',
        choice: 'Archive',
        exerciseArgument: ['contract-1'],
        exerciseResult: null,
      });
    });

    it('returns null for malformed exercised events', () => {
      expect(
        parseExercisedEvent({
          ExercisedTreeEvent: {
            value: {
              contractId: 'contract-1',
              templateId: 'pkg:Module:Template',
            },
          },
        })
      ).toBeNull();
    });
  });

  describe('extractEventsFromTransaction', () => {
    it('extracts created, archived, and exercised events from a transaction tree response', () => {
      const result = extractEventsFromTransaction({
        transactionTree: {
          eventsById: {
            '1': {
              CreatedTreeEvent: {
                value: {
                  contractId: 'created-1',
                  templateId: 'pkg:Module:Created',
                },
              },
            },
            '2': {
              ArchivedTreeEvent: {
                value: {
                  contractId: 'archived-1',
                  templateId: 'pkg:Module:Archived',
                },
              },
            },
            '3': {
              ExercisedTreeEvent: {
                value: {
                  contractId: 'exercised-1',
                  templateId: 'pkg:Module:Exercised',
                  choice: 'Choice',
                },
              },
            },
            '4': { unknown: true },
          },
        },
      });

      expect(result.created).toHaveLength(1);
      expect(result.created[0]?.contractId).toBe('created-1');
      expect(result.archived).toHaveLength(1);
      expect(result.archived[0]?.contractId).toBe('archived-1');
      expect(result.exercised).toHaveLength(1);
      expect(result.exercised[0]?.contractId).toBe('exercised-1');
    });

    it('extracts from transaction.eventsById shapes', () => {
      const result = extractEventsFromTransaction({
        transaction: {
          eventsById: {
            '1': {
              CreatedEvent: {
                value: {
                  contractId: 'created-1',
                  templateId: 'pkg:Module:Created',
                },
              },
            },
          },
        },
      });

      expect(result.created[0]?.contractId).toBe('created-1');
    });

    it('extracts from transaction.events arrays', () => {
      const result = extractEventsFromTransaction({
        transaction: {
          events: [
            {
              CreatedEvent: {
                contractId: 'created-1',
                templateId: 'pkg:Module:Created',
              },
            },
          ],
        },
      });

      expect(result.created[0]?.contractId).toBe('created-1');
    });

    it('returns empty arrays when no event map is present', () => {
      expect(extractEventsFromTransaction({})).toEqual({
        created: [],
        archived: [],
        exercised: [],
      });
    });
  });
});
