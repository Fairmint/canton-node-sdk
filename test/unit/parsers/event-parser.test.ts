import {
  extractEventsFromTransaction,
  findCreatedContractIds,
  findExerciseResult,
  findExercisedEvents,
  getTransactionUpdateId,
  hasTemplateName,
  matchesTemplateId,
  parseArchivedEvent,
  parseCreatedEvent,
  parseExercisedEvent,
  parseTemplateId,
  qualifiedTemplateName,
  requireExerciseResult,
  requireTransactionUpdateId,
  TransactionParseErrorCode,
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
    it('parses CreatedEvent wrappers', () => {
      const result = parseCreatedEvent({
        CreatedEvent: {
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
            contractId: 'contract-1',
            templateId: 'pkg:Module:Template',
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

    it('parses CreatedEvent wrappers with createArguments', () => {
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
      expect(parseCreatedEvent({ CreatedEvent: { templateId: 'pkg:Module:Template' } })).toBeNull();
      expect(parseCreatedEvent({ ExercisedEvent: { contractId: 'contract-1' } })).toBeNull();
    });
  });

  describe('parseArchivedEvent', () => {
    it('parses ArchivedEvent wrappers', () => {
      expect(
        parseArchivedEvent({
          ArchivedEvent: {
            contractId: 'contract-1',
            templateId: 'pkg:Module:Template',
            witnessParties: ['alice'],
            offset: 99,
          },
        })
      ).toEqual({
        contractId: 'contract-1',
        templateId: 'pkg:Module:Template',
        witnessParties: ['alice'],
        offset: 99,
      });
    });

    it('parses lowercase archivedEvent wrappers', () => {
      expect(
        parseArchivedEvent({
          archivedEvent: {
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
      expect(parseArchivedEvent({ ArchivedEvent: { contractId: 'contract-1' } })).toBeNull();
    });
  });

  describe('parseExercisedEvent', () => {
    it('parses ExercisedEvent wrappers', () => {
      expect(
        parseExercisedEvent({
          ExercisedEvent: {
            contractId: 'contract-1',
            templateId: 'pkg:Module:Template',
            choice: 'Archive',
            choiceArgument: { reason: 'done' },
            exerciseResult: { archived: true },
            actingParties: ['alice'],
            consuming: true,
            offset: 10,
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

    it('parses ExercisedEvent wrappers with exerciseArgument', () => {
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
          ExercisedEvent: {
            contractId: 'contract-1',
            templateId: 'pkg:Module:Template',
          },
        })
      ).toBeNull();
    });
  });

  describe('extractEventsFromTransaction', () => {
    it('extracts created, archived, and exercised events from a transaction response', () => {
      const result = extractEventsFromTransaction({
        transaction: {
          events: [
            {
              CreatedEvent: {
                contractId: 'created-1',
                templateId: 'pkg:Module:Created',
              },
            },
            {
              ArchivedEvent: {
                contractId: 'archived-1',
                templateId: 'pkg:Module:Archived',
              },
            },
            {
              ExercisedEvent: {
                contractId: 'exercised-1',
                templateId: 'pkg:Module:Exercised',
                choice: 'Choice',
              },
            },
            { unknown: true },
          ],
        },
      });

      expect(result.created).toHaveLength(1);
      expect(result.created[0]?.contractId).toBe('created-1');
      expect(result.archived).toHaveLength(1);
      expect(result.archived[0]?.contractId).toBe('archived-1');
      expect(result.exercised).toHaveLength(1);
      expect(result.exercised[0]?.contractId).toBe('exercised-1');
    });

    it('extracts from a top-level events array', () => {
      const result = extractEventsFromTransaction({
        events: [
          {
            CreatedEvent: {
              contractId: 'created-1',
              templateId: 'pkg:Module:Created',
            },
          },
        ],
      });

      expect(result.created[0]?.contractId).toBe('created-1');
    });

    it('extracts events and the update id from a getUpdateById response', () => {
      const response = {
        update: {
          Transaction: {
            value: {
              updateId: 'update-lookup',
              events: [
                {
                  CreatedEvent: {
                    contractId: 'created-lookup',
                    templateId: 'pkg:Module:Created',
                  },
                },
              ],
            },
          },
        },
      };

      expect(extractEventsFromTransaction(response).created[0]?.contractId).toBe('created-lookup');
      expect(getTransactionUpdateId(response)).toBe('update-lookup');
      expect(getTransactionUpdateId({ Transaction: { value: { updateId: 'update-direct' } } })).toBe('update-direct');
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

    it('returns empty arrays when no events are present', () => {
      expect(extractEventsFromTransaction({})).toEqual({
        created: [],
        archived: [],
        exercised: [],
      });
    });

    it('preserves ledger event array order', () => {
      const result = extractEventsFromTransaction({
        transaction: {
          events: [createdEvent('created-1'), createdEvent('created-2'), createdEvent('created-10')],
        },
      });

      expect(result.created.map((created) => created.contractId)).toEqual(['created-1', 'created-2', 'created-10']);
    });

    it('reads a bare event array', () => {
      const result = extractEventsFromTransaction([
        { CreatedEvent: { contractId: 'created-1', templateId: 'pkg:Module:Created' } },
      ]);

      expect(result.created[0]?.contractId).toBe('created-1');
    });
  });

  describe('matchesTemplateId', () => {
    it('matches a package id against a package-name filter, and a bare qualified name', () => {
      expect(
        matchesTemplateId(
          'abc123:WrappedAssets.Holding:WrappedAsset',
          '#WrappedAssets-v01:WrappedAssets.Holding:WrappedAsset'
        )
      ).toBe(true);
      expect(matchesTemplateId('abc123:WrappedAssets.Holding:WrappedAsset', 'WrappedAssets.Holding:WrappedAsset')).toBe(
        true
      );
      expect(matchesTemplateId('abc123:WrappedAssets.Holding:WrappedAsset', 'WrappedAsset')).toBe(true);
    });

    it('does not match a different module or template', () => {
      expect(matchesTemplateId('abc123:WrappedAssets.Holding:WrappedAsset', 'WrappedAssets.Locked:WrappedAsset')).toBe(
        false
      );
      expect(matchesTemplateId('abc123:WrappedAssets.Holding:WrappedAsset', 'FrozenWrappedAsset')).toBe(false);
      expect(matchesTemplateId('abc123:WrappedAssets.Holding:WrappedAsset', '')).toBe(false);
    });

    it('keeps nested module delimiters as part of the module', () => {
      expect(matchesTemplateId('pkg:Module:Nested:Template', 'Module:Nested:Template')).toBe(true);
      expect(matchesTemplateId('pkg:Module:Nested:Template', '#name:Module:Nested:Template')).toBe(true);
      expect(qualifiedTemplateName('pkg:Module:Nested:Template')).toBe('Module:Nested:Template');
    });
  });

  describe('transaction lookups', () => {
    const transaction = {
      transaction: {
        updateId: 'update-1',
        events: [
          {
            ExercisedEvent: {
              contractId: 'cid-1',
              templateId: 'pkg:Module:Factory',
              choice: 'Freeze',
              exerciseResult: 'cid-frozen',
            },
          },
          { CreatedEvent: { contractId: 'created-1', templateId: 'pkg:Module:Holding' } },
          { CreatedEvent: { contractId: 'created-2', templateId: 'pkg:Module:Other' } },
          {
            ExercisedEvent: {
              contractId: 'cid-2',
              templateId: 'pkg:Module:Factory',
              choice: 'Unfreeze',
              exerciseResult: null,
            },
          },
        ],
      },
    };

    it('reads the update id from every wrapper shape', () => {
      expect(getTransactionUpdateId(transaction)).toBe('update-1');
      expect(getTransactionUpdateId({ updateId: 'update-3' })).toBe('update-3');
      expect(getTransactionUpdateId({ transaction: { events: [] } })).toBeUndefined();
      expect(() => requireTransactionUpdateId('not a transaction')).toThrow('The transaction names no update id.');
    });

    it('returns the raw result of a named choice, including a falsy one', () => {
      expect(requireExerciseResult(transaction, 'Freeze')).toBe('cid-frozen');
      expect(requireExerciseResult(transaction, ['Unfreeze'])).toBeNull();
      expect(findExerciseResult(transaction, 'Missing')).toBeUndefined();
    });

    it('takes the earliest matching exercise when given several choices, not the first choice listed', () => {
      expect(requireExerciseResult(transaction, ['Unfreeze', 'Freeze'])).toBe('cid-frozen');
    });

    it('reports a choice the transaction did not exercise', () => {
      let thrown: unknown;
      try {
        requireExerciseResult(transaction, 'Missing');
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toMatchObject({
        name: 'TransactionParseError',
        code: TransactionParseErrorCode.EXERCISE_RESULT_NOT_FOUND,
        context: { choice: 'Missing', updateId: 'update-1' },
      });
    });

    it('finds every exercise of one choice, and narrows created contract ids by template', () => {
      expect(findExercisedEvents(transaction, 'Freeze').map((event) => event.contractId)).toEqual(['cid-1']);
      expect(findCreatedContractIds(transaction)).toEqual(['created-1', 'created-2']);
      expect(findCreatedContractIds(transaction, 'Module:Holding')).toEqual(['created-1']);
      expect(findCreatedContractIds(transaction, 'Missing')).toEqual([]);
    });
  });
});

function createdEvent(contractId: string): unknown {
  return { CreatedEvent: { contractId, templateId: 'pkg:Module:Created' } };
}
