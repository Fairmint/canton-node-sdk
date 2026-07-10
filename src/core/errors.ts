import { RestClientError } from '@hardlydifficult/rest-client';

/** JSON-serializable context for error details. */
export type ErrorContext = Readonly<Record<string, unknown>>;

/** Serializable details extracted from a Canton SDK-shaped error. */
export interface NormalizedCantonErrorDetails {
  readonly name: string;
  readonly message: string;
  readonly status?: number;
  readonly statusText?: string;
  readonly code?: string;
  readonly context?: unknown;
  /**
   * Alias for `context` for compatibility with existing API-error handling code.
   *
   * @deprecated Use `context` instead.
   */
  readonly response?: unknown;
}

/** Base error codes for standard SDK errors. */
export const ErrorCode = {
  CANTON_ERROR: 'CANTON_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  API_ERROR: 'API_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN_MUTATION_OUTCOME: 'UNKNOWN_MUTATION_OUTCOME',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Base error class for all Canton SDK errors. Extends `@hardlydifficult/rest-client`'s `RestClientError` so errors are
 * compatible with both hierarchies.
 */
export class CantonError extends RestClientError {
  public override readonly name: string;

  constructor(message: string, code: string, context?: ErrorContext) {
    super(message, code, context);
    this.name = 'CantonError';
  }
}

/** Error thrown when configuration is invalid or missing. */
export class ConfigurationError extends CantonError {
  public override readonly name: string;

  constructor(message: string, context?: ErrorContext) {
    super(message, ErrorCode.CONFIGURATION_ERROR, context);
    this.name = 'ConfigurationError';
  }
}

/** Error thrown when authentication fails. */
export class AuthenticationError extends CantonError {
  public override readonly name: string;

  constructor(message: string, context?: ErrorContext) {
    super(message, ErrorCode.AUTHENTICATION_ERROR, context);
    this.name = 'AuthenticationError';
  }
}

/** Error thrown when API requests fail. */
export class ApiError extends CantonError {
  public override readonly name: string;

  constructor(
    message: string,
    public readonly status?: number,
    public readonly statusText?: string,
    response?: ErrorContext
  ) {
    super(message, ErrorCode.API_ERROR, response);
    this.name = 'ApiError';
  }

  /**
   * Alias for `context` for backwards compatibility and semantic clarity.
   *
   * @deprecated Use `context` instead for consistency with other error classes.
   */
  public get response(): ErrorContext | undefined {
    return this.context;
  }
}

/** Error thrown when parameter validation fails. */
export class ValidationError extends CantonError {
  public override readonly name: string;

  constructor(message: string, context?: ErrorContext) {
    super(message, ErrorCode.VALIDATION_ERROR, context);
    this.name = 'ValidationError';
  }
}

/** Error thrown when network requests fail. */
export class NetworkError extends CantonError {
  public override readonly name: string;

  constructor(message: string, context?: ErrorContext) {
    super(message, ErrorCode.NETWORK_ERROR, context);
    this.name = 'NetworkError';
  }
}

/** HTTP methods whose requests may have changed server state before the response was lost. */
export type MutationHttpMethod = 'POST' | 'PATCH' | 'DELETE';

/** Safe, redacted details for a mutation whose server-side outcome cannot be determined. */
export interface UnknownMutationOutcomeDetails {
  readonly method: MutationHttpMethod;
  readonly endpoint: string;
  readonly attempts: number;
  readonly attemptIdentifiers?: readonly string[];
}

/**
 * Error thrown when a mutation was dispatched but the transport could not determine whether the server applied it.
 *
 * Request bodies, signatures, and tokens are deliberately excluded from the message and serializable context. Callers
 * may opt into a retry strategy and supply explicitly redacted attempt identifiers when an operation is safe to retry.
 */
export class UnknownMutationOutcomeError extends CantonError {
  public override readonly name: string;
  public readonly method: MutationHttpMethod;
  public readonly endpoint: string;
  public readonly attempts: number;
  public readonly attemptIdentifiers: readonly string[];
  public readonly cause: Error;

  constructor(details: UnknownMutationOutcomeDetails, cause: Error) {
    const attemptIdentifiers = Object.freeze([...(details.attemptIdentifiers ?? [])]);
    const context: ErrorContext = {
      method: details.method,
      endpoint: details.endpoint,
      attempts: details.attempts,
      ...(attemptIdentifiers.length > 0 ? { attemptIdentifiers } : {}),
    };

    super(
      `The outcome of ${details.method} ${details.endpoint} is unknown after ${details.attempts} request attempt${details.attempts === 1 ? '' : 's'}`,
      ErrorCode.UNKNOWN_MUTATION_OUTCOME,
      context
    );
    this.name = 'UnknownMutationOutcomeError';
    this.method = details.method;
    this.endpoint = details.endpoint;
    this.attempts = details.attempts;
    this.attemptIdentifiers = attemptIdentifiers;
    this.cause = cause;
    Object.defineProperty(this, 'cause', { enumerable: false });
  }
}

/** Error codes for operation-specific errors. */
export const OperationErrorCode = {
  MISSING_CONTRACT: 'MISSING_CONTRACT',
  MISSING_DOMAIN_ID: 'MISSING_DOMAIN_ID',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  INVALID_PARAMETER: 'INVALID_PARAMETER',
  MINING_ROUND_NOT_FOUND: 'MINING_ROUND_NOT_FOUND',
  PARTY_CREATION_FAILED: 'PARTY_CREATION_FAILED',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
} as const;

export type OperationErrorCodeType = (typeof OperationErrorCode)[keyof typeof OperationErrorCode];

/** Error thrown when SDK operations fail. */
export class OperationError extends CantonError {
  public override readonly name: string;

  constructor(message: string, code: OperationErrorCodeType, context?: ErrorContext) {
    super(message, code, context);
    this.name = 'OperationError';
  }
}

const CANTON_SDK_ERROR_NAMES = new Set([
  'ApiError',
  'AuthenticationError',
  'CantonError',
  'ConfigurationError',
  'NetworkError',
  'OperationError',
  'UnknownMutationOutcomeError',
  'ValidationError',
]);

/** Normalize a Canton SDK-shaped error into serializable details for logging or API responses. */
export function normalizeCantonError(error: unknown): NormalizedCantonErrorDetails | null {
  if (!(error instanceof Error)) return null;

  const source = isObjectRecord(error) ? error : {};
  const context = readErrorContext(source);
  const status = readNumericErrorProperty(source, 'status') ?? readNumericErrorProperty(source, 'statusCode');
  const statusText = readStringErrorProperty(source, 'statusText');
  const code = readContextCode(context) ?? readStringErrorProperty(source, 'code');
  const sdkError = error instanceof CantonError || CANTON_SDK_ERROR_NAMES.has(error.name);

  if (!sdkError && status === undefined && code === undefined) return null;

  return {
    name: error.name,
    message: error.message,
    ...(status !== undefined ? { status } : {}),
    ...(statusText ? { statusText } : {}),
    ...(code ? { code } : {}),
    ...(context !== undefined ? { context, response: context } : {}),
  };
}

/** Return true when a Canton response proves that a mutation was rejected, independently from retryability. */
export function isDefiniteCantonMutationRejection(error: unknown): boolean {
  const details = normalizeCantonError(error);
  const status = details?.status;
  if (status === undefined) return false;
  return status >= 400 && status < 500 && status !== 408 && status !== 425 && status !== 429;
}

/** Read Canton's structured mutation-outcome signal when the API supplies one. */
export function readCantonDefiniteAnswer(error: unknown): boolean | undefined {
  const direct = readDefiniteAnswerProperty(error);
  if (direct !== undefined) return direct;
  return readDefiniteAnswerProperty(normalizeCantonError(error)?.context);
}

function readDefiniteAnswerProperty(source: unknown): boolean | undefined {
  if (!isObjectRecord(source)) return undefined;
  const value = source['definiteAnswer'] ?? source['definite_answer'];
  return typeof value === 'boolean' ? value : undefined;
}

/** Read normalized error context from current and legacy SDK error fields. */
function readErrorContext(source: Record<string, unknown>): unknown {
  const { context } = source;
  if (context !== undefined) return context;
  if ('response' in source) return source['response'];
  return undefined;
}

/** Read a string error code from normalized context when one is present. */
function readContextCode(context: unknown): string | undefined {
  return isObjectRecord(context) && typeof context['code'] === 'string' ? context['code'] : undefined;
}

/** Read a finite numeric property from an SDK-shaped error object. */
function readNumericErrorProperty(source: Record<string, unknown>, property: string): number | undefined {
  const value = source[property];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Read a non-empty string property from an SDK-shaped error object. */
function readStringErrorProperty(source: Record<string, unknown>, property: string): string | undefined {
  const value = source[property];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Return true when a value can be inspected as a plain object record. */
function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
