import { MockLedgerJsonApiClient } from '../../../../../utils';
import { GetEventsByContractId, EventsByContractIdParams } from '../../../../../../src/clients/ledger-json-api/operations/v2/events/get-events-by-contract-id';
import { mockClientConfig, mockApiUrls } from '../../../../../config/testConfig';

describe('GetEventsByContractId Operation', () => {
  let mockClient: MockLedgerJsonApiClient;
  let operation: InstanceType<typeof GetEventsByContractId>;

  beforeEach(() => {
    mockClient = new MockLedgerJsonApiClient(mockClientConfig);
    operation = new GetEventsByContractId(mockClient);
    mockClient.clearMocks();
  });

  describe('Network Activity Validation', () => {
    it('should make a POST request to the correct events endpoint', async () => {
      // Arrange
      const params: EventsByContractIdParams = {
        contractId: 'contract-123',
      };
      const mockResponse = {
        events: [
          {
            eventId: 'event-1',
            contractId: 'contract-123',
            eventType: 'Created',
            eventData: { field: 'value' },
          },
        ],
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/events/events-by-contract-id`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      const result = await operation.execute(params);

      // Assert
      expect(result).toEqual(mockResponse);
      
      const requests = mockClient.getRequests();
      expect(requests).toHaveLength(1);
      
      const request = requests[0];
      expect(request).toBeDefined();
      expect(request!.method).toBe('POST');
      expect(request!.url).toBe(expectedUrl);
    });

    it('should include proper request data in the POST request', async () => {
      // Arrange
      const params: EventsByContractIdParams = {
        contractId: 'contract-456',
      };
      const mockResponse = { events: [] };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/events/events-by-contract-id`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute(params);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      expect(request?.data).toEqual({
        contractId: 'contract-456',
        eventFormat: {
          verbose: true,
          filtersByParty: expect.any(Object),
        },
      });
    });

    it('should handle optional readAs parameter correctly', async () => {
      // Arrange
      const params: EventsByContractIdParams = {
        contractId: 'contract-789',
        readAs: ['party1', 'party2'],
      };
      const mockResponse = { events: [] };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/events/events-by-contract-id`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute(params);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      expect(request?.data).toEqual({
        contractId: 'contract-789',
        eventFormat: {
          verbose: true,
          filtersByParty: expect.any(Object),
        },
      });
    });
  });

  describe('Error Handling', () => {
    it('should propagate network errors', async () => {
      // Arrange
      const params: EventsByContractIdParams = {
        contractId: 'contract-error',
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/events/events-by-contract-id`;
      const networkError = new Error('Network error');
      
      mockClient.setMockError(expectedUrl, networkError);

      // Act & Assert
      await expect(operation.execute(params)).rejects.toThrow('Network error');
      
      const requests = mockClient.getRequests();
      expect(requests).toHaveLength(1);
    });

    it('should handle contract not found errors', async () => {
      // Arrange
      const params: EventsByContractIdParams = {
        contractId: 'non-existent-contract',
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/events/events-by-contract-id`;
      const notFoundError = new Error('Contract not found');
      
      mockClient.setMockError(expectedUrl, notFoundError);

      // Act & Assert
      await expect(operation.execute(params)).rejects.toThrow('Contract not found');
    });
  });

  describe('Parameter Validation', () => {
    it('should validate required parameters', async () => {
      // Arrange
      const params = {
        // Missing contractId
        eventFormat: { verbose: true },
      } as any;
      
      // Act & Assert
      await expect(operation.execute(params)).rejects.toThrow();
    });

    it('should accept valid parameters without validation errors', async () => {
      // Arrange
      const params: EventsByContractIdParams = {
        contractId: 'valid-contract',
      };
      const mockResponse = { events: [] };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/events/events-by-contract-id`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act & Assert
      await expect(operation.execute(params)).resolves.toEqual(mockResponse);
    });

    it('should handle different contract IDs correctly', async () => {
      // Arrange
      const params: EventsByContractIdParams = {
        contractId: 'format-test-contract',
      };
      const mockResponse = { events: [] };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/events/events-by-contract-id`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute(params);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      expect((request?.data as any)?.contractId).toBe('format-test-contract');
    });
  });
}); 