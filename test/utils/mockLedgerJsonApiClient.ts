import { BaseClient } from '../../src/core/BaseClient';
import { MockHttpClient } from './mockHttpClient';
import { MockHttpRequest } from './mockHttpClient';
import { ClientConfig } from '../../src/core/types';

export class MockLedgerJsonApiClient extends BaseClient {
  private mockHttpClient: MockHttpClient;

  constructor(config?: ClientConfig) {
    super('LEDGER_JSON_API', config);
    this.mockHttpClient = new MockHttpClient();
    
    // Override the methods after construction
    this.overrideMethods();
  }

  private overrideMethods(): void {
    // Override the HTTP methods to use our mock
    const originalMakeGetRequest = this.makeGetRequest.bind(this);
    const originalMakePostRequest = this.makePostRequest.bind(this);
    const originalMakeDeleteRequest = this.makeDeleteRequest.bind(this);
    const originalMakePatchRequest = this.makePatchRequest.bind(this);

    this.makeGetRequest = async <T>(
      url: string,
      config: { contentType?: string; includeBearerToken?: boolean } = {}
    ): Promise<T> => {
      return this.mockHttpClient.makeGetRequest<T>(url, config);
    };

    this.makePostRequest = async <T>(
      url: string,
      data: unknown,
      config: { contentType?: string; includeBearerToken?: boolean } = {}
    ): Promise<T> => {
      return this.mockHttpClient.makePostRequest<T>(url, data, config);
    };

    this.makeDeleteRequest = async <T>(
      url: string,
      config: { contentType?: string; includeBearerToken?: boolean } = {}
    ): Promise<T> => {
      return this.mockHttpClient.makeDeleteRequest<T>(url, config);
    };

    this.makePatchRequest = async <T>(
      url: string,
      data: unknown,
      config: { contentType?: string; includeBearerToken?: boolean } = {}
    ): Promise<T> => {
      return this.mockHttpClient.makePatchRequest<T>(url, data, config);
    };
  }

  // Override authenticate to return a mock token
  public override async authenticate(): Promise<string> {
    return 'mock-token-12345';
  }

  // Mock client specific methods
  public setMockResponse(url: string, response: unknown): void {
    this.mockHttpClient.setMockResponse(url, response);
  }

  public setMockError(url: string, error: Error): void {
    this.mockHttpClient.setMockError(url, error);
  }

  public getRequests(): MockHttpRequest[] {
    return this.mockHttpClient.getRequests();
  }

  public getLastRequest(): MockHttpRequest | undefined {
    const requests = this.mockHttpClient.getRequests();
    return requests[requests.length - 1];
  }

  public getRequestsByMethod(method: string): MockHttpRequest[] {
    return this.mockHttpClient.getRequests().filter(req => req.method === method);
  }

  public getRequestsByUrl(url: string): MockHttpRequest[] {
    return this.mockHttpClient.getRequests().filter(req => req.url === url);
  }

  public clearMocks(): void {
    this.mockHttpClient.clearMocks();
  }
}
