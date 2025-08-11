import { MockLedgerJsonApiClient } from '../../../../../utils';
import { DeleteUser, DeleteUserParams } from '../../../../../../src/clients/ledger-json-api/operations/v2/users/delete-user';
import { mockClientConfig, mockApiUrls } from '../../../../../config/testConfig';

describe('DeleteUser Operation', () => {
  let mockClient: MockLedgerJsonApiClient;
  let operation: InstanceType<typeof DeleteUser>;

  beforeEach(() => {
    mockClient = new MockLedgerJsonApiClient(mockClientConfig);
    operation = new DeleteUser(mockClient);
    mockClient.clearMocks();
  });

  describe('Network Activity Validation', () => {
    it('should make a DELETE request to the correct user endpoint', async () => {
      // Arrange
      const params: DeleteUserParams = {
        userId: 'test-user-123',
      };
      const mockResponse = { success: true };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/users/test-user-123`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      const result = await operation.execute(params);

      // Assert
      expect(result).toEqual(mockResponse);
      
      const requests = mockClient.getRequests();
      expect(requests).toHaveLength(1);
      
      const request = requests[0];
      expect(request).toBeDefined();
      expect(request!.method).toBe('DELETE');
      expect(request!.url).toBe(expectedUrl);
      expect(request!.data).toBeUndefined();
    });

    it('should include proper headers in the request', async () => {
      // Arrange
      const params: DeleteUserParams = {
        userId: 'test-user-456',
      };
      const mockResponse = { success: true };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/users/test-user-456`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute(params);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      expect(request?.headers).toBeDefined();
      expect(request?.headers?.['Content-Type']).toBe('application/json');
    });

    it('should handle authentication when required', async () => {
      // Arrange
      const params: DeleteUserParams = {
        userId: 'test-user-789',
      };
      const mockResponse = { success: true };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/users/test-user-789`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute(params);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      // The operation should include bearer token by default
      expect(request?.headers).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should propagate network errors', async () => {
      // Arrange
      const params: DeleteUserParams = {
        userId: 'error-user-123',
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/users/error-user-123`;
      const networkError = new Error('Network error');
      
      mockClient.setMockError(expectedUrl, networkError);

      // Act & Assert
      await expect(operation.execute(params)).rejects.toThrow('Network error');
      
      const requests = mockClient.getRequests();
      expect(requests).toHaveLength(1);
    });
  });

  describe('Parameter Validation', () => {
    it('should validate required parameters', async () => {
      // Arrange
      const params = {
        // Missing userId
      } as any;
      
      // Act & Assert
      await expect(operation.execute(params)).rejects.toThrow();
    });

    it('should accept valid parameters without validation errors', async () => {
      // Arrange
      const params: DeleteUserParams = {
        userId: 'valid-user-123',
      };
      const mockResponse = { success: true };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/users/valid-user-123`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act & Assert
      await expect(operation.execute(params)).resolves.toEqual(mockResponse);
    });
  });
}); 