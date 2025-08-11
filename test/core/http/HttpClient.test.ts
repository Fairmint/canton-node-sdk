import { MockHttpClient } from '../../utils';

describe('MockHttpClient', () => {
  let mockClient: MockHttpClient;

  beforeEach(() => {
    mockClient = new MockHttpClient();
    mockClient.clearMocks();
  });

  describe('GET Request Mocking', () => {
    it('should record GET requests correctly', async () => {
      // Arrange
      const url = 'https://api.test.com/endpoint';
      const mockResponse = { data: 'test' };
      mockClient.setMockResponse(url, mockResponse);

      // Act
      const result = await mockClient.makeGetRequest(url);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(mockClient.getRequests()).toHaveLength(1);
      
      const request = mockClient.getLastRequest();
      expect(request?.method).toBe('GET');
      expect(request?.url).toBe(url);
      expect(request?.data).toBeUndefined();
    });

    it('should record GET requests with headers', async () => {
      // Arrange
      const url = 'https://api.test.com/endpoint';
      const config = { contentType: 'application/json' };
      const mockResponse = { data: 'test' };
      mockClient.setMockResponse(url, mockResponse);

      // Act
      await mockClient.makeGetRequest(url, config);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request?.headers).toEqual({ 'Content-Type': 'application/json' });
    });
  });

  describe('POST Request Mocking', () => {
    it('should record POST requests correctly', async () => {
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

    it('should record POST requests with headers', async () => {
      // Arrange
      const url = 'https://api.test.com/endpoint';
      const data = { name: 'test' };
      const config = { headers: { 'Content-Type': 'application/json' } };
      const mockResponse = { success: true };
      mockClient.setMockResponse(url, mockResponse);

      // Act
      await mockClient.makePostRequest(url, data, config);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request?.headers).toEqual({ 'Content-Type': 'application/json' });
    });
  });

  describe('DELETE Request Mocking', () => {
    it('should record DELETE requests correctly', async () => {
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
      expect(request?.data).toBeUndefined();
    });
  });

  describe('PATCH Request Mocking', () => {
    it('should record PATCH requests correctly', async () => {
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

  describe('Error Mocking', () => {
    it('should throw mocked errors for GET requests', async () => {
      // Arrange
      const url = 'https://api.test.com/endpoint';
      const error = new Error('Network error');
      mockClient.setMockError(url, error);

      // Act & Assert
      await expect(mockClient.makeGetRequest(url)).rejects.toThrow('Network error');
      expect(mockClient.getRequests()).toHaveLength(1);
    });

    it('should throw mocked errors for POST requests', async () => {
      // Arrange
      const url = 'https://api.test.com/endpoint';
      const data = { name: 'test' };
      const error = new Error('Validation error');
      mockClient.setMockError(url, error);

      // Act & Assert
      await expect(mockClient.makePostRequest(url, data)).rejects.toThrow('Validation error');
      expect(mockClient.getRequests()).toHaveLength(1);
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
      expect(mockClient.mockResponses.size).toBe(0);
      expect(mockClient.mockErrors.size).toBe(0);
    });

    it('should set and get mock responses', async () => {
      // Arrange
      const url = 'https://api.test.com/endpoint';
      const response = { data: 'test response' };

      // Act
      mockClient.setMockResponse(url, response);

      // Assert
      expect(mockClient.mockResponses.get(url)).toEqual(response);
    });

    it('should set and get mock errors', async () => {
      // Arrange
      const url = 'https://api.test.com/endpoint';
      const error = new Error('test error');

      // Act
      mockClient.setMockError(url, error);

      // Assert
      expect(mockClient.mockErrors.get(url)).toEqual(error);
    });
  });
}); 