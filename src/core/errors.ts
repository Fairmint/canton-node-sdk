/** Base error class for all Canton SDK errors */
export class CantonError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'CantonError';
  }
}

/** Error thrown when configuration is invalid or missing */
export class ConfigurationError extends CantonError {
  constructor(message: string, originalError?: unknown) {
    super(message, 'CONFIGURATION_ERROR', originalError);
    this.name = 'ConfigurationError';
  }
}

/** Error thrown when authentication fails */
export class AuthenticationError extends CantonError {
  constructor(message: string, originalError?: unknown) {
    super(message, 'AUTHENTICATION_ERROR', originalError);
    this.name = 'AuthenticationError';
  }
}

/** Error thrown when API requests fail */
export class ApiError extends CantonError {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly statusText?: string,
    originalError?: unknown
  ) {
    super(message, 'API_ERROR', originalError);
    this.name = 'ApiError';
  }
}

/** Error thrown when parameter validation fails */
export class ValidationError extends CantonError {
  constructor(message: string, originalError?: unknown) {
    super(message, 'VALIDATION_ERROR', originalError);
    this.name = 'ValidationError';
  }
}

/** Error thrown when network requests fail */
export class NetworkError extends CantonError {
  constructor(message: string, originalError?: unknown) {
    super(message, 'NETWORK_ERROR', originalError);
    this.name = 'NetworkError';
  }
}
