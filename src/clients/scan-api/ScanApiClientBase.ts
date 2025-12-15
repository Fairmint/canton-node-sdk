import { FileLogger } from '../../core/logging/FileLogger';
import { type Logger } from '../../core/logging/Logger';
import { type NetworkType, type RequestConfig } from '../../core/types';
import { ScanHttpClient } from './ScanHttpClient';
import { type ScanEndpoint } from './scan-endpoints';

/** Configuration for the Scan API client */
export interface ScanApiConfig {
  /** Network to use (determines which scan endpoints are available) */
  network: NetworkType;
  /** Optional logger instance */
  logger?: Logger;
  /** Optional custom scan endpoints (overrides network defaults) */
  endpoints?: ScanEndpoint[];
}

/**
 * Base client for the Scan API.
 *
 * This client does not require authentication as the Scan API is public.
 * It automatically rotates through available scan endpoints when requests fail.
 */
export abstract class ScanApiClientBase {
  protected readonly network: NetworkType;
  protected readonly logger: Logger | undefined;
  protected readonly httpClient: ScanHttpClient;

  constructor(config: ScanApiConfig) {
    this.network = config.network;
    this.logger = config.logger ?? new FileLogger();
    this.httpClient = new ScanHttpClient(this.network, this.logger, config.endpoints);
  }

  /** Get the current active scan endpoint */
  public getCurrentEndpoint(): ScanEndpoint | undefined {
    return this.httpClient.getCurrentEndpoint();
  }

  /** Get all available scan endpoints for this network */
  public getEndpoints(): ScanEndpoint[] {
    return this.httpClient.getEndpoints();
  }

  /** Override the scan endpoints (useful for testing) */
  public setEndpoints(endpoints: ScanEndpoint[]): void {
    this.httpClient.setEndpoints(endpoints);
  }

  /** Get the network type */
  public getNetwork(): NetworkType {
    return this.network;
  }

  /** Get the logger instance */
  public getLogger(): Logger | undefined {
    return this.logger;
  }

  /** Get the current API URL (base URL of current endpoint) */
  public getApiUrl(): string {
    return this.httpClient.getCurrentEndpoint()?.url ?? '';
  }

  public async makeGetRequest<T>(path: string, config: RequestConfig = {}): Promise<T> {
    return this.httpClient.makeGetRequest<T>(path, config);
  }

  public async makePostRequest<T>(path: string, data: unknown, config: RequestConfig = {}): Promise<T> {
    return this.httpClient.makePostRequest<T>(path, data, config);
  }
}
