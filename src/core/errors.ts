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

export class ConfigurationError extends CantonError {
  constructor(message: string, originalError?: unknown) {
    super(message, 'CONFIGURATION_ERROR', originalError);
    this.name = 'ConfigurationError';
  }
}

export class AuthenticationError extends CantonError {
  constructor(message: string, originalError?: unknown) {
    super(message, 'AUTHENTICATION_ERROR', originalError);
    this.name = 'AuthenticationError';
  }
}

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

export class ValidationError extends CantonError {
  constructor(message: string, originalError?: unknown) {
    super(message, 'VALIDATION_ERROR', originalError);
    this.name = 'ValidationError';
  }
}

export class NetworkError extends CantonError {
  constructor(message: string, originalError?: unknown) {
    super(message, 'NETWORK_ERROR', originalError);
    this.name = 'NetworkError';
  }
}
