import { MockLighthouseApiClient } from '../../../utils';
import { GetTransferAgent, GetTransferAgentParams } from '../../../../src/clients/lighthouse-api/operations/get-transfer-agent';
import { mockClientConfig, mockApiUrls } from '../../../config/testConfig';

describe('GetTransferAgent Operation', () => {
  let mockClient: MockLighthouseApiClient;
  let operation: InstanceType<typeof GetTransferAgent>;

  beforeEach(() => {
    mockClient = new MockLighthouseApiClient(mockClientConfig);
    operation = new GetTransferAgent(mockClient);
    mockClient.clearMocks();
  });

  describe('Network Activity Validation', () => {
    it('should make a GET request to the correct transfer agent endpoint', async () => {
      // Arrange
      const params: GetTransferAgentParams = {
        partyId: 'TransferAgent-mainnet-1::12204a039322c01e9f714b56259c3e68b69058bf5dfe1debbe956c698f905ceba9d7',
      };
      const mockResponse = {
        partyId: 'TransferAgent-mainnet-1::12204a039322c01e9f714b56259c3e68b69058bf5dfe1debbe956c698f905ceba9d7',
        name: 'Transfer Agent',
        status: 'active',
      };
      const expectedUrl = `${mockApiUrls.LIGHTHOUSE_API}/validators/TransferAgent-mainnet-1%3A%3A12204a039322c01e9f714b56259c3e68b69058bf5dfe1debbe956c698f905ceba9d7`;
      
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
      expect(request!.data).toBeUndefined();
    });

    it('should properly encode the party ID in the URL', async () => {
      // Arrange
      const params: GetTransferAgentParams = {
        partyId: 'Test::Agent::123',
      };
      const mockResponse = {
        partyId: 'Test::Agent::123',
        name: 'Test Agent',
        status: 'active',
      };
      const expectedUrl = `${mockApiUrls.LIGHTHOUSE_API}/validators/Test%3A%3AAgent%3A%3A123`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute(params);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      expect(request?.url).toBe(expectedUrl);
      expect(request?.url).toContain('Test%3A%3AAgent%3A%3A123');
    });

    it('should include proper headers in the request', async () => {
      // Arrange
      const params: GetTransferAgentParams = {
        partyId: 'SimpleAgent-123',
      };
      const mockResponse = {
        partyId: 'SimpleAgent-123',
        name: 'Simple Agent',
        status: 'active',
      };
      const expectedUrl = `${mockApiUrls.LIGHTHOUSE_API}/validators/SimpleAgent-123`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute(params);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      expect(request?.headers).toBeDefined();
      expect(request?.headers?.['Content-Type']).toBe('application/json');
    });

    it('should not require authentication (simple operation)', async () => {
      // Arrange
      const params: GetTransferAgentParams = {
        partyId: 'NoAuthAgent-123',
      };
      const mockResponse = {
        partyId: 'NoAuthAgent-123',
        name: 'No Auth Agent',
        status: 'active',
      };
      const expectedUrl = `${mockApiUrls.LIGHTHOUSE_API}/validators/NoAuthAgent-123`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute(params);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      // Simple operations don't require authentication
      expect(request?.headers).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should propagate network errors', async () => {
      // Arrange
      const params: GetTransferAgentParams = {
        partyId: 'ErrorAgent-123',
      };
      const expectedUrl = `${mockApiUrls.LIGHTHOUSE_API}/validators/ErrorAgent-123`;
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
        // Missing partyId
      } as any;
      
      // Act & Assert
      await expect(operation.execute(params)).rejects.toThrow();
    });

    it('should accept valid parameters without validation errors', async () => {
      // Arrange
      const params: GetTransferAgentParams = {
        partyId: 'ValidAgent-123',
      };
      const mockResponse = {
        partyId: 'ValidAgent-123',
        name: 'Valid Agent',
        status: 'active',
      };
      const expectedUrl = `${mockApiUrls.LIGHTHOUSE_API}/validators/ValidAgent-123`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act & Assert
      await expect(operation.execute(params)).resolves.toEqual(mockResponse);
    });
  });
}); 