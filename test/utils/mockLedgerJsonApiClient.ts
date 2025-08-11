import { BaseClient } from '../../src/core/BaseClient';
import { MockHttpClient } from './mockHttpClient';
import { MockHttpRequest } from './mockHttpClient';
import { ClientConfig } from '../../src/core/types';

export class MockLedgerJsonApiClient extends BaseClient {
  private mockHttpClient: MockHttpClient;

  constructor(config?: ClientConfig) {
    super('LEDGER_JSON_API', config);
    this.mockHttpClient = new MockHttpClient();
    // Replace the httpClient with our mock
    (this as unknown as { httpClient: MockHttpClient }).httpClient =
      this.mockHttpClient;
  }

  // Override authenticate to return a mock token
  public override async authenticate(): Promise<string> {
    return 'mock-token-12345';
  }

  // Override the HTTP methods to use our mock HTTP client
  public override async makeGetRequest<T>(
    url: string,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    return this.mockHttpClient.makeGetRequest<T>(url, config);
  }

  public override async makePostRequest<T>(
    url: string,
    data: unknown,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    return this.mockHttpClient.makePostRequest<T>(url, data, config);
  }

  public override async makeDeleteRequest<T>(
    url: string,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    return this.mockHttpClient.makeDeleteRequest<T>(url, config);
  }

  public override async makePatchRequest<T>(
    url: string,
    data: unknown,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    return this.mockHttpClient.makePatchRequest<T>(url, data, config);
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
