import { MockLedgerJsonApiClient } from '../../../../../utils';
import { GetUpdateByOffset, GetUpdateByOffsetParams } from '../../../../../../src/clients/ledger-json-api/operations/v2/updates/get-update-by-offset';
import { mockClientConfig, mockApiUrls } from '../../../../../config/testConfig';

describe('GetUpdateByOffset Operation', () => {
  let mockClient: MockLedgerJsonApiClient;
  let operation: InstanceType<typeof GetUpdateByOffset>;

  beforeEach(() => {
    mockClient = new MockLedgerJsonApiClient(mockClientConfig);
    operation = new GetUpdateByOffset(mockClient);
    mockClient.clearMocks();
  });

  describe('Network Activity Validation', () => {
    it('should make a POST request to the correct updates endpoint', async () => {
      // Arrange
      const params: GetUpdateByOffsetParams = {
        offset: 1000,
      };
      const mockResponse = {
        update: {
          updateId: 'update-1',
          offset: 1000,
          type: 'TransactionAccepted',
        },
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/updates/update-by-offset`;
      
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
      const params: GetUpdateByOffsetParams = {
        offset: 2000,
      };
      const mockResponse = { update: { updateId: 'update-2', offset: 2000 } };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/updates/update-by-offset`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute(params);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      expect(request?.data).toEqual({ offset: 2000 });
    });
  });

  describe('Error Handling', () => {
    it('should propagate network errors', async () => {
      // Arrange
      const params: GetUpdateByOffsetParams = {
        offset: 3000,
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/updates/update-by-offset`;
      const networkError = new Error('Network error');
      
      mockClient.setMockError(expectedUrl, networkError);

      // Act & Assert
      await expect(operation.execute(params)).rejects.toThrow('Network error');
      
      const requests = mockClient.getRequests();
      expect(requests).toHaveLength(1);
    });

    it('should handle offset not found errors', async () => {
      // Arrange
      const params: GetUpdateByOffsetParams = {
        offset: 999999,
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/updates/update-by-offset`;
      const notFoundError = new Error('Offset not found');
      
      mockClient.setMockError(expectedUrl, notFoundError);

      // Act & Assert
      await expect(operation.execute(params)).rejects.toThrow('Offset not found');
    });
  });

  describe('Parameter Validation', () => {
    it('should accept any parameters since validation is disabled', async () => {
      // Arrange
      const params = {
        // Missing offset but operation accepts any params
      } as any;
      
      // Act & Assert
      // This operation uses z.any() so it accepts any parameters
      await expect(operation.execute(params)).resolves.toBeDefined();
    });

    it('should accept valid parameters without validation errors', async () => {
      // Arrange
      const params: GetUpdateByOffsetParams = {
        offset: 5000,
      };
      const mockResponse = { update: { updateId: 'update-5', offset: 5000 } };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/updates/update-by-offset`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act & Assert
      await expect(operation.execute(params)).resolves.toEqual(mockResponse);
    });
  });
}); 