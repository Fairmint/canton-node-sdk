import { MockLedgerJsonApiClient } from '../../../../../utils';
import { UpdateUserIdentityProvider } from '../../../../../../src/UpdateUserIdentityProvider';
import { mockClientConfig, mockApiUrls } from '../../../../../config/testConfig';

describe('UpdateUserIdentityProvider Operation', () => {
  let mockClient: MockLedgerJsonApiClient;
  let operation: InstanceType<typeof UpdateUserIdentityProvider>;

  beforeEach(() => {
    mockClient = new MockLedgerJsonApiClient(mockClientConfig);
    operation = new UpdateUserIdentityProvider(mockClient);
    mockClient.clearMocks();
  });

  describe('Network Activity Validation', () => {
    it('should make a PATCH request to the correct endpoint', async () => {
      // Arrange
      const params = {};
      const mockResponse = {};
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/users/{user-id}/identity-provider-id`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      const result = await operation.execute(params);

      // Assert
      expect(result).toEqual(mockResponse);
      
      const requests = mockClient.getRequests();
      expect(requests).toHaveLength(1);
      
      const request = requests[0];
      expect(request).toBeDefined();
      expect(request!.method).toBe('PATCH');
      expect(request!.url).toBe(expectedUrl);
    });

    it('should include proper headers in the request', async () => {
      // Arrange
      const params = {};
      const mockResponse = {};
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/users/{user-id}/identity-provider-id`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute(params);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      expect(request?.headers).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should propagate network errors', async () => {
      // Arrange
      const params = {};
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/users/{user-id}/identity-provider-id`;
      const networkError = new Error('Network error');
      
      mockClient.setMockError(expectedUrl, networkError);

      // Act & Assert
      await expect(operation.execute(params)).rejects.toThrow('Network error');
      
      const requests = mockClient.getRequests();
      expect(requests).toHaveLength(1);
    });
  });

  describe('Parameter Validation', () => {
    it('should accept valid parameters', async () => {
      // Arrange
      const params = {};
      const mockResponse = {};
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/users/{user-id}/identity-provider-id`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act & Assert
      await expect(operation.execute(params)).resolves.toEqual(mockResponse);
    });
  });
});
