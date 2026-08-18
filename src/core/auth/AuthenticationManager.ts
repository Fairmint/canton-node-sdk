import {
  AuthenticationManager as RestClientAuthManager,
  type AuthConfig as RestClientAuthConfig,
  type RestClientLogger,
} from '@hardlydifficult/rest-client';
import { TimeoutError } from '../errors';
import { abortableSleep, createAbortError, isAbortError, throwIfAborted } from '../http/abort';
import { DEFAULT_HTTP_RETRY_CONFIG, DEFAULT_HTTP_TIMEOUT_MS } from '../http/HttpClient';
import { type Logger } from '../logging';
import { type AuthConfig } from '../types';

export interface AuthResponse {
  readonly access_token: string;
  readonly token_type?: string;
  readonly expires_in?: number;
  readonly scope?: string;
}

type AuthDebugEvent =
  | 'token_cache_hit'
  | 'token_cleared'
  | 'token_issued'
  | 'token_refreshed'
  | 'token_request'
  | 'token_request_failed';

type AuthCacheState = 'missing' | 'non_expiring' | 'refresh_window' | 'valid';

interface AuthDebugContext {
  readonly authType: RestClientAuthConfig['type'];
  readonly authUrl?: string;
  readonly clientId?: string;
  readonly grantType?: 'client_credentials' | 'password';
  readonly tokenUrl?: string;
}

interface TokenStateSnapshot {
  readonly expiryTime: number | null;
  readonly hasToken: boolean;
  readonly isValid: boolean;
  readonly issuedAt: number | null;
  readonly lifetimeMs: number | null;
}

let authDebugSequence = 0;

/**
 * Manages OAuth2 authentication and token lifecycle. Delegates to `@hardlydifficult/rest-client`'s
 * AuthenticationManager internally.
 */
export class AuthenticationManager {
  private authGeneration = 0;
  private readonly delegate: RestClientAuthManager;
  private readonly debugContext: AuthDebugContext;
  private readonly debugEnabled: boolean;
  private pendingAuthentication: Promise<string> | null = null;

  constructor(authUrl: string, authConfig: AuthConfig, logger?: Logger) {
    const restAuthConfig = convertAuthConfig(authUrl, authConfig, logger);
    this.debugContext = createAuthDebugContext(authUrl, restAuthConfig);
    this.debugEnabled = isAuthDebugEnabled();
    this.delegate = new RestClientAuthManager(restAuthConfig, toRestLogger(logger));
  }

  /**
   * `timeoutMs` bounds how long a caller waits for the delegate's authentication call without canceling it, so a
   * still-pending delegate call keeps running and updates cached token state once it eventually settles.
   *
   * `signal`, when supplied, stops waiting immediately on abort instead of holding the timer for the full
   * `timeoutMs`. Abort also cancels sleep between token-endpoint retries for the in-flight request this caller
   * started; it does not abort a token POST that has already been dispatched. An already-aborted `signal`
   * short-circuits before the delegate is ever invoked, independent of `timeoutMs`.
   */
  public async authenticate(timeoutMs: number = DEFAULT_HTTP_TIMEOUT_MS, signal?: AbortSignal): Promise<string> {
    // Check before touching the delegate or any shared in-flight state: an already-aborted caller must never
    // trigger (or join) a token request, independent of `timeoutMs`.
    throwIfAborted(signal);
    const beforeSnapshot = this.captureTokenSnapshot();
    const requestReason = this.getTokenRequestReason(beforeSnapshot);

    if (requestReason === null) {
      const token = await this.withAuthTimeout(this.delegate.authenticate(), timeoutMs, signal);
      const afterSnapshot = this.captureTokenSnapshot();
      this.logAuthDebug('token_cache_hit', afterSnapshot);
      return token;
    }

    if (this.pendingAuthentication) {
      return this.withAuthTimeout(this.pendingAuthentication, timeoutMs, signal);
    }

    this.logAuthDebug('token_request', beforeSnapshot, { requestReason });

    const requestGeneration = this.authGeneration;
    const authenticationPromise = this.authenticateDelegateWithRetry(signal)
      .then((token) => {
        if (requestGeneration !== this.authGeneration) {
          this.delegate.clearToken();
        }

        const afterSnapshot = this.captureTokenSnapshot();
        this.logAuthDebug(beforeSnapshot.hasToken ? 'token_refreshed' : 'token_issued', afterSnapshot, {
          requestReason,
        });
        return token;
      })
      .catch((error) => {
        this.logAuthDebug('token_request_failed', beforeSnapshot, {
          error: formatAuthDebugError(error),
          requestReason,
        });
        throw error;
      })
      .finally(() => {
        if (this.pendingAuthentication === authenticationPromise) {
          this.pendingAuthentication = null;
        }
      });

    this.pendingAuthentication = authenticationPromise;
    return this.withAuthTimeout(authenticationPromise, timeoutMs, signal);
  }

