import { BaseClient } from '../../src/core/BaseClient';
import { MockHttpClient, MockHttpRequest } from './mockHttpClient';
import { ApiType, ClientConfig } from '../../src/core/types';

export class MockBaseClient extends BaseClient {
  public mockHttpClient: MockHttpClient;

  constructor(apiType: ApiType, config?: ClientConfig) {
    super(apiType, config);

    // Replace the HTTP client with our mock
    this.mockHttpClient = new MockHttpClient();
    (this as unknown as { httpClient: MockHttpClient }).httpClient =
      this.mockHttpClient;
  }

  // Override the authenticate method to avoid real HTTP calls
  public override async authenticate(): Promise<string> {
    // Return a mock token instead of calling the real authentication
    return 'mock-token-12345';
  }

  // Override the HTTP methods to use our mock
  public override async makeGetRequest<T>(
    url: string,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    // Skip authentication for testing
    return this.mockHttpClient.makeGetRequest<T>(url, config);
  }

  public override async makePostRequest<T>(
    url: string,
    data: unknown,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    // Skip authentication for testing
    return this.mockHttpClient.makePostRequest<T>(url, data, config);
  }

  public override async makeDeleteRequest<T>(
    url: string,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    // Skip authentication for testing
    return this.mockHttpClient.makeDeleteRequest<T>(url, config);
  }

  public override async makePatchRequest<T>(
    url: string,
    data: unknown,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    // Skip authentication for testing
    return this.mockHttpClient.makePatchRequest<T>(url, data, config);
  }

  // Override the HTTP client getter to return our mock
  public getHttpClient(): MockHttpClient {
    return this.mockHttpClient;
  }

  // Helper method to set mock responses
  public setMockResponse(url: string, response: unknown): void {
    this.mockHttpClient.setMockResponse(url, response);
  }

  // Helper method to set mock errors
  public setMockError(url: string, error: Error): void {
    this.mockHttpClient.setMockError(url, error);
  }

  // Helper method to clear all mocks
  public clearMocks(): void {
    this.mockHttpClient.clearMocks();
  }

  // Helper method to get all requests
  public getRequests(): MockHttpRequest[] {
    return this.mockHttpClient.getRequests();
  }

  // Helper method to get the last request
  public getLastRequest(): MockHttpRequest | undefined {
    return this.mockHttpClient.getLastRequest();
  }

  // Helper method to get requests by method
  public getRequestsByMethod(method: string): MockHttpRequest[] {
    return this.mockHttpClient.getRequestsByMethod(method);
  }

  // Helper method to get requests by URL
  public getRequestsByUrl(url: string): MockHttpRequest[] {
    return this.mockHttpClient.getRequestsByUrl(url);
  }
}
