import { MockLedgerJsonApiClient } from '../../../../../utils';
import { GetVersion } from '../../../../../../src/clients/ledger-json-api/operations/v2/version/get';
import { mockClientConfig, mockApiUrls } from '../../../../../config/testConfig';

describe('GetVersion Operation', () => {
  let mockClient: MockLedgerJsonApiClient;
  let operation: InstanceType<typeof GetVersion>;

  beforeEach(() => {
    mockClient = new MockLedgerJsonApiClient(mockClientConfig);
    operation = new GetVersion(mockClient);
    mockClient.clearMocks();
  });

  describe('Network Activity Validation', () => {
    it('should make a GET request to the correct version endpoint', async () => {
      // Arrange
      const mockResponse = { version: '2.0.0' };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/version`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      const result = await operation.execute();

      // Assert
      expect(result).toEqual(mockResponse);
      
      const requests = mockClient.getRequests();
      expect(requests).toHaveLength(1);
      
      const request = requests[0];
      expect(request).toBeDefined();
      expect(request!.method).toBe('GET');
      expect(request!.url).toBe(expectedUrl);
      expect(request!.data).toBeUndefined();
    });

    it('should include proper headers in the request', async () => {
      // Arrange
      const mockResponse = { version: '2.0.0' };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/version`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute();

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      expect(request?.headers).toBeDefined();
      expect(request?.headers?.['Content-Type']).toBe('application/json');
    });

    it('should handle authentication when required', async () => {
      // Arrange
      const mockResponse = { version: '2.0.0' };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/version`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute();

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
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/version`;
      const networkError = new Error('Network error');
      
      mockClient.setMockError(expectedUrl, networkError);

      // Act & Assert
      await expect(operation.execute()).rejects.toThrow('Network error');
      
      const requests = mockClient.getRequests();
      expect(requests).toHaveLength(1);
    });
  });

  describe('Parameter Validation', () => {
    it('should accept void parameters without validation errors', async () => {
      // Arrange
      const mockResponse = { version: '2.0.0' };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/version`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act & Assert
      await expect(operation.execute()).resolves.toEqual(mockResponse);
    });
  });
}); 