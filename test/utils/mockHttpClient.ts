import { HttpClient } from '../../src/core/http/HttpClient';

export interface MockHttpRequest {
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH';
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
}

export class MockHttpClient extends HttpClient {
  public requests: MockHttpRequest[] = [];
  public mockResponses: Map<string, unknown> = new Map();
  public mockErrors: Map<string, Error> = new Map();

  constructor() {
    super();
  }

  private async buildMockHeaders(config: {
    contentType?: string;
    headers?: Record<string, string>;
  }): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};

    if (config.contentType) {
      headers['Content-Type'] = config.contentType;
    } else {
      headers['Content-Type'] = 'application/json';
    }

    return headers;
  }

  public override async makeGetRequest<T>(
    url: string,
    config: { contentType?: string; headers?: Record<string, string> } = {}
  ): Promise<T> {
    const headers = await this.buildMockHeaders(config);
    const request: MockHttpRequest = {
      method: 'GET',
      url,
      headers,
    };
    this.requests.push(request);

    // Check if we should throw an error
    if (this.mockErrors.has(url)) {
      throw this.mockErrors.get(url);
    }

    // Return mock response or default
    return (this.mockResponses.get(url) || {}) as T;
  }

  public override async makePostRequest<T>(
    url: string,
    data: unknown,
    config: { contentType?: string; headers?: Record<string, string> } = {}
  ): Promise<T> {
    const headers = await this.buildMockHeaders(config);
    const request: MockHttpRequest = {
      method: 'POST',
      url,
      data,
      headers,
    };
    this.requests.push(request);

    // Check if we should throw an error
    if (this.mockErrors.has(url)) {
      throw this.mockErrors.get(url);
    }

    // Return mock response or default
    return (this.mockResponses.get(url) || {}) as T;
  }

  public override async makeDeleteRequest<T>(
    url: string,
    config: { contentType?: string; headers?: Record<string, string> } = {}
  ): Promise<T> {
    const headers = await this.buildMockHeaders(config);
    const request: MockHttpRequest = {
      method: 'DELETE',
      url,
      headers,
    };
    this.requests.push(request);

    // Check if we should throw an error
    if (this.mockErrors.has(url)) {
      throw this.mockErrors.get(url);
    }

    // Return mock response or default
    return (this.mockResponses.get(url) || {}) as T;
  }

  public override async makePatchRequest<T>(
    url: string,
    data: unknown,
    config: { contentType?: string; headers?: Record<string, string> } = {}
  ): Promise<T> {
    const headers = await this.buildMockHeaders(config);
    const request: MockHttpRequest = {
      method: 'PATCH',
      url,
      data,
      headers,
    };
    this.requests.push(request);

    // Check if we should throw an error
    if (this.mockErrors.has(url)) {
      throw this.mockErrors.get(url);
    }

    // Return mock response or default
    return (this.mockResponses.get(url) || {}) as T;
  }

  public setMockResponse(url: string, response: unknown): void {
    this.mockResponses.set(url, response);
  }

  public setMockError(url: string, error: Error): void {
    this.mockErrors.set(url, error);
  }

  public clearMocks(): void {
    this.requests = [];
    this.mockResponses.clear();
    this.mockErrors.clear();
  }

  public getRequests(): MockHttpRequest[] {
    return this.requests;
  }

  public getLastRequest(): MockHttpRequest | undefined {
    return this.requests[this.requests.length - 1];
  }

  public getRequestsByMethod(method: string): MockHttpRequest[] {
    return this.requests.filter(req => req.method === method);
  }

  public getRequestsByUrl(url: string): MockHttpRequest[] {
    return this.requests.filter(req => req.url === url);
  }
}
