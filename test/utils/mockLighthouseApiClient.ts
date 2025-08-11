import { LighthouseApiClient } from '../../src/clients/lighthouse-api/LighthouseApiClient';
import { MockBaseClient } from './mockBaseClient';
import { MockHttpRequest } from './mockHttpClient';
import { ClientConfig } from '../../src/core/types';

export class MockLighthouseApiClient extends LighthouseApiClient {
  public mockBaseClient: MockBaseClient;

  constructor(config?: ClientConfig) {
    super(config);

    // Replace the base client with our mock
    this.mockBaseClient = new MockBaseClient('LIGHTHOUSE_API', config);
  }

  // Override the HTTP methods to use our mock base client
  public override async makeGetRequest<T>(
    url: string,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    return this.mockBaseClient.makeGetRequest<T>(url, config);
  }

  public override async makePostRequest<T>(
    url: string,
    data: unknown,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    return this.mockBaseClient.makePostRequest<T>(url, data, config);
  }

  public override async makeDeleteRequest<T>(
    url: string,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    return this.mockBaseClient.makeDeleteRequest<T>(url, config);
  }

  public override async makePatchRequest<T>(
    url: string,
    data: unknown,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    return this.mockBaseClient.makePatchRequest<T>(url, data, config);
  }

  // Override the base client getter to return our mock
  public getBaseClient(): MockBaseClient {
    return this.mockBaseClient;
  }

  // Helper method to set mock responses
  public setMockResponse(url: string, response: unknown): void {
    this.mockBaseClient.setMockResponse(url, response);
  }

  // Helper method to set mock errors
  public setMockError(url: string, error: Error): void {
    this.mockBaseClient.setMockError(url, error);
  }

  // Helper method to clear all mocks
  public clearMocks(): void {
    this.mockBaseClient.clearMocks();
  }

  // Helper method to get all requests
  public getRequests(): MockHttpRequest[] {
    return this.mockBaseClient.getRequests();
  }

  // Helper method to get the last request
  public getLastRequest(): MockHttpRequest | undefined {
    return this.mockBaseClient.getLastRequest();
  }

  // Helper method to get requests by method
  public getRequestsByMethod(method: string): MockHttpRequest[] {
    return this.mockBaseClient.getRequestsByMethod(method);
  }

  // Helper method to get requests by URL
  public getRequestsByUrl(url: string): MockHttpRequest[] {
    return this.mockBaseClient.getRequestsByUrl(url);
  }
}
