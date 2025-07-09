import { validateEventsByContractIdResponse } from '../src/utils/validators/eventsByContractIdValidator';
import { EventsByContractIdResponse } from '../src/clients/ledger-json-api/schemas';

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

    expect(validateEventsByContractIdResponse(validResponse)).toBe(true);
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

    expect(validateEventsByContractIdResponse(validResponse)).toBe(true);
  });

  it('should fail validation when neither created nor archived is present', (): void => {
    const invalidResponse = {};

    expect(() => validateEventsByContractIdResponse(invalidResponse)).toThrow(
      'EventsByContractIdResponse must have at least one of: created, archived'
    );
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

    expect(() => validateEventsByContractIdResponse(invalidResponse)).toThrow(
      'EventsByContractIdResponse has unexpected properties: extraField'
    );
  });

  it('should fail validation when response is not an object', (): void => {
    const invalidResponse = 'not an object';

    expect(() => validateEventsByContractIdResponse(invalidResponse)).toThrow(
      'EventsByContractIdResponse must be an object, got string'
    );
  });
});
