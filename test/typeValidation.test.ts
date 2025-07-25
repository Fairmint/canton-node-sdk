import {
  EventsByContractIdResponse,
  EventsByContractIdResponseSchema,
} from '../src/clients/ledger-json-api/schemas';

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
