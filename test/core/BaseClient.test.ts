import { MockBaseClient } from '../utils';
import { mockClientConfig } from '../config/testConfig';

describe('MockBaseClient', () => {
  let mockClient: MockBaseClient;

  beforeEach(() => {
    mockClient = new MockBaseClient('LEDGER_JSON_API', mockClientConfig);
    mockClient.clearMocks();
  });

  describe('Network Activity Validation', () => {
    it('should make GET requests through the mock HTTP client', async () => {
      // Arrange
      const url = 'https://api.test.com/endpoint';
      const mockResponse = { data: 'test response' };
      mockClient.setMockResponse(url, mockResponse);

      // Act
      const result = await mockClient.makeGetRequest(url);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(mockClient.getRequests()).toHaveLength(1);

      const request = mockClient.getLastRequest();
      expect(request?.method).toBe('GET');
      expect(request?.url).toBe(url);
    });

    it('should make POST requests through the mock HTTP client', async () => {
      // Arrange
      const url = 'https://api.test.com/endpoint';
      const data = { name: 'test', value: 123 };
      const mockResponse = { success: true };
      mockClient.setMockResponse(url, mockResponse);

      // Act
      const result = await mockClient.makePostRequest(url, data);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(mockClient.getRequests()).toHaveLength(1);

      const request = mockClient.getLastRequest();
      expect(request?.method).toBe('POST');
      expect(request?.url).toBe(url);
      expect(request?.data).toEqual(data);
    });

    it('should make DELETE requests through the mock HTTP client', async () => {
      // Arrange
      const url = 'https://api.test.com/endpoint';
      const mockResponse = { deleted: true };
      mockClient.setMockResponse(url, mockResponse);

      // Act
      const result = await mockClient.makeDeleteRequest(url);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(mockClient.getRequests()).toHaveLength(1);

      const request = mockClient.getLastRequest();
      expect(request?.method).toBe('DELETE');
      expect(request?.url).toBe(url);
    });

    it('should make PATCH requests through the mock HTTP client', async () => {
      // Arrange
      const url = 'https://api.test.com/endpoint';
      const data = { name: 'updated' };
      const mockResponse = { updated: true };
      mockClient.setMockResponse(url, mockResponse);

      // Act
      const result = await mockClient.makePatchRequest(url, data);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(mockClient.getRequests()).toHaveLength(1);

      const request = mockClient.getLastRequest();
      expect(request?.method).toBe('PATCH');
      expect(request?.url).toBe(url);
      expect(request?.data).toEqual(data);
    });
  });

  describe('Configuration Access', () => {
    it('should provide access to API configuration', () => {
      // Assert
      expect(mockClient.getApiType()).toBe('LEDGER_JSON_API');
      expect(mockClient.getNetwork()).toBe('testnet');
      expect(mockClient.getProvider()).toBe('test-provider');
      expect(mockClient.getAuthUrl()).toBe('https://auth.test.com');
      expect(mockClient.getPartyId()).toBe('test-party-id');
      expect(mockClient.getUserId()).toBe('test-user-id');
    });

    it('should provide access to managed parties', () => {
      // Assert
      expect(mockClient.getManagedParties()).toEqual([
        'test-party-1',
        'test-party-2',
      ]);
    });

    it('should build party lists correctly', () => {
      // Act
      const partyList = mockClient.buildPartyList(['additional-party']);

      // Assert
      expect(partyList).toContain('test-party-1');
      expect(partyList).toContain('test-party-2');
      expect(partyList).toContain('additional-party');
    });
  });

  describe('Mock Management', () => {
    it('should clear all mocks correctly', async () => {
      // Arrange
      const url = 'https://api.test.com/endpoint';
      mockClient.setMockResponse(url, { data: 'test' });
      mockClient.setMockError(url, new Error('test error'));

      // Act
      mockClient.clearMocks();

      // Assert
      expect(mockClient.getRequests()).toHaveLength(0);
    });

    it('should set and get mock responses', async () => {
      // Arrange
      const url = 'https://api.test.com/endpoint';
      const response = { data: 'test response' };

      // Act
      mockClient.setMockResponse(url, response);

      // Assert
      const result = await mockClient.makeGetRequest(url);
      expect(result).toEqual(response);
    });

    it('should set and get mock errors', async () => {
      // Arrange
      const url = 'https://api.test.com/endpoint';
      const error = new Error('test error');

      // Act
      mockClient.setMockError(url, error);

      // Assert
      await expect(mockClient.makeGetRequest(url)).rejects.toThrow(
        'test error'
      );
    });
  });

  describe('Request Filtering', () => {
    it('should filter requests by method', async () => {
      // Arrange
      const url1 = 'https://api.test.com/endpoint1';
      const url2 = 'https://api.test.com/endpoint2';

      mockClient.setMockResponse(url1, { data: 'get' });
      mockClient.setMockResponse(url2, { data: 'post' });

      // Act
      await mockClient.makeGetRequest(url1);
      await mockClient.makePostRequest(url2, { name: 'test' });

      // Assert
      expect(mockClient.getRequestsByMethod('GET')).toHaveLength(1);
      expect(mockClient.getRequestsByMethod('POST')).toHaveLength(1);
      expect(mockClient.getRequestsByMethod('DELETE')).toHaveLength(0);
    });

    it('should filter requests by URL', async () => {
      // Arrange
      const url1 = 'https://api.test.com/endpoint1';
      const url2 = 'https://api.test.com/endpoint2';

      mockClient.setMockResponse(url1, { data: 'response1' });
      mockClient.setMockResponse(url2, { data: 'response2' });

      // Act
      await mockClient.makeGetRequest(url1);
      await mockClient.makeGetRequest(url2);
      await mockClient.makeGetRequest(url1);

      // Assert
      expect(mockClient.getRequestsByUrl(url1)).toHaveLength(2);
      expect(mockClient.getRequestsByUrl(url2)).toHaveLength(1);
    });
  });

  describe('HTTP Client Access', () => {
    it('should provide access to the mock HTTP client', () => {
      // Assert
      expect(mockClient.getHttpClient()).toBeDefined();
      expect(mockClient.getHttpClient()).toBeInstanceOf(
        mockClient.mockHttpClient.constructor
      );
    });
  });
});
