import { BaseClient, ClientConfig, NetworkType } from '../../core';
import { SCAN_ENDPOINTS } from './config';

export class ScanBaseClient extends BaseClient {
  private currentEndpointIndex = 0;
  private endpoints: string[] = [];

  constructor(apiType: string, clientConfig?: ClientConfig) {
    // We pass a dummy API config to satisfy BaseClient's validation
    // because Scan API endpoints are not in the standard configuration (EnvLoader)
    // and we want to allow instantiation without explicit API config.
    const config = clientConfig || { network: 'mainnet' as NetworkType };
    
    // Ensure apis.SCAN_API exists so BaseClient doesn't throw
    if (!config.apis) {
      config.apis = {};
    }
    if (!config.apis.SCAN_API) {
      config.apis.SCAN_API = {
        apiUrl: 'https://placeholder.scan.api', // Will be ignored by our overrides
        auth: {
          grantType: 'client_credentials', // Dummy
          clientId: 'dummy',
        },
      };
    }

    super('SCAN_API', config);
    this.initializeEndpoints();
  }

  private initializeEndpoints() {
    const network = this.getNetwork();
    
    // Check if user provided a specific URL in the config passed to constructor
    // (This would have been merged into this.clientConfig by BaseClient)
    const configuredUrl = this.clientConfig.apis?.SCAN_API?.apiUrl;
    const isPlaceholder = configuredUrl === 'https://placeholder.scan.api';

    if (configuredUrl && !isPlaceholder) {
      this.endpoints = [configuredUrl];
    } else {
      this.endpoints = SCAN_ENDPOINTS[network as keyof typeof SCAN_ENDPOINTS] || [];
      if (this.endpoints.length === 0) {
        // Fallback or warning?
        this.getLogger()?.warn(`No Scan API endpoints found for network: ${network}`);
      }
    }

    // Randomize starting point to distribute load
    if (this.endpoints.length > 1) {
      this.currentEndpointIndex = Math.floor(Math.random() * this.endpoints.length);
    }
  }

  public override getApiUrl(): string {
    if (this.endpoints.length === 0) {
      return super.getApiUrl();
    }
    return this.endpoints[this.currentEndpointIndex];
  }

  private rotateEndpoint() {
    if (this.endpoints.length > 1) {
      this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.endpoints.length;
      this.getLogger()?.info(`Rotated Scan API endpoint to: ${this.endpoints[this.currentEndpointIndex]}`);
    }
  }

  private async executeWithRetry<T>(
    operation: (url: string) => Promise<T>,
    retryCount = 0
  ): Promise<T> {
    const url = this.getApiUrl();
    try {
      return await operation(url);
    } catch (error) {
      // Check if we should rotate and retry
      // We rely on HttpClient's retry logic for transient errors on the *same* URL first.
      // But HttpClient throws if it fails 3 times.
      // If we catch it here, it means the current endpoint is bad.
      
      if (this.endpoints.length > 1 && retryCount < this.endpoints.length) {
        this.getLogger()?.warn(`Request to ${url} failed, rotating endpoint. Error: ${error}`);
        this.rotateEndpoint();
        return this.executeWithRetry(operation, retryCount + 1);
      }
      throw error;
    }
  }

  // Override makeGetRequest to inject rotation logic
  // Note: BaseClient.makeGetRequest calls this.httpClient.makeGetRequest(url, ...)
  // The url passed to makeGetRequest is already fully formed (apiUrl + path).
  // We need to replace the base part of the URL if we rotate.

  public override async authenticate(): Promise<string> {
    // Scan API is public, no authentication needed
    await Promise.resolve();
    return '';
  }

  public override async makeGetRequest<T>(
    url: string,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    // We don't need authentication for Scan API usually
    // But we respect the config if passed.
    // However, we want to disable auth if it was enabled by default but we know we don't need it.
    // The user said "These endpoints are public". 
    // So we can force includeBearerToken to false unless explicitly required?
    // Let's assume standard behavior but rotation is the key.

    return this.executeWithRetry(async (currentBaseUrl) => {
      const requestUrl = this.replaceBaseUrl(url, currentBaseUrl);
      return super.makeGetRequest(requestUrl, config);
    });
  }

  public override async makePostRequest<T>(
    url: string,
    data: unknown,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    return this.executeWithRetry(async (currentBaseUrl) => {
      const requestUrl = this.replaceBaseUrl(url, currentBaseUrl);
      return super.makePostRequest(requestUrl, data, config);
    });
  }

    public override async makeDeleteRequest<T>(
    url: string,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    return this.executeWithRetry(async (currentBaseUrl) => {
      const requestUrl = this.replaceBaseUrl(url, currentBaseUrl);
      return super.makeDeleteRequest(requestUrl, config);
    });
  }

  public override async makePatchRequest<T>(
    url: string,
    data: unknown,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    return this.executeWithRetry(async (currentBaseUrl) => {
      const requestUrl = this.replaceBaseUrl(url, currentBaseUrl);
      return super.makePatchRequest(requestUrl, data, config);
    });
  }

  // Helper to replace the base URL in the full URL
  private replaceBaseUrl(fullUrl: string, newBaseUrl: string): string {
    // We assume fullUrl starts with one of the endpoints.
    // However, the first time we call this, fullUrl was constructed using this.getApiUrl().
    // So it should match the *current* endpoint (or the one used when building the URL).
    
    // If we rotated, the current endpoint in `this.endpoints` is already updated.
    // But `fullUrl` has the *old* base.
    
    // We can iterate over all endpoints to find which one is the prefix.
    for (const endpoint of this.endpoints) {
      if (fullUrl.startsWith(endpoint)) {
        return fullUrl.replace(endpoint, newBaseUrl);
      }
    }
    
    // If not found (maybe it was the placeholder?), just return newBaseUrl + path?
    // If fullUrl doesn't start with any known endpoint, maybe it's relative or something else?
    // Or maybe the list of endpoints changed?
    
    // If it starts with the placeholder:
    if (fullUrl.startsWith('https://placeholder.scan.api')) {
         return fullUrl.replace('https://placeholder.scan.api', newBaseUrl);
    }

    return fullUrl;
  }
}
