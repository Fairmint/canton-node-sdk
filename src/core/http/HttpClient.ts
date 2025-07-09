import axios, { AxiosInstance } from 'axios';
import { RequestConfig } from '../types';
import { ApiError, NetworkError } from '../errors';
import { Logger } from '../logging';

export class HttpClient {
  private axiosInstance: AxiosInstance;
  private logger: Logger | undefined;

  constructor(logger?: Logger) {
    this.axiosInstance = axios.create();
    this.logger = logger;
  }

  public async makeGetRequest<T>(
    url: string,
    config: RequestConfig = {}
  ): Promise<T> {
    try {
      const headers = await this.buildHeaders(config);
      const response = await this.axiosInstance.get<T>(url, { headers });

      await this.logRequestResponse(url, { method: 'GET', headers }, response.data);
      return response.data;
    } catch (error) {
      throw this.handleRequestError(error, 'GET', url);
    }
  }

  public async makePostRequest<T>(
    url: string,
    data: unknown,
    config: RequestConfig = {}
  ): Promise<T> {
    try {
      const headers = await this.buildHeaders(config);
      const response = await this.axiosInstance.post<T>(url, data, { headers });

      await this.logRequestResponse(url, { method: 'POST', headers, data }, response.data);
      return response.data;
    } catch (error) {
      throw this.handleRequestError(error, 'POST', url);
    }
  }

  private async buildHeaders(config: RequestConfig): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};

    if (config.contentType) {
      headers['Content-Type'] = config.contentType;
    } else {
      headers['Content-Type'] = 'application/json';
    }

    if (config.includeBearerToken) {
      // This will be set by the client that uses this HTTP client
      // The bearer token should be passed in the config or set separately
    }

    return headers;
  }

  public setBearerToken(token: string): void {
    this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  public clearBearerToken(): void {
    delete this.axiosInstance.defaults.headers.common['Authorization'];
  }

  private async logRequestResponse(
    url: string,
    request: unknown,
    response: unknown
  ): Promise<void> {
    if (this.logger) {
      await this.logger.logRequestResponse(url, request, response);
    }
  }

  private handleRequestError(error: unknown, method: string, url: string): Error {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const statusText = error.response?.statusText;
      const errorData = error.response?.data
        ? JSON.stringify(error.response.data, null, 2)
        : error.message;

      return new ApiError(
        `${method} request to ${url} failed with status ${status} ${statusText}: ${errorData}`,
        status,
        statusText,
        error
      );
    }

    return new NetworkError(
      `${method} request to ${url} failed: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
} 