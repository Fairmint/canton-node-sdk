import axios, { type AxiosInstance } from 'axios';
import { ApiError, NetworkError } from '../../core/errors';
import { type Logger } from '../../core/logging';
import { type NetworkType, type RequestConfig } from '../../core/types';
import { getScanEndpoints, type ScanEndpoint } from './scan-endpoints';

/**
 * HTTP client specialized for Scan API with endpoint rotation.
 *
 * When a request fails, this client automatically rotates through available
 * scan endpoints and retries the request. This provides resilience against
 * rate limiting and temporary endpoint outages.
 */
export class ScanHttpClient {
  private readonly axiosInstance: AxiosInstance;
  private readonly logger: Logger | undefined;
  private readonly endpoints: ScanEndpoint[];
  private currentEndpointIndex: number;
  private readonly failedEndpoints: Set<number>;
  private lastFailureReset: number;

  /** Time in ms before resetting failed endpoints list (5 minutes) */
  private static readonly FAILURE_RESET_INTERVAL = 5 * 60 * 1000;
  /** Maximum retries across all endpoints */
  private static readonly MAX_TOTAL_RETRIES = 3;

  constructor(network: NetworkType, logger?: Logger, customEndpoints?: ScanEndpoint[]) {
    this.axiosInstance = axios.create();
    this.logger = logger;
    this.endpoints = customEndpoints ?? getScanEndpoints(network);
    this.currentEndpointIndex = 0;
    this.failedEndpoints = new Set();
    this.lastFailureReset = Date.now();
  }

  /** Get the current active endpoint */
  public getCurrentEndpoint(): ScanEndpoint | undefined {
    return this.endpoints[this.currentEndpointIndex];
  }

  /** Get all available endpoints */
  public getEndpoints(): ScanEndpoint[] {
    return [...this.endpoints];
  }

  /** Set custom endpoints (useful for testing or overriding) */
  public setEndpoints(endpoints: ScanEndpoint[]): void {
    this.endpoints.length = 0;
    this.endpoints.push(...endpoints);
    this.currentEndpointIndex = 0;
    this.failedEndpoints.clear();
  }

  public async makeGetRequest<T>(path: string, config: RequestConfig = {}): Promise<T> {
    return this.executeWithRotation<T>('GET', path, undefined, config);
  }

  public async makePostRequest<T>(path: string, data: unknown, config: RequestConfig = {}): Promise<T> {
    return this.executeWithRotation<T>('POST', path, data, config);
  }

  private async executeWithRotation<T>(
    method: 'GET' | 'POST',
    path: string,
    data: unknown,
    config: RequestConfig
  ): Promise<T> {
    this.maybeResetFailedEndpoints();

    if (this.endpoints.length === 0) {
      throw new NetworkError('No scan endpoints available for this network');
    }

    const totalEndpoints = this.endpoints.length;
    let lastError: Error | null = null;
    let attempts = 0;

    // Try each endpoint up to MAX_TOTAL_RETRIES times total
    while (attempts < Math.min(totalEndpoints, ScanHttpClient.MAX_TOTAL_RETRIES)) {
      const endpointIndex = this.getNextAvailableEndpoint();
      if (endpointIndex === -1) {
        // All endpoints have failed, reset and try again from the beginning
        this.failedEndpoints.clear();
        continue;
      }

      const endpoint = this.endpoints[endpointIndex];
      if (!endpoint) {
        break;
      }
      const url = `${endpoint.url}${path}`;

      try {
        const result = await this.executeRequest<T>(method, url, data, config);
        // Success! Update current endpoint for future requests
        this.currentEndpointIndex = endpointIndex;
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Mark this endpoint as failed
        this.failedEndpoints.add(endpointIndex);

        await this.logRequestResponse(
          url,
          { method, retry: attempts + 1, endpoint: endpoint.name },
          `Endpoint failed, rotating: ${lastError.message}`
        );

        attempts++;
      }
    }

    // All endpoints exhausted
    throw lastError ?? new NetworkError('All scan endpoints failed');
  }

  private getNextAvailableEndpoint(): number {
    const totalEndpoints = this.endpoints.length;

    // Start from current endpoint and find next available
    for (let i = 0; i < totalEndpoints; i++) {
      const index = (this.currentEndpointIndex + i) % totalEndpoints;
      if (!this.failedEndpoints.has(index)) {
        return index;
      }
    }

    return -1;
  }

  private maybeResetFailedEndpoints(): void {
    const now = Date.now();
    if (now - this.lastFailureReset > ScanHttpClient.FAILURE_RESET_INTERVAL) {
      this.failedEndpoints.clear();
      this.lastFailureReset = now;
    }
  }

  private async executeRequest<T>(
    method: 'GET' | 'POST',
    url: string,
    data: unknown,
    config: RequestConfig
  ): Promise<T> {
    const headers = this.buildHeaders(config);

    try {
      const response =
        method === 'GET'
          ? await this.axiosInstance.get<T>(url, { headers })
          : await this.axiosInstance.post<T>(url, data, { headers });

      await this.logRequestResponse(url, { method, headers, data }, response.data);
      return response.data;
    } catch (error) {
      // Log the error response before throwing
      if (axios.isAxiosError(error)) {
        await this.logRequestResponse(url, { method, data }, error.response?.data ?? error.message);
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

    return headers;
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
}
