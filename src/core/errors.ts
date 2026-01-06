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
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
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
