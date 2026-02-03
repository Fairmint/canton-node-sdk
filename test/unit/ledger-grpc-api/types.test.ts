import {
  createCreateCommand,
  createDamlRecord,
  createExerciseCommand,
  formatIdentifier,
  parseIdentifier,
  Values,
} from '../../../src/clients/ledger-grpc-api';

describe('Ledger gRPC API Types', () => {
  describe('parseIdentifier', () => {
    it('parses a valid qualified identifier', () => {
      const result = parseIdentifier('pkg-123:Module.Name:TemplateName');

      expect(result).toEqual({
        packageId: 'pkg-123',
        moduleName: 'Module.Name',
        entityName: 'TemplateName',
      });
    });

    it('throws for invalid format', () => {
      expect(() => parseIdentifier('invalid')).toThrow(
        'Invalid identifier format: invalid. Expected "packageId:moduleName:entityName"'
      );
    });

    it('throws for too few parts', () => {
      expect(() => parseIdentifier('pkg:module')).toThrow(
        'Invalid identifier format: pkg:module. Expected "packageId:moduleName:entityName"'
      );
    });
  });

  describe('formatIdentifier', () => {
    it('formats an identifier as a qualified string', () => {
      const result = formatIdentifier({
        packageId: 'pkg-123',
        moduleName: 'Module.Name',
        entityName: 'TemplateName',
      });

      expect(result).toBe('pkg-123:Module.Name:TemplateName');
    });
  });

  describe('Values helpers', () => {
    it('creates text value', () => {
      expect(Values.text('hello')).toEqual({ text: 'hello' });
    });

    it('creates int64 value from number', () => {
      expect(Values.int64(42)).toEqual({ int64: '42' });
    });

    it('creates int64 value from bigint', () => {
      expect(Values.int64(BigInt('9007199254740993'))).toEqual({
        int64: '9007199254740993',
      });
    });

    it('creates numeric value', () => {
      expect(Values.numeric('123.456')).toEqual({ numeric: '123.456' });
    });

    it('creates bool value', () => {
      expect(Values.bool(true)).toEqual({ bool: true });
    });

    it('creates party value', () => {
      expect(Values.party('Alice::1234')).toEqual({ party: 'Alice::1234' });
    });

    it('creates contractId value', () => {
      expect(Values.contractId('contract-123')).toEqual({
        contractId: 'contract-123',
      });
    });

    it('creates unit value', () => {
      expect(Values.unit()).toEqual({ unit: {} });
    });

    it('creates list value', () => {
      expect(Values.list([Values.text('a'), Values.text('b')])).toEqual({
        list: { elements: [{ text: 'a' }, { text: 'b' }] },
      });
    });

    it('creates optional value with value', () => {
      expect(Values.optional(Values.text('present'))).toEqual({
        optional: { value: { text: 'present' } },
      });
    });

    it('creates optional value without value', () => {
      expect(Values.optional()).toEqual({ optional: { value: undefined } });
    });

    it('creates record value', () => {
      const result = Values.record({
        name: Values.text('Alice'),
        age: Values.int64(30),
      });

      expect(result).toEqual({
        record: {
          fields: [
            { label: 'name', value: { text: 'Alice' } },
            { label: 'age', value: { int64: '30' } },
          ],
        },
      });
    });
  });

  describe('createDamlRecord', () => {
    it('creates record without recordId', () => {
      const result = createDamlRecord({
        field1: Values.text('value1'),
      });

      expect(result).toEqual({
        fields: [{ label: 'field1', value: { text: 'value1' } }],
      });
      expect(result.recordId).toBeUndefined();
    });

    it('creates record with recordId', () => {
      const recordId = {
        packageId: 'pkg',
        moduleName: 'Module',
        entityName: 'Type',
      };
      const result = createDamlRecord({ field1: Values.text('value1') }, recordId);

      expect(result).toEqual({
        recordId,
        fields: [{ label: 'field1', value: { text: 'value1' } }],
      });
    });
  });

  describe('createCreateCommand', () => {
    it('creates a create command', () => {
      const templateId = {
        packageId: 'pkg',
        moduleName: 'Module',
        entityName: 'Asset',
      };
      const createArguments = createDamlRecord({
        owner: Values.party('Alice::1234'),
      });

      const result = createCreateCommand(templateId, createArguments);

      expect(result).toEqual({
        create: {
          templateId,
          createArguments,
        },
      });
    });
  });

  describe('createExerciseCommand', () => {
    it('creates an exercise command', () => {
      const templateId = {
        packageId: 'pkg',
        moduleName: 'Module',
        entityName: 'Asset',
      };

      const result = createExerciseCommand(
        templateId,
        'contract-123',
        'Transfer',
        Values.record({ newOwner: Values.party('Bob::5678') })
      );

      expect(result).toEqual({
        exercise: {
          templateId,
          contractId: 'contract-123',
          choice: 'Transfer',
          choiceArgument: {
            record: {
              fields: [{ label: 'newOwner', value: { party: 'Bob::5678' } }],
            },
          },
        },
      });
    });
  });
});
