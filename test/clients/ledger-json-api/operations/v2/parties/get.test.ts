import { MockLedgerJsonApiClient } from '../../../../../utils';
import { GetParties } from '../../../../../../src/clients/ledger-json-api/operations/v2/parties/get';
import { mockClientConfig, mockApiUrls } from '../../../../../config/testConfig';

describe('GetParties Operation', () => {
  let mockClient: MockLedgerJsonApiClient;
  let operation: InstanceType<typeof GetParties>;

  beforeEach(() => {
    mockClient = new MockLedgerJsonApiClient(mockClientConfig);
    operation = new GetParties(mockClient);
    mockClient.clearMocks();
  });

  describe('Network Activity Validation', () => {
    it('should make a GET request to the correct parties endpoint', async () => {
      // Arrange
      const params = {
        pageSize: 10,
      };
      const mockResponse = {
        partyDetails: [
          {
            party: 'party1',
            isLocal: true,
            identityProviderId: 'idp1',
          },
          {
            party: 'party2',
            isLocal: false,
            identityProviderId: 'idp2',
          },
        ],
        nextPageToken: 'next-token',
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/parties?pageSize=10`;
      
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
      const params = {
        pageSize: 20,
        pageToken: 'token-123',
      };
      const mockResponse = {
        partyDetails: [
          {
            party: 'party3',
            isLocal: true,
            identityProviderId: 'idp3',
          },
        ],
        nextPageToken: 'next-token-2',
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/parties?pageSize=20&pageToken=token-123`;
      
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
      const params = {
        pageSize: 10,
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/parties?pageSize=10`;
      const networkError = new Error('Network error');
      
      mockClient.setMockError(expectedUrl, networkError);

      // Act & Assert
      await expect(operation.execute(params)).rejects.toThrow('Network error');
      
      const requests = mockClient.getRequests();
      expect(requests).toHaveLength(1);
    });

    it('should handle server errors', async () => {
      // Arrange
      const params = {
        pageSize: 20,
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/parties?pageSize=20`;
      const serverError = new Error('Internal server error');
      
      mockClient.setMockError(expectedUrl, serverError);

      // Act & Assert
      await expect(operation.execute(params)).rejects.toThrow('Internal server error');
    });
  });

  describe('Parameter Validation', () => {
    it('should accept valid parameters without validation errors', async () => {
      // Arrange
      const params = {
        pageSize: 15,
      };
      const mockResponse = {
        partyDetails: [
          {
            party: 'party-valid',
            isLocal: true,
            identityProviderId: 'idp-valid',
          },
        ],
        nextPageToken: 'next-token-valid',
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/parties?pageSize=15`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act & Assert
      await expect(operation.execute(params)).resolves.toEqual(mockResponse);
    });

    it('should handle no parameters', async () => {
      // Arrange
      const params = {};
      const mockResponse = {
        partyDetails: [
          {
            party: 'party-default',
            isLocal: false,
            identityProviderId: 'idp-default',
          },
        ],
        nextPageToken: 'next-token-default',
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/parties`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      const result = await operation.execute(params);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(result.partyDetails).toHaveLength(1);
      expect(result.partyDetails![0].party).toBe('party-default');
    });

    it('should handle pagination parameters correctly', async () => {
      // Arrange
      const params = {
        pageSize: 5,
        pageToken: 'page-token-123',
      };
      const mockResponse = {
        partyDetails: [
          {
            party: 'party-page',
            isLocal: true,
            identityProviderId: 'idp-page',
          },
        ],
        nextPageToken: 'next-page-token',
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/parties?pageSize=5&pageToken=page-token-123`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      const result = await operation.execute(params);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(result.partyDetails).toHaveLength(1);
      expect(result.nextPageToken).toBe('next-page-token');
    });
  });
}); 