import { MockValidatorApiClient } from '../../../../../../../../utils';
import { GetTransferFactory, GetTransferFactoryParams } from '../../../../../../../../../src/clients/validator-api/operations/v0/scan-proxy/registry/transfer-instruction/v1/get-transfer-factory';
import { mockClientConfig, mockApiUrls } from '../../../../../../../../config/testConfig';

describe('GetTransferFactory Operation', () => {
  let mockClient: MockValidatorApiClient;
  let operation: InstanceType<typeof GetTransferFactory>;

  beforeEach(() => {
    mockClient = new MockValidatorApiClient(mockClientConfig);
    operation = new GetTransferFactory(mockClient);
    mockClient.clearMocks();
  });

  describe('Network Activity Validation', () => {
    it('should make a POST request to the correct transfer factory endpoint', async () => {
      // Arrange
      const params: GetTransferFactoryParams = {
        choiceArguments: {},
        excludeDebugFields: false,
      };
      const mockResponse = {
        factoryId: 'test-factory-id',
        choiceContext: {
          choiceName: 'test-choice',
          templateId: 'test-template',
        },
      };
      const expectedUrl = `${mockApiUrls.VALIDATOR_API}/api/validator/v0/scan-proxy/registry/transfer-instruction/v1/transfer-factory`;
      
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
      expect(request!.data).toEqual({
        choiceArguments: {},
        excludeDebugFields: false,
      });
    });

    it('should include proper headers in the request', async () => {
      // Arrange
      const params: GetTransferFactoryParams = {
        choiceArguments: {},
        excludeDebugFields: true,
      };
      const mockResponse = {
        factoryId: 'test-factory-id-2',
        choiceContext: {
          choiceName: 'test-choice-2',
          templateId: 'test-template-2',
        },
      };
      const expectedUrl = `${mockApiUrls.VALIDATOR_API}/api/validator/v0/scan-proxy/registry/transfer-instruction/v1/transfer-factory`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute(params);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      expect(request?.headers).toBeDefined();
      expect(request?.headers?.['Content-Type']).toBe('application/json');
    });

    it('should handle choice arguments in the request', async () => {
      // Arrange
      const params: GetTransferFactoryParams = {
        choiceArguments: {},
        excludeDebugFields: false,
      };
      const mockResponse = {
        factoryId: 'test-factory-id-3',
        choiceContext: {
          choiceName: 'transfer',
          templateId: 'token-transfer-template',
        },
      };
      const expectedUrl = `${mockApiUrls.VALIDATOR_API}/api/validator/v0/scan-proxy/registry/transfer-instruction/v1/transfer-factory`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute(params);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      expect(request?.data).toEqual({
        choiceArguments: {},
        excludeDebugFields: false,
      });
    });

    it('should handle authentication when required', async () => {
      // Arrange
      const params: GetTransferFactoryParams = {
        choiceArguments: {},
        excludeDebugFields: true,
      };
      const mockResponse = {
        factoryId: 'test-factory-id-4',
        choiceContext: {
          choiceName: 'test-choice-4',
          templateId: 'test-template-4',
        },
      };
      const expectedUrl = `${mockApiUrls.VALIDATOR_API}/api/validator/v0/scan-proxy/registry/transfer-instruction/v1/transfer-factory`;
      
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
      const params: GetTransferFactoryParams = {
        choiceArguments: {},
        excludeDebugFields: false,
      };
      const expectedUrl = `${mockApiUrls.VALIDATOR_API}/api/validator/v0/scan-proxy/registry/transfer-instruction/v1/transfer-factory`;
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
        choiceArguments: {},
        // Missing excludeDebugFields
      } as any;
      
      // Act & Assert
      await expect(operation.execute(params)).rejects.toThrow();
    });

    it('should accept valid parameters without validation errors', async () => {
      // Arrange
      const params: GetTransferFactoryParams = {
        choiceArguments: {},
        excludeDebugFields: true,
      };
      const mockResponse = {
        factoryId: 'test-factory-id-5',
        choiceContext: {
          choiceName: 'test-choice-5',
          templateId: 'test-template-5',
        },
      };
      const expectedUrl = `${mockApiUrls.VALIDATOR_API}/api/validator/v0/scan-proxy/registry/transfer-instruction/v1/transfer-factory`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act & Assert
      await expect(operation.execute(params)).resolves.toEqual(mockResponse);
    });
  });
}); 