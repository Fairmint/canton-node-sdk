import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import {
  ApiError,
  AuthenticationError,
  CantonError,
  ConfigurationError,
  NetworkError,
  UnknownMutationOutcomeError,
  isDefiniteCantonMutationRejection,
  type MutationHttpMethod,
} from '../errors';
import { type Logger } from '../logging';
import { type RequestConfig } from '../types';
import { awaitWithAbort, createAbortError, isAbortError, throwIfAborted } from './abort';
import {
  snapshotHttpRequestOptions,
  type DeepReadonly,
  type HttpReadAttemptUrlContext,
  type HttpReadRequestOptions,
  type HttpRequestAttemptContext,
  type HttpRequestOptions,
  type HttpRequestRetryContext,
  type HttpRequestRetryStrategy,
  type RequestAttemptSummary,
  type RequestErrorClassification,
  type RequestOutcomeCertainty,
  type RequestSemantics,
} from './request-retry';
import { cloneRequestValue, deepFreezeRequestValue } from './request-value';

export interface HttpClientRetryConfig {
  /** Number of retries after the initial attempt for requests explicitly classified as semantic reads. */
  readonly maxRetries: number;
  /** Delay between read-only retries in milliseconds. */
  readonly delayMs: number;
}

type HttpMethod = 'GET' | MutationHttpMethod;

interface AttemptFailure<Body> {
  readonly error: Error;
  readonly retryContext: HttpRequestRetryContext<Body>;
  readonly summary: RequestAttemptSummary;
}

/** Handles HTTP requests with authentication, logging, cancellation, and explicit retry safety. */
export class HttpClient {
  private readonly axiosInstance: AxiosInstance;
  private readonly bearerTokenProvider: (() => Promise<string>) | undefined;
  private readonly logger: Logger | undefined;
  private retryConfig: HttpClientRetryConfig = { maxRetries: 3, delayMs: 6000 };

  // Error message formatting constants
  private static readonly CAUSE_TRUNCATE_LENGTH = 200;
  private static readonly CONTEXT_VALUE_TRUNCATE_LENGTH = 50;
  private static readonly MAX_CONTEXT_KEYS = 3;
  private static readonly MAX_ATTEMPT_IDENTIFIER_LENGTH = 200;

  constructor(logger?: Logger, bearerTokenProvider?: () => Promise<string>) {
    this.axiosInstance = axios.create();
    this.bearerTokenProvider = bearerTokenProvider;
    this.logger = logger;
  }

  /** Configure the default retry policy used only by requests classified as semantic reads. */
  public setRetryConfig(config: HttpClientRetryConfig): void {
    if (!Number.isInteger(config.maxRetries) || config.maxRetries < 0) {
      throw new ConfigurationError('HTTP maxRetries must be a non-negative integer');
    }
    if (!Number.isFinite(config.delayMs) || config.delayMs < 0) {
      throw new ConfigurationError('HTTP retry delayMs must be a non-negative finite number');
    }
    this.retryConfig = { ...config };
  }

  public async makeGetRequest<T>(
    url: string,
    config: RequestConfig = {},
    options: HttpReadRequestOptions<undefined> = {}
  ): Promise<T> {
    return this.makeRequest<T, undefined>('GET', url, undefined, config, options);
  }

  public async makePostRequest<T, Body = unknown>(
    url: string,
    data: Body,
    config: RequestConfig = {},
    options: HttpRequestOptions<Body> = {}
  ): Promise<T> {
    return this.makeRequest<T, Body>('POST', url, data, config, options);
  }

  public async makeDeleteRequest<T>(
    url: string,
    config: RequestConfig = {},
    options: HttpRequestOptions<undefined> = {}
  ): Promise<T> {
    return this.makeRequest<T, undefined>('DELETE', url, undefined, config, options);
  }

  public async makePatchRequest<T, Body = unknown>(
    url: string,
    data: Body,
    config: RequestConfig = {},
    options: HttpRequestOptions<Body> = {}
  ): Promise<T> {
    return this.makeRequest<T, Body>('PATCH', url, data, config, options);
  }

