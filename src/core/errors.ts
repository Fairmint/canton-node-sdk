/** Base error class for all Canton SDK errors */
export class CantonError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CantonError';
  }
}

/** Error thrown when configuration is invalid or missing */
export class ConfigurationError extends CantonError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR');
    this.name = 'ConfigurationError';
  }
}

/** Error thrown when authentication fails */
export class AuthenticationError extends CantonError {
  constructor(message: string) {
    super(message, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

/** Error thrown when API requests fail */
export class ApiError extends CantonError {
  /** The response data from the failed request, if available */
  public response?: Record<string, unknown>;

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
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', context);
    this.name = 'ValidationError';
  }
}

/** Error thrown when network requests fail */
export class NetworkError extends CantonError {
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
  constructor(
    message: string,
    code: OperationErrorCodeType,
    context?: Record<string, unknown>
  ) {
    super(message, code, context);
    this.name = 'OperationError';
  }
}
