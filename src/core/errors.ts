import { RestClientError } from '@hardlydifficult/rest-client';

/** JSON-serializable context for error details. */
export type ErrorContext = Readonly<Record<string, unknown>>;

/** Base error codes for standard SDK errors. */
export const ErrorCode = {
  CANTON_ERROR: 'CANTON_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  API_ERROR: 'API_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
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