  private async makeRequest<T, Body>(
    method: HttpMethod,
    url: string,
    initialBody: Body,
    config: RequestConfig,
    options: HttpReadRequestOptions<Body> | HttpRequestOptions<Body>
  ): Promise<T> {
    // Snapshot every caller-owned option before the first asynchronous boundary. In particular, never let replacing an
    // options signal or retry object while a token/hook is pending change the in-flight request contract.
    const requestOptions = snapshotHttpRequestOptions(options);
    const requestConfig: RequestConfig = Object.freeze({ ...config });
    const {
      signal,
      retry: requestedRetry,
      requestSemantics: requestedSemantics,
      resolveReadAttemptUrl,
    } = requestOptions;
    const requestSemantics = requestedSemantics ?? (method === 'GET' ? 'read' : 'mutation');
    if (method === 'GET' && requestSemantics !== 'read') {
      throw new ConfigurationError('HTTP GET requests must use read semantics');
    }
    if (resolveReadAttemptUrl !== undefined && requestSemantics !== 'read') {
      throw new ConfigurationError('Endpoint failover is only supported for semantic reads');
    }
    const strategy = this.resolveRetryStrategy(requestSemantics, requestedRetry);
    const maxAttempts = strategy.kind === 'none' ? 1 : strategy.maxAttempts;
    this.validateMaxAttempts(maxAttempts);

    const requiresImmutableBody = strategy.kind !== 'none';
    let currentBody = this.cloneBody(initialBody, requiresImmutableBody);
    let lastFailure: AttemptFailure<Body> | undefined;
    const failedAttempts: RequestAttemptSummary[] = [];

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let attemptContext: HttpRequestAttemptContext<Body>;
      let attemptUrl = url;
      let identifier: string | undefined;
      try {
        throwIfAborted(signal);

        if (attempt > 1 && strategy.kind === 'derived-body') {
          const priorFailure = lastFailure;
          if (!priorFailure) {
            throw new ConfigurationError('Cannot derive a retry body without a failed request attempt');
          }
          const derivedBody = await awaitWithAbort(async (): Promise<DeepReadonly<Body>> => {
            const body = await strategy.deriveBody(priorFailure.retryContext);
            return body;
          }, signal);
          currentBody = this.cloneDerivedBody(derivedBody);
        }

        attemptContext = this.createAttemptContext(attempt, currentBody, failedAttempts, signal, requiresImmutableBody);
        if (resolveReadAttemptUrl !== undefined) {
          const urlContext: HttpReadAttemptUrlContext<Body> = Object.freeze({
            ...attemptContext,
            originalUrl: url,
          });
          const resolvedAttemptUrl: unknown = await awaitWithAbort(
            async (): Promise<string> => resolveReadAttemptUrl(urlContext),
            signal
          );
          if (typeof resolvedAttemptUrl !== 'string' || resolvedAttemptUrl.length === 0) {
            throw new ConfigurationError('Read endpoint resolver must return a non-empty URL');
          }
          attemptUrl = resolvedAttemptUrl;
        }
        const getAttemptIdentifier = strategy.kind === 'none' ? undefined : strategy.getAttemptIdentifier;
        identifier = getAttemptIdentifier
          ? this.redactAttemptIdentifier(
              await awaitWithAbort(async (): Promise<string | undefined> => {
                const attemptIdentifier = await getAttemptIdentifier(attemptContext);
                return attemptIdentifier;
              }, signal)
            )
          : undefined;

        const beforeAttempt = strategy.kind === 'none' ? undefined : strategy.beforeAttempt;
        if (beforeAttempt) {
          await awaitWithAbort(async (): Promise<void> => {
            await beforeAttempt(attemptContext);
          }, signal);
        }
        throwIfAborted(signal);
      } catch (preDispatchError) {
        throw this.preservePriorAmbiguity(
          requestSemantics,
          method,
          attemptUrl,
          this.normalizeCallbackError(preDispatchError),
          failedAttempts
        );
      }

      let dispatched = false;
      try {
        const headers = await awaitWithAbort(async (): Promise<Record<string, string>> => {
          const builtHeaders = await this.buildHeaders(requestConfig);
          return builtHeaders;
        }, signal);
        throwIfAborted(signal);
        const requestBody = this.cloneBody(currentBody, requiresImmutableBody);
        dispatched = true;
        const response = await this.dispatchRequest<T, Body>(method, attemptUrl, requestBody, headers, signal);

        this.observeLog(
          attemptUrl,
          method === 'GET' || method === 'DELETE' ? { method, headers } : { method, headers, data: requestBody },
          response
        );
        return response;
      } catch (rawError) {
        if (this.isCanceledError(rawError) || isAbortError(rawError)) {
          const abortError = createAbortError(signal, rawError);
          if (requestSemantics === 'read' || (!dispatched && !this.hasAmbiguousAttempt(failedAttempts))) {
            throw abortError;
          }
          if (!dispatched) {
            throw this.toTerminalError(requestSemantics, method, attemptUrl, abortError, failedAttempts);
          }
          const canceledAttempt: RequestAttemptSummary = Object.freeze({
            attempt,
            ...(identifier !== undefined ? { identifier } : {}),
            errorClassification: 'ambiguous-mutation-outcome',
            outcomeCertainty: 'ambiguous',
            retryable: false,
          });
          throw this.toTerminalError(requestSemantics, method, attemptUrl, abortError, [
            ...failedAttempts,
            canceledAttempt,
          ]);
        }

        const error = this.handleRequestError(rawError);
        const retryable = this.isRetryableError(rawError);
        const { errorClassification, outcomeCertainty } = this.classifyRequestError(
          requestSemantics,
          error,
          dispatched,
          retryable
        );
        const summary: RequestAttemptSummary = Object.freeze({
          attempt,
          ...(identifier !== undefined ? { identifier } : {}),
          errorClassification,
          outcomeCertainty,
          retryable,
        });
        const retryContext: HttpRequestRetryContext<Body> = Object.freeze({
          ...attemptContext,
          error,
          errorClassification,
          outcomeCertainty,
          retryable,
        });
        const failure: AttemptFailure<Body> = {
          error,
          retryContext,
          summary,
        };
        lastFailure = failure;

        this.logFailedRequest(method, attemptUrl, currentBody, rawError);

        let retryRequest: boolean;
        try {
          retryRequest = await this.shouldRetry(strategy, failure, attempt, maxAttempts, requestSemantics, signal);
        } catch (retryHookError) {
          throw this.toTerminalError(
            requestSemantics,
            method,
            attemptUrl,
            this.normalizeCallbackError(retryHookError),
            [...failedAttempts, summary]
          );
        }

        if (retryRequest) {
          failedAttempts.push(summary);
          this.logRetry(method, attemptUrl, attempt, maxAttempts, summary, rawError);
          try {
            await this.waitForRetry(strategy, retryContext, signal);
          } catch (backoffError) {
            const normalizedBackoffError = this.normalizeCallbackError(backoffError);
            throw this.toTerminalError(requestSemantics, method, attemptUrl, normalizedBackoffError, failedAttempts);
          }
          continue;
        }

        throw this.toTerminalError(requestSemantics, method, attemptUrl, error, [...failedAttempts, summary]);
      }
    }

