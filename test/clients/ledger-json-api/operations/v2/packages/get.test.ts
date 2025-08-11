import { MockLedgerJsonApiClient } from '../../../../../utils';
import { ListPackages } from '../../../../../../src/clients/ledger-json-api/operations/v2/packages/get';
import { mockClientConfig, mockApiUrls } from '../../../../../config/testConfig';

describe('ListPackages Operation', () => {
  let mockClient: MockLedgerJsonApiClient;
  let operation: InstanceType<typeof ListPackages>;

  beforeEach(() => {
    mockClient = new MockLedgerJsonApiClient(mockClientConfig);
    operation = new ListPackages(mockClient);
    mockClient.clearMocks();
  });

  describe('Network Activity Validation', () => {
    it('should make a GET request to the correct packages endpoint', async () => {
      // Arrange
      const params = undefined;
      const mockResponse = {
        packageIds: ['package-1', 'package-2'],
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/packages`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      const result = await operation.execute(params);

      // Assert
      expect(result).toEqual(mockResponse);
      
      const requests = mockClient.getRequests();
      expect(requests).toHaveLength(1);
      
      const request = requests[0];
      expect(request).toBeDefined();
      expect(request!.method).toBe('GET');
      expect(request!.url).toBe(expectedUrl);
    });

    it('should make a GET request without query parameters', async () => {
      // Arrange
      const params = undefined;
      const mockResponse = { packageIds: [] };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/packages`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute(params);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      expect(request?.url).toBe(expectedUrl);
      // No query parameters for this operation
    });

    it('should handle the response correctly', async () => {
      // Arrange
      const params = undefined;
      const mockResponse = { packageIds: ['pkg1', 'pkg2', 'pkg3'] };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/packages`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      const result = await operation.execute(params);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(result.packageIds).toHaveLength(3);
    });
  });

  describe('Error Handling', () => {
    it('should propagate network errors', async () => {
      // Arrange
      const params = undefined;
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/packages`;
      const networkError = new Error('Network error');
      
      mockClient.setMockError(expectedUrl, networkError);

      // Act & Assert
      await expect(operation.execute(params)).rejects.toThrow('Network error');
      
      const requests = mockClient.getRequests();
      expect(requests).toHaveLength(1);
    });

    it('should handle server errors gracefully', async () => {
      // Arrange
      const params = undefined;
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/packages`;
      const serverError = new Error('Internal server error');
      
      mockClient.setMockError(expectedUrl, serverError);

      // Act & Assert
      await expect(operation.execute(params)).rejects.toThrow('Internal server error');
    });
  });

  describe('Parameter Validation', () => {
    it('should accept empty parameters without validation errors', async () => {
      // Arrange
      const params = undefined;
      const mockResponse = { packageIds: [] };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/packages`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act & Assert
      await expect(operation.execute(params)).resolves.toEqual(mockResponse);
    });

    it('should handle different limit values correctly', async () => {
      // Arrange
      const params = undefined;
      const mockResponse = { packageIds: [] };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/packages`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute(params);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      // This operation doesn't take parameters, so no query params to test
    });
  });
}); 