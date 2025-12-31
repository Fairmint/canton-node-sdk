import {
  ApiError,
  ConfigurationError,
  NetworkError,
  type ClientConfig,
  type NetworkType,
  type ProviderType,
} from '../../core';
import { resolveScanApiUrls } from './scan-endpoints';
import { ScanApiClient as ScanApiClientGenerated } from './ScanApiClient.generated';

export type ScanApiClientConfig = ClientConfig & {
  /** Optional override for the rotation list (must include the full `/api/scan` base). */
  scanApiUrls?: readonly string[];

  /** Maximum number of distinct scan endpoints to try per request (defaults to all). */
  maxEndpointAttempts?: number;
};

function shouldRotateOnError(error: unknown): boolean {
  if (error instanceof NetworkError) {
    return true;
  }
  if (error instanceof ApiError) {
    const { status } = error;
    if (status === undefined) {
      return true;
    }
    if (status === 429 || status === 408) {
      return true;
    }
    if (status >= 500) {
      return true;
    }
  }
  return false;
}

/**
 * Public Scan API client.
 *
 * These endpoints are unauthenticated but rate-limited and may be intermittently unavailable. This client supports
 * rotating across known public scan endpoints on transient failures.
 */
export class ScanApiClient extends ScanApiClientGenerated {
  private readonly scanApiUrls: readonly string[];
  private readonly maxEndpointAttempts: number;
  private activeBaseUrlIndex: number;

  constructor(config?: ScanApiClientConfig) {
    const network: NetworkType = config?.network ?? 'mainnet';
    const provider: ProviderType | undefined = config?.provider;

    const resolvedUrls = config?.scanApiUrls ?? resolveScanApiUrls(network, provider);
    const fallbackUrl = config?.apis?.SCAN_API?.apiUrl;
    const scanApiUrls = resolvedUrls.length > 0 ? resolvedUrls : fallbackUrl ? [fallbackUrl] : [];

    const [firstApiUrl] = scanApiUrls;
    if (!firstApiUrl) {
      throw new ConfigurationError(
        `No public scan endpoints configured for network '${network}'. Provide scanApiUrls explicitly.`
      );
    }

    const clientConfig: ClientConfig = {
      network,
      ...(provider !== undefined ? { provider } : {}),
      ...(config?.logger !== undefined ? { logger: config.logger } : {}),
      ...(config?.partyId !== undefined ? { partyId: config.partyId } : {}),
      ...(config?.userId !== undefined ? { userId: config.userId } : {}),
      ...(config?.managedParties !== undefined ? { managedParties: config.managedParties } : {}),
      authUrl: config?.authUrl ?? '',
      apis: {
        ...(config?.apis ?? {}),
        SCAN_API: {
          apiUrl: firstApiUrl,
          // Public endpoints do not require auth; the AuthenticationManager skips auth when clientId is empty.
          auth: { grantType: 'client_credentials', clientId: '' },
        },
      },
    };

    super(clientConfig);

    this.scanApiUrls = scanApiUrls;
    this.maxEndpointAttempts = config?.maxEndpointAttempts ?? scanApiUrls.length;
    this.activeBaseUrlIndex = 0;

    // Prefer rotating quickly across endpoints rather than waiting on per-endpoint retries.
    this.httpClient.setRetryConfig({ maxRetries: 0 });
  }

  private setActiveBaseUrl(index: number): void {
    if (index === this.activeBaseUrlIndex) {
      return;
    }
    this.activeBaseUrlIndex = index;

    const apiConfig = this.config.apis[this.apiType];
    if (apiConfig) {
      apiConfig.apiUrl = this.scanApiUrls[index] ?? apiConfig.apiUrl;
    }
  }

  private getRelativeUrlWithinApiRoot(fullUrl: string): string | null {
    for (const base of this.scanApiUrls) {
      if (fullUrl.startsWith(base)) {
        return fullUrl.slice(base.length);
      }
    }

    const marker = '/api/scan';
    const idx = fullUrl.indexOf(marker);
    if (idx >= 0) {
      return fullUrl.slice(idx + marker.length);
    }

    return null;
  }

  private async rotateRequest<T>(fullUrl: string, doRequest: (url: string) => Promise<T>): Promise<T> {
    if (this.scanApiUrls.length <= 1) {
      return doRequest(fullUrl);
    }

    const relative = this.getRelativeUrlWithinApiRoot(fullUrl);
    if (relative === null) {
      return doRequest(fullUrl);
    }

    const maxAttempts = Math.min(this.maxEndpointAttempts, this.scanApiUrls.length);
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const index = (this.activeBaseUrlIndex + attempt) % this.scanApiUrls.length;
      const base = this.scanApiUrls[index];
      if (!base) {
        continue;
      }
      const url = `${base}${relative}`;

      try {
        const result = await doRequest(url);
        this.setActiveBaseUrl(index);
        return result;
      } catch (error) {
        if (!shouldRotateOnError(error)) {
          throw error;
        }
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new NetworkError(`Scan request failed: ${String(lastError)}`);
  }

  public override async makeGetRequest<T>(
    url: string,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    return this.rotateRequest(url, async (u) => super.makeGetRequest<T>(u, config));
  }

  public override async makePostRequest<T>(
    url: string,
    data: unknown,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    return this.rotateRequest(url, async (u) => super.makePostRequest<T>(u, data, config));
  }

  public override async makeDeleteRequest<T>(
    url: string,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    return this.rotateRequest(url, async (u) => super.makeDeleteRequest<T>(u, config));
  }

  public override async makePatchRequest<T>(
    url: string,
    data: unknown,
    config: { contentType?: string; includeBearerToken?: boolean } = {}
  ): Promise<T> {
    return this.rotateRequest(url, async (u) => super.makePatchRequest<T>(u, data, config));
  }
}
