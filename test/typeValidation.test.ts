import {
  EventsByContractIdResponse,
  EventsByContractIdResponseSchema,
} from '../src/clients/ledger-json-api/schemas';
import { SubmitAndWaitForTransactionTreeParamsSchema } from '../src/clients/ledger-json-api/operations/v2/commands/submit-and-wait-for-transaction-tree';

describe('EventsByContractIdResponse validation', () => {
  it('should validate a correct response', (): void => {
    const validResponse: EventsByContractIdResponse = {
      created: {
        createdEvent: {
          offset: 4086,
          nodeId: 8,
          contractId: 'test-contract-id',
          templateId: 'test-template-id',
          contractKey: null,
          createArgument: {},
          createdEventBlob: '',
          interfaceViews: [],
          witnessParties: ['party1'],
          signatories: ['party1'],
          observers: ['party1'],
          createdAt: '2025-07-02T19:51:05.587287Z',
          packageName: 'test-package',
        },
        synchronizerId: 'test-sync-id',
      },
    };

    expect(() =>
      EventsByContractIdResponseSchema.parse(validResponse)
    ).not.toThrow();
  });

  it('should validate a response with archived event', (): void => {
    const validResponse: EventsByContractIdResponse = {
      archived: {
        archivedEvent: {
          offset: 4265,
          nodeId: 8,
          contractId: 'test-contract-id',
          templateId: 'test-template-id',
          witnessParties: ['party1'],
          packageName: 'test-package',
          implementedInterfaces: [],
        },
        synchronizerId: 'test-sync-id',
      },
    };

    expect(() =>
      EventsByContractIdResponseSchema.parse(validResponse)
    ).not.toThrow();
  });

  it('should fail validation when neither created nor archived is present', (): void => {
    const invalidResponse = {};

    expect(() =>
      EventsByContractIdResponseSchema.parse(invalidResponse)
    ).toThrow();
  });

  it('should fail validation when response has extra fields', (): void => {
    const invalidResponse = {
      created: {
        createdEvent: {
          offset: 4086,
          nodeId: 8,
          contractId: 'test-contract-id',
          templateId: 'test-template-id',
          contractKey: null,
          createArgument: {},
          createdEventBlob: '',
          interfaceViews: [],
          witnessParties: ['party1'],
          signatories: ['party1'],
          observers: ['party1'],
          createdAt: '2025-07-02T19:51:05.587287Z',
          packageName: 'test-package',
        },
        synchronizerId: 'test-sync-id',
      },
      extraField: 'should not be here',
    };

    expect(() =>
      EventsByContractIdResponseSchema.parse(invalidResponse)
    ).toThrow();
  });

  it('should fail validation when response is not an object', (): void => {
    const invalidResponse = 'not an object';

    expect(() =>
      EventsByContractIdResponseSchema.parse(invalidResponse)
    ).toThrow();
  });
});

describe('SubmitAndWaitForTransactionTreeParamsSchema', () => {
  it('should validate the format with optional commandId and actAs', () => {
    const validParams = {
      commands: [
        {
          CreateCommand: {
            templateId: 'test-template',
            createArguments: { test: 'value' },
          },
        },
      ],
      commandId: `create-ocp-factory-${Date.now()}`,
      actAs: ['party1', 'party2'],
    };

    const result =
      SubmitAndWaitForTransactionTreeParamsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should validate without optional commandId and actAs', () => {
    const validParams = {
      commands: [
        {
          CreateCommand: {
            templateId: 'test-template',
            createArguments: { test: 'value' },
          },
        },
      ],
    };

    const result =
      SubmitAndWaitForTransactionTreeParamsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should validate with ExerciseCommand', () => {
    const validParams = {
      commands: [
        {
          ExerciseCommand: {
            templateId: 'test-template',
            contractId: 'test-contract-id',
            choice: 'test-choice',
            choiceArgument: { test: 'value' },
          },
        },
      ],
      commandId: 'test-command-id',
      actAs: ['party1'],
    };

    const result =
      SubmitAndWaitForTransactionTreeParamsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should reject invalid command structure', () => {
    const invalidParams = {
      commands: [
        {
          InvalidCommand: {
            templateId: 'test-template',
          },
        },
      ],
    };

    const result =
      SubmitAndWaitForTransactionTreeParamsSchema.safeParse(invalidParams);
    expect(result.success).toBe(false);
  });
});
