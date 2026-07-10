import {
  ApiError,
  ConfigurationError,
  NetworkError,
  snapshotHttpRequestOptions,
  type CantonRuntime,
  type HttpReadRequestOptions,
  type HttpRequestOptions,
  type RequestConfig,
} from '../../core';
import { getScanHostRoot, resolveScanApiUrls } from './scan-endpoints';
import { ScanApiClient as ScanApiClientGenerated } from './ScanApiClient.generated';

export interface ScanApiClientOptions {
  /** Override the rotation list (must include the full `/api/scan` base). */
  readonly scanApiUrls?: readonly string[];

  /** Maximum number of distinct scan endpoints to try per request (defaults to all). */
  readonly maxEndpointAttempts?: number;
}

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

function resolveConfiguredScanApiUrl(runtime: CantonRuntime): string | undefined {
  try {
    return runtime.createClientConfig('SCAN_API').apis?.SCAN_API?.apiUrl;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return undefined;
    }
    throw error;
  }
}

interface RotatableScanUrl {
  readonly buildUrl: (baseUrl: string) => string;
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

  constructor(runtime: CantonRuntime, options: ScanApiClientOptions = {}) {
    const resolvedUrls = options.scanApiUrls ?? resolveScanApiUrls(runtime.getNetwork(), runtime.getProvider());
    const fallbackUrl = resolvedUrls.length > 0 ? undefined : resolveConfiguredScanApiUrl(runtime);
    const scanApiUrls = Object.freeze([...(resolvedUrls.length > 0 ? resolvedUrls : fallbackUrl ? [fallbackUrl] : [])]);

    const [firstApiUrl] = scanApiUrls;
    if (!firstApiUrl) {
      throw new ConfigurationError(
        `No public scan endpoints configured for network '${runtime.getNetwork()}'. Provide scanApiUrls explicitly.`
      );
    }

    super(
      runtime.fork({
        apis: {
          SCAN_API: {
            apiUrl: firstApiUrl,
            // Public endpoints do not require auth; the AuthenticationManager skips auth when clientId is empty.
            auth: { grantType: 'client_credentials', clientId: '' },
          },
        },
      })
    );

    this.scanApiUrls = scanApiUrls;
    this.maxEndpointAttempts = options.maxEndpointAttempts ?? scanApiUrls.length;
    if (!Number.isInteger(this.maxEndpointAttempts) || this.maxEndpointAttempts < 1) {
      throw new ConfigurationError('maxEndpointAttempts must be a positive integer');
    }
    this.activeBaseUrlIndex = 0;

    // Prefer rotating quickly across endpoints rather than waiting on per-endpoint retries.
    this.httpClient.setRetryConfig({ maxRetries: 0, delayMs: 0 });
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

  private getRotatableUrl(fullUrl: string): RotatableScanUrl | null {
    for (const base of this.scanApiUrls) {
      if (fullUrl.startsWith(base)) {
        const relativePath = fullUrl.slice(base.length);
        return {
          buildUrl: (baseUrl): string => `${baseUrl}${relativePath}`,
        };
      }

      const hostRoot = getScanHostRoot(base);
      if (fullUrl.startsWith(hostRoot)) {
        const relativePath = fullUrl.slice(hostRoot.length);
        if (relativePath.startsWith('/')) {
          return {
            buildUrl: (baseUrl): string => `${getScanHostRoot(baseUrl)}${relativePath}`,
          };
        }
      }
    }

    const marker = '/api/scan';
    const idx = fullUrl.indexOf(marker);
    if (idx >= 0) {
      const relativePath = fullUrl.slice(idx + marker.length);
      return {
        buildUrl: (baseUrl): string => `${baseUrl}${relativePath}`,
      };
    }

    return null;
  }

  /** Run Scan failover inside one HttpClient retry loop so attempt budgets, bodies, and hook history stay coherent. */
  private async makeReadRequestWithFailover<T, Body>(
    fullUrl: string,
    options: Readonly<HttpReadRequestOptions<Body> | HttpRequestOptions<Body>>,
    doRequest: (requestOptions: HttpReadRequestOptions<Body>) => Promise<T>
  ): Promise<T> {
    const readOptions = snapshotHttpRequestOptions<Body>({ ...options, requestSemantics: 'read' });
    // An explicit resolver is the caller's failover policy and takes precedence over Scan's built-in endpoint list.
    if (
      this.scanApiUrls.length <= 1 ||
      readOptions.retry?.kind === 'none' ||
      readOptions.resolveReadAttemptUrl !== undefined
    ) {
      return doRequest(readOptions);
    }

    const rotatableUrl = this.getRotatableUrl(fullUrl);
    if (rotatableUrl === null) {
      return doRequest(readOptions);
    }

    const maxDistinctEndpoints = Math.min(this.maxEndpointAttempts, this.scanApiUrls.length);
    const startingBaseUrlIndex = this.activeBaseUrlIndex;
    let selectedBaseUrlIndex = startingBaseUrlIndex;
    const shouldRetryScanFailure = ({
      error,
      retryable,
    }: {
      readonly error: Error;
      readonly retryable: boolean;
    }): boolean => retryable || shouldRotateOnError(error);
    const configuredRetry = readOptions.retry;
    // A caller-supplied predicate is authoritative, matching HttpClient semantics. Scan contributes its transport and
    // rotation classification only when the caller supplies an attempt budget without a custom predicate.
    const retry =
      configuredRetry === undefined
        ? Object.freeze({
            kind: 'exact-body' as const,
            maxAttempts: maxDistinctEndpoints,
            backoffMs: 0,
            shouldRetry: shouldRetryScanFailure,
          })
        : configuredRetry.shouldRetry === undefined
          ? Object.freeze({ ...configuredRetry, shouldRetry: shouldRetryScanFailure })
          : configuredRetry;
    const failoverOptions = snapshotHttpRequestOptions<Body>({
      ...readOptions,
      retry,
      requestSemantics: 'read',
      resolveReadAttemptUrl: ({ attempt }): string => {
        const endpointOffset = (attempt - 1) % maxDistinctEndpoints;
        selectedBaseUrlIndex = (startingBaseUrlIndex + endpointOffset) % this.scanApiUrls.length;
        const baseUrl = this.scanApiUrls[selectedBaseUrlIndex];
        if (!baseUrl) {
          throw new ConfigurationError(`Missing Scan endpoint at index ${selectedBaseUrlIndex}`);
        }
        return rotatableUrl.buildUrl(baseUrl);
      },
    });

    const result = await doRequest(failoverOptions);
    this.setActiveBaseUrl(selectedBaseUrlIndex);
    return result;
  }

  public override async makeGetRequest<T>(
    url: string,
    config: RequestConfig = {},
    options: HttpReadRequestOptions<undefined> = {}
  ): Promise<T> {
    const requestConfig: RequestConfig = Object.freeze({ ...config });
    const requestOptions = snapshotHttpRequestOptions(options);
    if (requestOptions.retry?.kind === 'none') {
      return super.makeGetRequest<T>(url, requestConfig, requestOptions);
    }
    return this.makeReadRequestWithFailover(url, requestOptions, async (failoverOptions) =>
      super.makeGetRequest<T>(url, requestConfig, failoverOptions)
    );
  }

  public override async makePostRequest<T, Body = unknown>(
    url: string,
    data: Body,
    config: RequestConfig = {},
    options: HttpRequestOptions<Body> = {}
  ): Promise<T> {
    const requestConfig: RequestConfig = Object.freeze({ ...config });
    const requestOptions = snapshotHttpRequestOptions(options);
    if (requestOptions.requestSemantics !== 'read' || requestOptions.retry?.kind === 'none') {
      return super.makePostRequest<T, Body>(url, data, requestConfig, requestOptions);
    }
    return this.makeReadRequestWithFailover(url, requestOptions, async (failoverOptions) =>
      super.makePostRequest<T, Body>(url, data, requestConfig, failoverOptions)
    );
  }

  public override async makeDeleteRequest<T>(
    url: string,
    config: RequestConfig = {},
    options: HttpRequestOptions<undefined> = {}
  ): Promise<T> {
    const requestConfig: RequestConfig = Object.freeze({ ...config });
    const requestOptions = snapshotHttpRequestOptions(options);
    if (requestOptions.requestSemantics !== 'read' || requestOptions.retry?.kind === 'none') {
      return super.makeDeleteRequest<T>(url, requestConfig, requestOptions);
    }
    return this.makeReadRequestWithFailover(url, requestOptions, async (failoverOptions) =>
      super.makeDeleteRequest<T>(url, requestConfig, failoverOptions)
    );
  }

  public override async makePatchRequest<T, Body = unknown>(
    url: string,
    data: Body,
    config: RequestConfig = {},
    options: HttpRequestOptions<Body> = {}
  ): Promise<T> {
    const requestConfig: RequestConfig = Object.freeze({ ...config });
    const requestOptions = snapshotHttpRequestOptions(options);
    if (requestOptions.requestSemantics !== 'read' || requestOptions.retry?.kind === 'none') {
      return super.makePatchRequest<T, Body>(url, data, requestConfig, requestOptions);
    }
    return this.makeReadRequestWithFailover(url, requestOptions, async (failoverOptions) =>
      super.makePatchRequest<T, Body>(url, data, requestConfig, failoverOptions)
    );
  }
}
