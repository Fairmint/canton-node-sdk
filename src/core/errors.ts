/** JSON-serializable context for error details */
export type ErrorContext = Record<string, unknown>;

/** Error type discriminators for exhaustive type checking */
export const ErrorType = {
  CANTON: 'CANTON',
  CONFIGURATION: 'CONFIGURATION',
  AUTHENTICATION: 'AUTHENTICATION',
  API: 'API',
  VALIDATION: 'VALIDATION',
  NETWORK: 'NETWORK',
  OPERATION: 'OPERATION',
} as const;

export type ErrorTypeValue = (typeof ErrorType)[keyof typeof ErrorType];

/** Base error class for all Canton SDK errors */
export class CantonError extends Error {
  /** Discriminator for type narrowing */
  readonly type: ErrorTypeValue = ErrorType.CANTON;

  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: ErrorContext
  ) {
    super(message);
    this.name = 'CantonError';
  }
}

/** Error thrown when configuration is invalid or missing */
export class ConfigurationError extends CantonError {
  override readonly type = ErrorType.CONFIGURATION;

  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR');
    this.name = 'ConfigurationError';
  }
}

/** Error thrown when authentication fails */
export class AuthenticationError extends CantonError {
  override readonly type = ErrorType.AUTHENTICATION;

  constructor(message: string) {
    super(message, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

/** Error thrown when API requests fail */
export class ApiError extends CantonError {
  override readonly type = ErrorType.API;

  /** The response data from the failed request, if available */
  public response?: ErrorContext;

  constructor(
    message: string,
    public readonly status?: number,
    public readonly statusText?: string
  ) {
    super(message, 'API_ERROR');
    this.name = 'ApiError';
  }
}

/** Error thrown when parameter validation fails */
export class ValidationError extends CantonError {
  override readonly type = ErrorType.VALIDATION;

  constructor(message: string, context?: ErrorContext) {
    super(message, 'VALIDATION_ERROR', context);
    this.name = 'ValidationError';
  }
}

/** Error thrown when network requests fail */
export class NetworkError extends CantonError {
  override readonly type = ErrorType.NETWORK;

  constructor(message: string) {
    super(message, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}

/** Error codes for operation-specific errors */
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

/** Error thrown when SDK operations fail */
export class OperationError extends CantonError {
  override readonly type = ErrorType.OPERATION;

  constructor(message: string, code: OperationErrorCodeType, context?: ErrorContext) {
    super(message, code, context);
    this.name = 'OperationError';
  }
}
