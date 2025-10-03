import axios, { type AxiosInstance } from 'axios';
import { ApiError, NetworkError } from '../errors';
import { type Logger } from '../logging';
import { type RequestConfig } from '../types';

/** Handles HTTP requests with authentication, logging, and error handling */
export class HttpClient {
  private readonly axiosInstance: AxiosInstance;
  private readonly logger: Logger | undefined;

  constructor(logger?: Logger) {
    this.axiosInstance = axios.create();
    this.logger = logger;
  }

  public async makeGetRequest<T>(url: string, config: RequestConfig = {}, _isRetry = false): Promise<T> {
    try {
      const headers = await this.buildHeaders(config);
      const response = await this.axiosInstance.get<T>(url, { headers });

      await this.logRequestResponse(url, { method: 'GET', headers }, response.data);
      return response.data;
    } catch (error) {
      // Attempt one automatic retry for transient errors
      if (!_isRetry && this.isRetryableError(error)) {
        await this.logRequestResponse(
          url,
          { method: 'GET', retry: true },
          `Retrying after error: ${axios.isAxiosError(error) ? (error.response?.status ?? 'network error') : String(error)}`
        );
        return this.makeGetRequest(url, config, true);
      }

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
    config: RequestConfig = {},
    _isRetry = false
  ): Promise<T> {
    try {
      const headers = await this.buildHeaders(config);
      const response = await this.axiosInstance.post<T>(url, data, { headers });

      await this.logRequestResponse(url, { method: 'POST', headers, data }, response.data);
      return response.data;
    } catch (error) {
      if (!_isRetry && this.isRetryableError(error)) {
        await this.logRequestResponse(
          url,
          { method: 'POST', retry: true, data },
          `Retrying after error: ${axios.isAxiosError(error) ? (error.response?.status ?? 'network error') : String(error)}`
        );
        return this.makePostRequest(url, data, config, true);
      }

      // Log the error response before throwing
      if (axios.isAxiosError(error)) {
        await this.logRequestResponse(url, { method: 'POST', data }, error.response?.data || error.message);
      }
      throw this.handleRequestError(error);
    }
  }

  public async makeDeleteRequest<T>(url: string, config: RequestConfig = {}, _isRetry = false): Promise<T> {
    try {
      const headers = await this.buildHeaders(config);
      const response = await this.axiosInstance.delete<T>(url, { headers });

      await this.logRequestResponse(url, { method: 'DELETE', headers }, response.data);
      return response.data;
    } catch (error) {
      if (!_isRetry && this.isRetryableError(error)) {
        await this.logRequestResponse(
          url,
          { method: 'DELETE', retry: true },
          `Retrying after error: ${axios.isAxiosError(error) ? (error.response?.status ?? 'network error') : String(error)}`
        );
        return this.makeDeleteRequest(url, config, true);
      }

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
    config: RequestConfig = {},
    _isRetry = false
  ): Promise<T> {
    try {
      const headers = await this.buildHeaders(config);
      const response = await this.axiosInstance.patch<T>(url, data, { headers });

      await this.logRequestResponse(url, { method: 'PATCH', headers, data }, response.data);
      return response.data;
    } catch (error) {
      if (!_isRetry && this.isRetryableError(error)) {
        await this.logRequestResponse(
          url,
          { method: 'PATCH', retry: true, data },
          `Retrying after error: ${axios.isAxiosError(error) ? (error.response?.status ?? 'network error') : String(error)}`
        );
        return this.makePatchRequest(url, data, config, true);
      }

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

  private async logRequestResponse(url: string, request: unknown, response: unknown): Promise<void> {
    if (this.logger) {
      await this.logger.logRequestResponse(url, request, response);
    }
  }

  private handleRequestError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data || {};
      const { code } = data;
      const msg = code ? `HTTP ${status}: ${code}` : `HTTP ${status}`;
      const err = new ApiError(msg, status, error.response?.statusText);
      (err as any).response = data;
      return err;
    }
    return new NetworkError(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  /** Determines whether a request error is retryable (HTTP 5xx or network error) */
  private isRetryableError(error: unknown): boolean {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      // Retry on 5xx server errors and undefined status (network error)
      return status === undefined || (status >= 500 && status < 600);
    }
    // Only retry non-Axios errors that are instances of NetworkError
    return error instanceof NetworkError;
  }
}