  /**
   * Retries the live token POST for transient failures only. Callers still share this promise via
   * `pendingAuthentication`, so concurrent `authenticate()` waits join one in-flight request including its retries.
   */
  private async authenticateDelegateWithRetry(signal?: AbortSignal): Promise<string> {
    const maxAttempts = DEFAULT_HTTP_RETRY_CONFIG.maxRetries + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      throwIfAborted(signal);
      try {
        return await this.delegate.authenticate();
      } catch (error) {
        if (attempt >= maxAttempts || !isRetryableTokenError(error)) {
          throw error;
        }
        await abortableSleep(DEFAULT_HTTP_RETRY_CONFIG.delayMs, signal);
      }
    }

    throw new Error('Token request retry loop completed without a response or error');
  }

  public async getBearerToken(timeoutMs: number = DEFAULT_HTTP_TIMEOUT_MS, signal?: AbortSignal): Promise<string> {
    return this.authenticate(timeoutMs, signal);
  }

  public clearToken(): void {
    const beforeSnapshot = this.captureTokenSnapshot();
    this.authGeneration += 1;
    this.pendingAuthentication = null;
    this.delegate.clearToken();
    this.logAuthDebug('token_cleared', beforeSnapshot, { hadToken: beforeSnapshot.hasToken });
  }

  public getTokenExpiryTime(): number | null {
    return this.delegate.getTokenExpiryTime();
  }

  public getTokenIssuedAt(): number | null {
    return this.delegate.getTokenIssuedAt();
  }

  public getTokenLifetimeMs(): number | null {
    return this.delegate.getTokenLifetimeMs();
  }

  /**
   * Bounds how long a caller waits for `promise` without canceling the underlying delegate call. `timeoutMs === 0`
   * only disables the timer, restoring the unbounded-wait budget; it does not skip abort handling, since
   * cancellation and the timeout budget are independent concerns. A `signal` that is already aborted before this
   * call begins rejects immediately instead of waiting on `promise`.
   *
   * Clears its own timer as soon as `signal` aborts so a caller-driven cancellation never leaves a live timer handle
   * behind for the remainder of `timeoutMs`. The `finally` removes the abort listener on every outcome (success,
   * timeout, or abort) so a long-lived, reused `signal` never accumulates listeners across repeated calls.
   */
  private async withAuthTimeout(
    promise: Promise<string>,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<string> {
    if (timeoutMs === 0 && signal === undefined) return promise;
    throwIfAborted(signal);

    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      onAbort = (): void => {
        clearTimeout(timer);
        reject(createAbortError(signal));
      };
      if (timeoutMs !== 0) {
        timer = setTimeout(() => {
          reject(new TimeoutError(`Authentication request timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }
      signal?.addEventListener('abort', onAbort, { once: true });
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timer);
      if (onAbort) signal?.removeEventListener('abort', onAbort);
    }
  }

  private captureTokenSnapshot(): TokenStateSnapshot {
    const issuedAt = this.delegate.getTokenIssuedAt();
    const expiryTime = this.delegate.getTokenExpiryTime();
    const lifetimeMs = this.delegate.getTokenLifetimeMs();
    const hasToken = issuedAt !== null;

    return {
      expiryTime,
      hasToken,
      isValid: hasToken && isTokenValid(issuedAt, expiryTime, lifetimeMs),
      issuedAt,
      lifetimeMs,
    };
  }

  private getTokenRequestReason(snapshot: TokenStateSnapshot): 'missing_token' | 'refresh_window' | null {
    const cacheState = this.getCacheState(snapshot);
    if (cacheState === 'missing') {
      return 'missing_token';
    }
    if (cacheState === 'refresh_window') {
      return 'refresh_window';
    }
    return null;
  }

  private getCacheState(snapshot: TokenStateSnapshot): AuthCacheState {
    if (!snapshot.hasToken) {
      return 'missing';
    }
    if (snapshot.expiryTime === null) {
      return 'non_expiring';
    }
    return snapshot.isValid ? 'valid' : 'refresh_window';
  }

  private logAuthDebug(
    event: AuthDebugEvent,
    snapshot: TokenStateSnapshot,
    extras: Readonly<Record<string, boolean | number | string>> = {},
  ): void {
    if (!this.shouldLogAuthDebug()) {
      return;
    }

    const payload: Record<string, boolean | number | string | null> = {
      authType: this.debugContext.authType,
      cacheState: this.getCacheState(snapshot),
      event,
      hasToken: snapshot.hasToken,
      pid: process.pid,
      seq: nextAuthDebugSequence(),
      timestamp: new Date().toISOString(),
      tokenExpiryTime: snapshot.expiryTime,
      tokenIssuedAt: snapshot.issuedAt,
      tokenLifetimeMs: snapshot.lifetimeMs,
    };

    const tokenAgeMs = snapshot.issuedAt === null ? null : Math.max(0, Date.now() - snapshot.issuedAt);
    payload['tokenAgeMs'] = tokenAgeMs;

    if (this.debugContext.authUrl) {
      payload['authUrl'] = this.debugContext.authUrl;
    }
    if (this.debugContext.clientId) {
      payload['clientId'] = this.debugContext.clientId;
    }
    if (this.debugContext.grantType) {
      payload['grantType'] = this.debugContext.grantType;
    }
    if (this.debugContext.tokenUrl) {
      payload['tokenUrl'] = this.debugContext.tokenUrl;
    }

    for (const [key, value] of Object.entries(extras)) {
      payload[key] = value;
    }

    // eslint-disable-next-line no-console -- opt-in debug tracing for token lifecycle diagnostics
    console.info(`[FAIRMINT_AUTH_DEBUG] ${JSON.stringify(payload)}`);
  }

  private shouldLogAuthDebug(): boolean {
    return this.debugEnabled && this.debugContext.authType === 'oauth2';
  }
}

/**
 * Token POSTs bypass HttpClient, so rest-client's single axios.post is retried here for transient failures only.
 */
function isRetryableTokenError(error: unknown): boolean {
  if (error instanceof TimeoutError || isAbortError(error)) {
    return false;
  }

  const status = readErrorStatus(error);
  if (status !== undefined) {
    // 5xx from the token endpoint (Authentik 502/EOF) is typically a brief backend blip.
    // 4xx like 401/403/400 invalid_grant is a credential/request problem and will not recover.
    return status >= 500 && status < 600;
  }

  // Missing access_token and grant-config problems are AuthenticationError, not transport failures.
  if (error instanceof Error && error.name === 'AuthenticationError') {
    return false;
  }

  // No HTTP status: axios no-response (ECONNRESET, ECONNREFUSED, EPIPE, connection EOF, etc.).
  return true;
}

function readErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return undefined;
  }
  const { status } = error;
  return typeof status === 'number' && Number.isInteger(status) ? status : undefined;
}

/** Converts Canton's auth config format to rest-client's auth config format. */
function convertAuthConfig(
  authUrl: string,
  config: AuthConfig,
  logger?: Logger,
): RestClientAuthConfig {
  if (config.bearerToken) {
    return { type: 'bearer', token: config.bearerToken };
  }

  if (config.tokenGenerator) {
    return { type: 'generator', generate: config.tokenGenerator };
  }

  if (!config.clientId || config.clientId.trim() === '') {
    if (authUrl && authUrl.trim() !== '') {
      logger?.warn?.(
        `[AuthenticationManager] Auth URL is configured (${authUrl}) but clientId is empty. ` +
          `Requests will be sent without authentication. ` +
          `Set CANTON_<NETWORK>_<PROVIDER>_LEDGER_JSON_API_CLIENT_ID to fix.`,
      );
    }
    return { type: 'none' };
  }

  const tokenUrl = authUrl.endsWith('/') ? authUrl : `${authUrl}/`;

  if (config.grantType === 'password') {
    return {
      type: 'oauth2' as const,
      tokenUrl,
      clientId: config.clientId,
      grantType: 'password' as const,
      username: config.username,
      password: config.password,
      ...(config.audience ? { audience: config.audience } : {}),
      ...(config.scope ? { scope: config.scope } : {}),
    };
  }

  return {
    type: 'oauth2' as const,
    tokenUrl,
    clientId: config.clientId,
    grantType: 'client_credentials' as const,
    ...(config.clientSecret ? { clientSecret: config.clientSecret } : {}),
    ...(config.audience ? { audience: config.audience } : {}),
    ...(config.scope ? { scope: config.scope } : {}),
  };
}

/** Adapts Canton's Logger to rest-client's RestClientLogger. */
function toRestLogger(logger: Logger | undefined): RestClientLogger | undefined {
  if (!logger) return undefined;
  const adapted: RestClientLogger = {};
  if (logger.debug) adapted.debug = logger.debug.bind(logger);
  if (logger.info) adapted.info = logger.info.bind(logger);
  if (logger.warn) adapted.warn = logger.warn.bind(logger);
  if (logger.error) adapted.error = logger.error.bind(logger);
  return adapted;
}

function createAuthDebugContext(authUrl: string, config: RestClientAuthConfig): AuthDebugContext {
  if (config.type !== 'oauth2') {
    return {
      authType: config.type,
      ...(authUrl ? { authUrl } : {}),
    };
  }

  return {
    authType: config.type,
    ...(authUrl ? { authUrl } : {}),
    ...(config.clientId ? { clientId: config.clientId } : {}),
    ...(config.grantType ? { grantType: config.grantType } : {}),
    ...(config.tokenUrl ? { tokenUrl: config.tokenUrl } : {}),
  };
}

function formatAuthDebugError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').trim();
}

function isAuthDebugEnabled(): boolean {
  const rawValue = process.env['FAIRMINT_AUTH_DEBUG'];
  if (rawValue === undefined) {
    return false;
  }
  return ['1', 'true', 'yes', 'on'].includes(rawValue.toLowerCase());
}

function isTokenValid(issuedAt: number | null, expiryTime: number | null, lifetimeMs: number | null): boolean {
  if (issuedAt === null) {
    return false;
  }
  if (expiryTime === null) {
    return true;
  }

  const defaultBufferMs = 5 * 60 * 1000;
  const bufferMs = lifetimeMs !== null ? Math.min(defaultBufferMs, Math.floor(lifetimeMs / 2)) : defaultBufferMs;
  return Date.now() < expiryTime - bufferMs;
}

function nextAuthDebugSequence(): number {
  authDebugSequence += 1;
  return authDebugSequence;
}
