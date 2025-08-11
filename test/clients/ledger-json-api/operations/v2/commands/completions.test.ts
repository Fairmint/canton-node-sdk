import { MockLedgerJsonApiClient } from '../../../../../utils';
import { Completions } from '../../../../../../src/clients/ledger-json-api/operations/v2/commands/completions';
import { mockClientConfig, mockApiUrls } from '../../../../../config/testConfig';

describe('Completions Operation', () => {
  let mockClient: MockLedgerJsonApiClient;
  let operation: InstanceType<typeof Completions>;

  beforeEach(() => {
    mockClient = new MockLedgerJsonApiClient(mockClientConfig);
    operation = new Completions(mockClient);
    mockClient.clearMocks();
  });

  describe('Network Activity Validation', () => {
    it('should make a POST request to the correct completions endpoint', async () => {
      // Arrange
      const params = {
        userId: 'user-123',
        parties: ['party1', 'party2'],
        beginExclusive: 100,
        limit: 50,
      };
      const mockResponse = {
        completionResponse: {
          Completion: {
            value: {
              commandId: 'cmd-123',
              status: { code: 0, message: 'OK' },
            },
          },
        },
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/completions?limit=50`;
      
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
      expect(request!.data).toMatchObject({
        userId: params.userId,
        parties: params.parties,
        beginExclusive: params.beginExclusive,
      });
    });

    it('should include proper headers in the request', async () => {
      // Arrange
      const params = {
        userId: 'user-456',
        parties: ['party1'],
        beginExclusive: 200,
        streamIdleTimeoutMs: 5000,
      };
      const mockResponse = {
        completionResponse: {
          Completion: {
            value: {
              commandId: 'cmd-456',
              status: { code: 0, message: 'OK' },
            },
          },
        },
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/completions?stream_idle_timeout_ms=5000`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute(params);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      expect(request?.headers).toBeDefined();
      expect(request?.headers?.['Content-Type']).toBe('application/json');
    });
  });

  describe('Error Handling', () => {
    it('should propagate network errors', async () => {
      // Arrange
      const params = {
        userId: 'user-error',
        parties: ['party1'],
        beginExclusive: 300,
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/completions`;
      const networkError = new Error('Network error');
      
      mockClient.setMockError(expectedUrl, networkError);

      // Act & Assert
      await expect(operation.execute(params)).rejects.toThrow('Network error');
      
      const requests = mockClient.getRequests();
      expect(requests).toHaveLength(1);
    });

    it('should handle validation errors', async () => {
      // Arrange
      const params = {
        userId: 'user-invalid',
        parties: [], // Empty parties array should cause validation error
        beginExclusive: 400,
      } as any;
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/completions`;
      const validationError = new Error('Validation failed');
      
      mockClient.setMockError(expectedUrl, validationError);

      // Act & Assert
      await expect(operation.execute(params)).rejects.toThrow('Validation failed');
    });
  });

  describe('Parameter Validation', () => {
    it('should validate required parameters', async () => {
      // Arrange
      const params = {
        userId: 'user-valid',
        parties: ['party1'],
        beginExclusive: 500,
      };
      const mockResponse = {
        completionResponse: {
          Completion: {
            value: {
              commandId: 'cmd-valid',
              status: { code: 0, message: 'OK' },
            },
          },
        },
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/completions`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act & Assert
      await expect(operation.execute(params)).resolves.toEqual(mockResponse);
    });

    it('should handle optional parameters correctly', async () => {
      // Arrange
      const params = {
        userId: 'user-optional',
        parties: ['party1', 'party2'],
        beginExclusive: 600,
        limit: 100,
        streamIdleTimeoutMs: 10000,
      };
      const mockResponse = {
        completionResponse: {
          Completion: {
            value: {
              commandId: 'cmd-optional',
              status: { code: 0, message: 'OK' },
            },
          },
        },
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/completions?limit=100&stream_idle_timeout_ms=10000`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      const result = await operation.execute(params);

      // Assert
      expect(result).toEqual(mockResponse);
    });

    it('should reject invalid parameters', async () => {
      // Arrange
      const params = {
        userId: '', // Empty userId should cause validation error
        parties: [], // Empty parties array should cause validation error
        beginExclusive: 'invalid' as any, // Invalid type should cause validation error
      };
      
      // Act & Assert
      // This operation uses a schema, so it should validate parameters
      await expect(operation.execute(params)).rejects.toThrow();
    });
  });
}); 