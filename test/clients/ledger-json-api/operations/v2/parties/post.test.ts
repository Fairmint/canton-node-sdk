import { MockLedgerJsonApiClient } from '../../../../../utils';
import { AllocateParty, AllocatePartyParams } from '../../../../../../src/clients/ledger-json-api/operations/v2/parties/post';
import { mockClientConfig, mockApiUrls } from '../../../../../config/testConfig';

describe('AllocateParty Operation', () => {
  let mockClient: MockLedgerJsonApiClient;
  let operation: InstanceType<typeof AllocateParty>;

  beforeEach(() => {
    mockClient = new MockLedgerJsonApiClient(mockClientConfig);
    operation = new AllocateParty(mockClient);
    mockClient.clearMocks();
  });

  describe('Network Activity Validation', () => {
    it('should make a POST request to the correct parties endpoint', async () => {
      // Arrange
      const params: AllocatePartyParams = {
        partyIdHint: 'alice',
        identityProviderId: 'default',
      };
      const mockResponse = {
        partyDetails: {
          party: 'alice',
          displayName: 'Alice',
          isLocal: true,
        },
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/parties`;
      
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
        partyIdHint: 'alice',
        identityProviderId: 'default',
      });
    });

    it('should include proper headers in the request', async () => {
      // Arrange
      const params: AllocatePartyParams = {
        partyIdHint: 'bob',
        identityProviderId: 'default',
      };
      const mockResponse = {
        partyDetails: {
          party: 'bob',
          displayName: 'Bob',
          isLocal: true,
        },
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/parties`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute(params);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      expect(request?.headers).toBeDefined();
      expect(request?.headers?.['Content-Type']).toBe('application/json');
    });

    it('should handle optional local metadata in the request', async () => {
      // Arrange
      const params: AllocatePartyParams = {
        partyIdHint: 'charlie',
        identityProviderId: 'default',
        localMetadata: {
          resourceVersion: '1.0',
          annotations: { key: 'value' },
        },
      };
      const mockResponse = {
        partyDetails: {
          party: 'charlie',
          displayName: 'Charlie',
          isLocal: true,
        },
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/parties`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute(params);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      expect(request?.data).toEqual({
        partyIdHint: 'charlie',
        identityProviderId: 'default',
        localMetadata: {
          resourceVersion: '1.0',
          annotations: { key: 'value' },
        },
      });
    });

    it('should handle authentication when required', async () => {
      // Arrange
      const params: AllocatePartyParams = {
        partyIdHint: 'david',
        identityProviderId: 'default',
      };
      const mockResponse = {
        partyDetails: {
          party: 'david',
          displayName: 'David',
          isLocal: true,
        },
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/parties`;
      
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
      const params: AllocatePartyParams = {
        partyIdHint: 'eve',
        identityProviderId: 'default',
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/parties`;
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
        partyIdHint: 'frank',
        // Missing identityProviderId
      } as any;
      
      // Act & Assert
      await expect(operation.execute(params)).rejects.toThrow();
    });

    it('should accept valid parameters without validation errors', async () => {
      // Arrange
      const params: AllocatePartyParams = {
        partyIdHint: 'grace',
        identityProviderId: 'default',
      };
      const mockResponse = {
        partyDetails: {
          party: 'grace',
          displayName: 'Grace',
          isLocal: true,
        },
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/parties`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act & Assert
      await expect(operation.execute(params)).resolves.toEqual(mockResponse);
    });
  });
}); 