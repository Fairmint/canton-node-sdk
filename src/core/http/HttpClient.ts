import axios, { type AxiosInstance } from 'axios';
import { ApiError, NetworkError } from '../errors';
import { type Logger } from '../logging';
import { type RequestConfig } from '../types';

export interface HttpClientRetryConfig {
  /** Number of retries after the initial attempt */
  maxRetries: number;
  /** Delay between retries */
  delayMs: number;
}

/** Handles HTTP requests with authentication, logging, and error handling */
export class HttpClient {
  private readonly axiosInstance: AxiosInstance;
  private readonly logger: Logger | undefined;
  private retryConfig: HttpClientRetryConfig = { maxRetries: 3, delayMs: 6000 };

  constructor(logger?: Logger) {
    this.axiosInstance = axios.create();
    this.logger = logger;
  }

  public setRetryConfig(config: Partial<HttpClientRetryConfig>): void {
    this.retryConfig = {
      maxRetries: config.maxRetries ?? this.retryConfig.maxRetries,
      delayMs: config.delayMs ?? this.retryConfig.delayMs,
    };
  }

  public async makeGetRequest<T>(url: string, config: RequestConfig = {}, _retryCount = 0): Promise<T> {
    try {
      const headers = this.buildHeaders(config);
      const response = await this.axiosInstance.get<T>(url, { headers });

      await this.logRequestResponse(url, { method: 'GET', headers }, response.data);
      return response.data;
    } catch (error) {
      // Attempt up to 3 retries for transient errors
      if (_retryCount < this.retryConfig.maxRetries && this.isRetryableError(error)) {
        await this.logRequestResponse(
          url,
          { method: 'GET', retry: _retryCount + 1 },
          `Retrying after error (attempt ${_retryCount + 1}/${this.retryConfig.maxRetries}): ${
            axios.isAxiosError(error) ? (error.response?.status ?? 'network error') : String(error)
          }`
        );
        await this.sleep(this.retryConfig.delayMs);
        return this.makeGetRequest(url, config, _retryCount + 1);
      }

      // Log the error response before throwing
      if (axios.isAxiosError(error)) {
        await this.logRequestResponse(url, { method: 'GET' }, error.response?.data ?? error.message);
      }
      throw this.handleRequestError(error);
    }
  }

  public async makePostRequest<T>(url: string, data: unknown, config: RequestConfig = {}, _retryCount = 0): Promise<T> {
    try {
      const headers = this.buildHeaders(config);
      const response = await this.axiosInstance.post<T>(url, data, { headers });

      await this.logRequestResponse(url, { method: 'POST', headers, data }, response.data);
      return response.data;
    } catch (error) {
      if (_retryCount < this.retryConfig.maxRetries && this.isRetryableError(error)) {
        await this.logRequestResponse(
          url,
          { method: 'POST', retry: _retryCount + 1, data },
          `Retrying after error (attempt ${_retryCount + 1}/${this.retryConfig.maxRetries}): ${
            axios.isAxiosError(error) ? (error.response?.status ?? 'network error') : String(error)
          }`
        );
        await this.sleep(this.retryConfig.delayMs);
        const retryData = this.prepareDataForRetry(data);
        return this.makePostRequest(url, retryData, config, _retryCount + 1);
      }

      // Log the error response before throwing
      if (axios.isAxiosError(error)) {
        await this.logRequestResponse(url, { method: 'POST', data }, error.response?.data ?? error.message);
      }
      throw this.handleRequestError(error);
    }
  }

