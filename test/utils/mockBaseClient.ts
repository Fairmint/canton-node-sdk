import { MockHttpClient, MockHttpRequest } from './mockHttpClient';
import { ApiType, ClientConfig } from '../../src/core/types';

export class MockBaseClient {
  public mockHttpClient: MockHttpClient;
  private config: ClientConfig;
  private apiType: ApiType;

  constructor(apiType: ApiType, config?: ClientConfig) {
    this.apiType = apiType;
    this.config = config || {
      network: 'testnet',
      apis: {
        [apiType]: {
          apiUrl: 'http://localhost:8080',
          auth: {
            grantType: 'client_credentials',
            clientId: 'mock-client-id',
            clientSecret: 'mock-client-secret'
          }
        }
      }
    };
    this.mockHttpClient = new MockHttpClient();
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

  // Implement the methods that operations actually call
  public async makeGetRequest<T>(
    url: string,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    return this.mockHttpClient.makeGetRequest<T>(url, config);
  }

  public async makePostRequest<T>(
    url: string,
    data: unknown,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    return this.mockHttpClient.makePostRequest<T>(url, data, config);
  }

  public async makeDeleteRequest<T>(
    url: string,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    return this.mockHttpClient.makeDeleteRequest<T>(url, config);
  }

  public async makePatchRequest<T>(
    url: string,
    data: unknown,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    return this.mockHttpClient.makePatchRequest<T>(url, data, config);
  }

  // Mock other required methods
  public getApiUrl(): string {
    return this.config.apis?.[this.apiType]?.apiUrl || 'http://localhost:8080';
  }

  public getPartyId(): string {
    const apiConfig = this.config.apis?.[this.apiType];
    if (apiConfig && 'partyId' in apiConfig) {
      return apiConfig.partyId || 'mock-party-id';
    }
    return this.config.partyId || 'mock-party-id';
  }

  public getUserId(): string | undefined {
    const apiConfig = this.config.apis?.[this.apiType];
    if (apiConfig && 'userId' in apiConfig) {
      return apiConfig.userId;
    }
    return this.config.userId;
  }

  public getManagedParties(): string[] {
    return this.config.managedParties || [];
  }

  public buildPartyList(additionalParties: string[] = []): string[] {
    const managedParties = this.getManagedParties();
    const partyId = this.getPartyId();
    const partyList = [...additionalParties, ...managedParties];
    if (partyId && !partyList.includes(partyId)) {
      partyList.push(partyId);
    }
    return [...new Set(partyList)];
  }

  public getApiType(): string {
    return this.apiType;
  }

  public getNetwork(): string {
    return this.config.network || 'testnet';
  }

  public getProvider(): string {
    return this.config.provider || 'test-provider';
  }

  public getAuthUrl(): string {
    return this.config.authUrl || 'https://auth.test.com';
  }

  public getHttpClient(): MockHttpClient {
    return this.mockHttpClient;
  }
}
