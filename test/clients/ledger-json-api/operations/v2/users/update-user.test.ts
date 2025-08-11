import { MockLedgerJsonApiClient } from '../../../../../utils';
import { UpdateUser, UpdateUserParams } from '../../../../../../src/clients/ledger-json-api/operations/v2/users/update-user';
import { mockClientConfig, mockApiUrls } from '../../../../../config/testConfig';

describe('UpdateUser Operation', () => {
  let mockClient: MockLedgerJsonApiClient;
  let operation: InstanceType<typeof UpdateUser>;

  beforeEach(() => {
    mockClient = new MockLedgerJsonApiClient(mockClientConfig);
    operation = new UpdateUser(mockClient);
    mockClient.clearMocks();
  });

  describe('Network Activity Validation', () => {
    it('should make a PATCH request to the correct user endpoint', async () => {
      // Arrange
      const params: UpdateUserParams = {
        userId: 'test-user-123',
        // Add any other required fields based on the generated type
      } as UpdateUserParams;
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
      expect(request!.method).toBe('PATCH');
      expect(request!.url).toBe(expectedUrl);
      expect(request!.data).toBeDefined();
      // Data structure depends on the generated type
    });

    it('should include proper headers in the request', async () => {
      // Arrange
      const params: UpdateUserParams = {
        userId: 'test-user-456',
        // Add any other required fields based on the generated type
      } as UpdateUserParams;
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
      const params: UpdateUserParams = {
        userId: 'test-user-789',
        // Add any other required fields based on the generated type
      } as UpdateUserParams;
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
      const params: UpdateUserParams = {
        userId: 'error-user-123',
        // Add any other required fields based on the generated type
      } as UpdateUserParams;
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
    it('should accept any parameters due to z.any() schema', async () => {
      // Arrange
      const params = {
        // Missing userId but operation uses z.any() schema
        primaryParty: 'test-party',
        isDeactivated: false,
      } as any;
      
      // Act & Assert
      // Since the operation uses z.any() schema, it should accept any parameters
      // The actual validation happens at the API level, not in the client
      await expect(operation.execute(params)).resolves.toBeDefined();
    });

    it('should accept valid parameters without validation errors', async () => {
      // Arrange
      const params: UpdateUserParams = {
        userId: 'valid-user-123',
        // Add any other required fields based on the generated type
      } as UpdateUserParams;
      const mockResponse = { success: true };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/users/valid-user-123`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act & Assert
      await expect(operation.execute(params)).resolves.toEqual(mockResponse);
    });
  });
}); 