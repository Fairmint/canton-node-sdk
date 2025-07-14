import axios, { AxiosInstance } from 'axios';
import { RequestConfig } from '../types';
import { ApiError, NetworkError } from '../errors';
import { Logger } from '../logging';

/** Handles HTTP requests with authentication, logging, and error handling */
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
      // Log the error response before throwing
      if (axios.isAxiosError(error)) {
        await this.logRequestResponse(url, { method: 'GET' }, error.response?.data || error.message);
      }
      throw this.handleRequestError(error);
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
      // Log the error response before throwing
      if (axios.isAxiosError(error)) {
        await this.logRequestResponse(url, { method: 'POST', data }, error.response?.data || error.message);
      }
      throw this.handleRequestError(error);
    }
  }

  public async makeDeleteRequest<T>(
    url: string,
    config: RequestConfig = {}
  ): Promise<T> {
    try {
      const headers = await this.buildHeaders(config);
      const response = await this.axiosInstance.delete<T>(url, { headers });

      await this.logRequestResponse(url, { method: 'DELETE', headers }, response.data);
      return response.data;
    } catch (error) {
      // Log the error response before throwing
      if (axios.isAxiosError(error)) {
        await this.logRequestResponse(url, { method: 'DELETE' }, error.response?.data || error.message);
      }
      throw this.handleRequestError(error);
    }
  }

  public async makePatchRequest<T>(
    url: string,
    data: unknown,
    config: RequestConfig = {}
  ): Promise<T> {
    try {
      const headers = await this.buildHeaders(config);
      const response = await this.axiosInstance.patch<T>(url, data, { headers });

      await this.logRequestResponse(url, { method: 'PATCH', headers, data }, response.data);
      return response.data;
    } catch (error) {
      // Log the error response before throwing
      if (axios.isAxiosError(error)) {
        await this.logRequestResponse(url, { method: 'PATCH', data }, error.response?.data || error.message);
      }
      throw this.handleRequestError(error);
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

  private handleRequestError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data || {};
      const code = data.code;
      const msg = code ? `HTTP ${status}: ${code}` : `HTTP ${status}`;
      const err = new ApiError(msg, status, error.response?.statusText);
      (err as any).response = data;
      return err;
    }
    return new NetworkError(
      `Request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
} 