  public async makeDeleteRequest<T>(url: string, config: RequestConfig = {}, _retryCount = 0): Promise<T> {
    try {
      const headers = this.buildHeaders(config);
      const response = await this.axiosInstance.delete<T>(url, { headers });

      await this.logRequestResponse(url, { method: 'DELETE', headers }, response.data);
      return response.data;
    } catch (error) {
      if (_retryCount < this.retryConfig.maxRetries && this.isRetryableError(error)) {
        await this.logRequestResponse(
          url,
          { method: 'DELETE', retry: _retryCount + 1 },
          `Retrying after error (attempt ${_retryCount + 1}/${this.retryConfig.maxRetries}): ${
            axios.isAxiosError(error) ? (error.response?.status ?? 'network error') : String(error)
          }`
        );
        await this.sleep(this.retryConfig.delayMs);
        return this.makeDeleteRequest(url, config, _retryCount + 1);
      }

      // Log the error response before throwing
      if (axios.isAxiosError(error)) {
        await this.logRequestResponse(url, { method: 'DELETE' }, error.response?.data ?? error.message);
      }
      throw this.handleRequestError(error);
    }
  }

  public async makePatchRequest<T>(
    url: string,
    data: unknown,
    config: RequestConfig = {},
    _retryCount = 0
  ): Promise<T> {
    try {
      const headers = this.buildHeaders(config);
      const response = await this.axiosInstance.patch<T>(url, data, { headers });

      await this.logRequestResponse(url, { method: 'PATCH', headers, data }, response.data);
      return response.data;
    } catch (error) {
      if (_retryCount < this.retryConfig.maxRetries && this.isRetryableError(error)) {
        await this.logRequestResponse(
          url,
          { method: 'PATCH', retry: _retryCount + 1, data },
          `Retrying after error (attempt ${_retryCount + 1}/${this.retryConfig.maxRetries}): ${
            axios.isAxiosError(error) ? (error.response?.status ?? 'network error') : String(error)
          }`
        );
        await this.sleep(this.retryConfig.delayMs);
        const retryData = this.prepareDataForRetry(data);
        return this.makePatchRequest(url, retryData, config, _retryCount + 1);
      }

      // Log the error response before throwing
      if (axios.isAxiosError(error)) {
        await this.logRequestResponse(url, { method: 'PATCH', data }, error.response?.data ?? error.message);
      }
      throw this.handleRequestError(error);
    }
  }

  private buildHeaders(config: RequestConfig): Record<string, string> {
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
      const data = error.response?.data ?? {};
      const { code } = data as { code?: string };
      const msg = code ? `HTTP ${status}: ${code}` : `HTTP ${status}`;
      const err = new ApiError(msg, status, error.response?.statusText) as ApiError & { response: unknown };
      err.response = data;
      return err;
    }
    return new NetworkError(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  /**
   * Determines whether a request error is retryable. Retries on:
   *
   * - HTTP 5xx server errors
   * - Network errors
   * - Canton-specific transient errors: UNKNOWN_CONTRACT_SYNCHRONIZERS (400), SEQUENCER_BACKPRESSURE (409), HTTP 503
   */
  private isRetryableError(error: unknown): boolean {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data ?? {};
      const { code } = data as { code?: string };

      // Retry on undefined status (network error)
      if (status === undefined) {
        return true;
      }

      // Retry on 5xx server errors
      if (status >= 500 && status < 600) {
        return true;
      }

      // Retry on Canton-specific transient errors
      if (status === 400 && code === 'UNKNOWN_CONTRACT_SYNCHRONIZERS') {
        return true;
      }

      if (status === 409 && code === 'SEQUENCER_BACKPRESSURE') {
        return true;
      }

      return false;
    }
    // Only retry non-Axios errors that are instances of NetworkError
    return error instanceof NetworkError;
  }

  /** Sleep for the specified number of milliseconds */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Prepares request data for retry by updating commandId fields to avoid duplicate command rejection. If the data
   * contains a commandId field, appends a retry suffix with timestamp to make it unique.
   */
  private prepareDataForRetry(data: unknown): unknown {
    if (data && typeof data === 'object' && 'commandId' in data) {
      const originalCommandId = (data as { commandId: string }).commandId;
      const retryCommandId = `${originalCommandId}-retry`;
      return { ...data, commandId: retryCommandId };
    }
    return data;
  }
}