    // The loop either returns or throws for every attempt.
    throw new ConfigurationError('HTTP retry loop completed without a response or error');
  }

  private resolveRetryStrategy<Body>(
    requestSemantics: RequestSemantics,
    retry: HttpRequestRetryStrategy<Body> | undefined
  ): HttpRequestRetryStrategy<Body> {
    if (retry) {
      if (retry.kind === 'none') return Object.freeze({ kind: 'none' });
      if (retry.kind === 'exact-body') return Object.freeze({ ...retry });
      return Object.freeze({ ...retry });
    }

    // Semantic reads retain transient retry behavior regardless of HTTP verb. Mutations must explicitly opt in because
    // their server outcome may be unknown after a response is lost.
    if (requestSemantics === 'read') {
      return Object.freeze({
        kind: 'exact-body',
        maxAttempts: this.retryConfig.maxRetries + 1,
        backoffMs: this.retryConfig.delayMs,
      });
    }
    return Object.freeze({ kind: 'none' });
  }

  private validateMaxAttempts(maxAttempts: number): void {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new ConfigurationError('HTTP retry maxAttempts must be a positive integer');
    }
  }

  private async shouldRetry<Body>(
    strategy: HttpRequestRetryStrategy<Body>,
    failure: AttemptFailure<Body>,
    attempt: number,
    maxAttempts: number,
    requestSemantics: RequestSemantics,
    signal: AbortSignal | undefined
  ): Promise<boolean> {
    if (strategy.kind === 'none' || attempt >= maxAttempts) return false;
    const { shouldRetry } = strategy;
    if (shouldRetry) {
      return awaitWithAbort(async (): Promise<boolean> => {
        const retry = await shouldRetry(failure.retryContext);
        return retry;
      }, signal);
    }
    if (requestSemantics === 'read') return failure.summary.retryable;
    return failure.summary.outcomeCertainty !== 'ambiguous' && failure.summary.retryable;
  }

  private async waitForRetry<Body>(
    strategy: HttpRequestRetryStrategy<Body>,
    context: HttpRequestRetryContext<Body>,
    signal: AbortSignal | undefined
  ): Promise<void> {
    if (strategy.kind === 'none') return;
    const configuredBackoff = strategy.backoffMs ?? this.retryConfig.delayMs;
    const delayMs =
      typeof configuredBackoff === 'function'
        ? await awaitWithAbort(async (): Promise<number> => {
            const backoff = await configuredBackoff(context);
            return backoff;
          }, signal)
        : configuredBackoff;
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new ConfigurationError('HTTP retry backoffMs must resolve to a non-negative finite number');
    }
    if (delayMs === 0) {
      throwIfAborted(signal);
      return;
    }
    await this.abortableSleep(delayMs, signal);
  }

  private createAttemptContext<Body>(
    attempt: number,
    body: Body,
    previousAttempts: readonly RequestAttemptSummary[],
    signal: AbortSignal | undefined,
    immutableBody: boolean
  ): HttpRequestAttemptContext<Body> {
    const context = {
      attempt,
      body: immutableBody ? this.createReadonlyBody(body) : (body as DeepReadonly<Body>),
      previousAttempts: Object.freeze([...previousAttempts]),
      ...(signal !== undefined ? { signal } : {}),
    };
    return Object.freeze(context);
  }

  private createReadonlyBody<Body>(body: Body): DeepReadonly<Body> {
    const cloned = this.cloneBody(body, true);
    return deepFreezeRequestValue(cloned) as DeepReadonly<Body>;
  }

  private cloneBody<Body>(body: Body, required: boolean): Body {
    try {
      return cloneRequestValue(body);
    } catch (error) {
      if (!required) return body;
      throw new ConfigurationError('Retryable HTTP request bodies must be structured-cloneable', {
        cause: error instanceof Error ? error.message : 'unknown clone failure',
      });
    }
  }

  /** Convert a deeply readonly callback result back into an isolated mutable transport snapshot. */
  private cloneDerivedBody<Body>(body: DeepReadonly<Body>): Body {
    try {
      return cloneRequestValue(body) as Body;
    } catch (error) {
      throw new ConfigurationError('Derived HTTP request bodies must be structured-cloneable', {
        cause: error instanceof Error ? error.message : 'unknown clone failure',
      });
    }
  }

  private async dispatchRequest<T, Body>(
    method: HttpMethod,
    url: string,
    body: Body,
    headers: Record<string, string>,
    signal: AbortSignal | undefined
  ): Promise<T> {
    const axiosConfig: AxiosRequestConfig = {
      headers,
      ...(signal !== undefined ? { signal } : {}),
    };

    switch (method) {
      case 'GET':
        return (await this.axiosInstance.get<T>(url, axiosConfig)).data;
      case 'POST':
        return (await this.axiosInstance.post<T>(url, body, axiosConfig)).data;
      case 'DELETE':
        return (await this.axiosInstance.delete<T>(url, axiosConfig)).data;
      case 'PATCH':
        return (await this.axiosInstance.patch<T>(url, body, axiosConfig)).data;
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
      if (!this.bearerTokenProvider) {
        throw new AuthenticationError('Bearer token requested but no token provider is configured');
      }

      const token = await this.bearerTokenProvider();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  /** Invoke logging as a detached observer. Logger behavior can never affect request control flow. */
  private observeLog(url: string, request: unknown, response: unknown): void {
    if (!this.logger) return;
    try {
      const requestSnapshot = this.createLogSnapshot(request, true);
      const responseSnapshot = this.createLogSnapshot(response);
      void Promise.resolve(this.logger.logRequestResponse(url, requestSnapshot, responseSnapshot)).catch(
        () => undefined
      );
    } catch {
      // Logging is deliberately observational, including for synchronous logger failures.
    }
  }

  /** Isolate logger-owned values so a custom logger cannot mutate request or response control-flow state. */
  private createLogSnapshot(value: unknown, redactRequestHeaders = false): unknown {
    try {
      const snapshot: unknown = cloneRequestValue(value);
      if (redactRequestHeaders) this.redactSensitiveLogHeaders(snapshot);
      return deepFreezeRequestValue(snapshot);
    } catch {
      return '[log value unavailable]';
    }
  }

  /** Remove credentials from logger-owned header snapshots without changing dispatch headers. */
  private redactSensitiveLogHeaders(request: unknown): void {
    if (typeof request !== 'object' || request === null || !('headers' in request)) return;
    const { headers } = request;
    if (typeof headers !== 'object' || headers === null) return;

    for (const headerName of Object.keys(headers)) {
      const normalizedHeaderName = headerName.toLowerCase();
      if (normalizedHeaderName === 'authorization' || normalizedHeaderName === 'proxy-authorization') {
        Reflect.set(headers, headerName, '[REDACTED]');
      }
    }
  }

  private logFailedRequest<Body>(method: HttpMethod, url: string, body: Body, error: unknown): void {
    if (!axios.isAxiosError(error)) return;
    const request = method === 'GET' || method === 'DELETE' ? { method } : { method, data: body };
    this.observeLog(url, request, error.response?.data ?? error.message);
  }

  private logRetry(
    method: HttpMethod,
    url: string,
    attempt: number,
    maxAttempts: number,
    summary: RequestAttemptSummary,
    error: unknown
  ): void {
    this.observeLog(
      url,
      {
        method,
        nextAttempt: attempt + 1,
        ...(summary.identifier !== undefined ? { attemptIdentifier: summary.identifier } : {}),
      },
      `Retrying after ${summary.errorClassification} (next attempt ${attempt + 1}/${maxAttempts}): ${
        axios.isAxiosError(error) ? (error.response?.status ?? 'network error') : 'request error'
      }`
    );
  }

  private handleRequestError(error: unknown): Error {
    if (error instanceof CantonError) return error;
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = (error.response?.data ?? {}) as Record<string, unknown>;
      const code = typeof data['code'] === 'string' ? data['code'] : undefined;
      const message = typeof data['message'] === 'string' ? data['message'] : undefined;
      const cause = typeof data['cause'] === 'string' ? data['cause'] : undefined;
      // Only accept plain objects for context, not arrays or null
      const context =
        typeof data['context'] === 'object' && data['context'] !== null && !Array.isArray(data['context'])
          ? data['context']
          : undefined;

      // Build error message with all available details
      let msg = `HTTP ${status}`;
      if (code) {
        msg += `: ${code}`;
      }
      if (message) {
        msg += ` - ${message}`;
      }
      // Include cause for DAML/Canton errors - this is the actionable info
      if (cause) {
        const truncatedCause =
          cause.length > HttpClient.CAUSE_TRUNCATE_LENGTH
            ? `${cause.substring(0, HttpClient.CAUSE_TRUNCATE_LENGTH)}...`
            : cause;
        msg += ` (cause: ${truncatedCause})`;
      }
      // Include context summary if available
      if (context) {
        const contextSummary = this.formatContextSummary(context as Record<string, unknown>);
        if (contextSummary) {
          msg += ` [context: ${contextSummary}]`;
        }
      }

      // Non-standard bodies (e.g. reverse-proxy "404 page not found") rarely include Canton fields; the URL is the best repro hint.
      if (error.config?.url) {
        msg += ` [request: ${error.config.method ?? 'GET'} ${error.config.url}]`;
      }

      return new ApiError(msg, status, error.response?.statusText, data);
    }
    return new NetworkError(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  /** Formats a context object into a summary string. Shows up to MAX_CONTEXT_KEYS keys with truncated values. */
  private formatContextSummary(contextObj: Record<string, unknown>): string | undefined {
    const contextKeys = Object.keys(contextObj);
    if (contextKeys.length === 0) {
      return undefined;
    }

    return contextKeys
      .slice(0, HttpClient.MAX_CONTEXT_KEYS)
      .map((k) => {
        const v = contextObj[k];
        const vStr = this.stringifyContextValue(v);
        const truncatedValue =
          vStr.length > HttpClient.CONTEXT_VALUE_TRUNCATE_LENGTH
            ? `${vStr.substring(0, HttpClient.CONTEXT_VALUE_TRUNCATE_LENGTH)}...`
            : vStr;
        return `${k}=${truncatedValue}`;
      })
      .join(', ');
  }

  /** Safely converts a context value to a string representation. */
  private stringifyContextValue(v: unknown): string {
    if (typeof v === 'string') {
      return v;
    }
    if (v === null) {
      return 'null';
    }
    if (v === undefined) {
      return 'undefined';
    }
    try {
      const result = JSON.stringify(v);
      return typeof result === 'string' ? result : '[Object]';
    } catch {
      return '[Object]';
    }
  }

  /** Return true for transport failures that the SDK has historically classified as transient. */
  private isRetryableError(error: unknown): boolean {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = (error.response?.data ?? {}) as Record<string, unknown>;
      const code = typeof data['code'] === 'string' ? data['code'] : undefined;

      if (status === undefined || status === 404 || (status >= 500 && status < 600)) return true;
      if (status === 400 && code === 'UNKNOWN_CONTRACT_SYNCHRONIZERS') return true;
      if (status === 409 && code === 'SEQUENCER_BACKPRESSURE') return true;
      return false;
    }
    return error instanceof NetworkError;
  }

  private classifyRequestError(
    requestSemantics: RequestSemantics,
    error: Error,
    dispatched: boolean,
    retryable: boolean
  ): {
    readonly errorClassification: RequestErrorClassification;
    readonly outcomeCertainty: RequestOutcomeCertainty;
  } {
    if (!dispatched) {
      return { errorClassification: 'pre-dispatch-failure', outcomeCertainty: 'not-dispatched' };
    }
    if (requestSemantics === 'read') {
      return {
        errorClassification: retryable ? 'transient-read-failure' : 'definite-rejection',
        outcomeCertainty: 'definite',
      };
    }
    if (isDefiniteCantonMutationRejection(error)) {
      return { errorClassification: 'definite-rejection', outcomeCertainty: 'definite' };
    }
    return { errorClassification: 'ambiguous-mutation-outcome', outcomeCertainty: 'ambiguous' };
  }

  private toTerminalError(
    requestSemantics: RequestSemantics,
    method: HttpMethod,
    url: string,
    error: Error,
    attempts: readonly RequestAttemptSummary[]
  ): Error {
    if (requestSemantics === 'read' || method === 'GET' || !this.hasAmbiguousAttempt(attempts)) {
      return error;
    }

    const attemptIdentifiers = attempts.flatMap((attempt) =>
      attempt.identifier === undefined ? [] : [attempt.identifier]
    );
    return new UnknownMutationOutcomeError(
      {
        method,
        endpoint: this.redactEndpoint(url),
        attempts: attempts.length,
        ...(attemptIdentifiers.length > 0 ? { attemptIdentifiers } : {}),
      },
      error
    );
  }

  private preservePriorAmbiguity(
    requestSemantics: RequestSemantics,
    method: HttpMethod,
    url: string,
    error: Error,
    previousAttempts: readonly RequestAttemptSummary[]
  ): Error {
    return this.toTerminalError(requestSemantics, method, url, error, previousAttempts);
  }

  private hasAmbiguousAttempt(attempts: readonly RequestAttemptSummary[]): boolean {
    return attempts.some((attempt) => attempt.outcomeCertainty === 'ambiguous');
  }

  private normalizeCallbackError(error: unknown): Error {
    return error instanceof Error ? error : new NetworkError(`Request callback failed: ${String(error)}`);
  }

  private redactEndpoint(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      const queryIndex = url.search(/[?#]/u);
      return queryIndex < 0 ? url : url.slice(0, queryIndex);
    }
  }

  private redactAttemptIdentifier(identifier: string | undefined): string | undefined {
    if (identifier === undefined) return undefined;
    return identifier.slice(0, HttpClient.MAX_ATTEMPT_IDENTIFIER_LENGTH);
  }

  private isCanceledError(error: unknown): boolean {
    return axios.isCancel(error) || (axios.isAxiosError(error) && error.code === 'ERR_CANCELED');
  }

  private async abortableSleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
    throwIfAborted(signal);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = (): void => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(createAbortError(signal));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}
