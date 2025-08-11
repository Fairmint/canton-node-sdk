import { MockValidatorApiClient } from '../../../../../../../../utils';
import { GetInstrument } from '../../../../../../../../../src/GetInstrument';
import { mockClientConfig, mockApiUrls } from '../../../../../../../../config/testConfig';

describe('GetInstrument Operation', () => {
  let mockClient: MockValidatorApiClient;
  let operation: InstanceType<typeof GetInstrument>;

  beforeEach(() => {
    mockClient = new MockValidatorApiClient(mockClientConfig);
    operation = new GetInstrument(mockClient);
    mockClient.clearMocks();
  });

  describe('Network Activity Validation', () => {
    it('should make a GET request to the correct endpoint', async () => {
      // Arrange
      const params = {};
      const mockResponse = {};
      const expectedUrl = `${mockApiUrls.VALIDATOR_API}/api/validator/v0/scan-proxy/registry/metadata/v1/instruments`;
      
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

    it('should include proper headers in the request', async () => {
      // Arrange
      const params = {};
      const mockResponse = {};
      const expectedUrl = `${mockApiUrls.VALIDATOR_API}/api/validator/v0/scan-proxy/registry/metadata/v1/instruments`;
      
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
      const expectedUrl = `${mockApiUrls.VALIDATOR_API}/api/validator/v0/scan-proxy/registry/metadata/v1/instruments`;
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
      const expectedUrl = `${mockApiUrls.VALIDATOR_API}/api/validator/v0/scan-proxy/registry/metadata/v1/instruments`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act & Assert
      await expect(operation.execute(params)).resolves.toEqual(mockResponse);
    });
  });
});
