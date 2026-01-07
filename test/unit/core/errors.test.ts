import {
  CantonError,
  ConfigurationError,
  AuthenticationError,
  ApiError,
  ValidationError,
  NetworkError,
  OperationError,
  OperationErrorCode,
} from '../../../src/core/errors';

describe('CantonError hierarchy', () => {
  describe('CantonError (base)', () => {
    it('creates error with message and code', () => {
      const error = new CantonError('Test error', 'TEST_CODE');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('CantonError');
      expect(error.context).toBeUndefined();
    });

    it('creates error with context', () => {
      const error = new CantonError('Test error', 'TEST_CODE', { key: 'value' });
      expect(error.context).toEqual({ key: 'value' });
    });

    it('inherits from Error', () => {
      const error = new CantonError('Test', 'CODE');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('ConfigurationError', () => {
    it('creates error with CONFIGURATION_ERROR code', () => {
      const error = new ConfigurationError('Missing API key');
      expect(error.message).toBe('Missing API key');
      expect(error.code).toBe('CONFIGURATION_ERROR');
      expect(error.name).toBe('ConfigurationError');
    });

    it('inherits from CantonError', () => {
      const error = new ConfigurationError('Test');
      expect(error).toBeInstanceOf(CantonError);
    });
  });

  describe('AuthenticationError', () => {
    it('creates error with AUTHENTICATION_ERROR code', () => {
      const error = new AuthenticationError('Invalid token');
      expect(error.message).toBe('Invalid token');
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.name).toBe('AuthenticationError');
    });

    it('inherits from CantonError', () => {
      const error = new AuthenticationError('Test');
      expect(error).toBeInstanceOf(CantonError);
    });
  });

  describe('ApiError', () => {
    it('creates error with status and statusText', () => {
      const error = new ApiError('HTTP 500', 500, 'Internal Server Error');
      expect(error.message).toBe('HTTP 500');
      expect(error.code).toBe('API_ERROR');
      expect(error.status).toBe(500);
      expect(error.statusText).toBe('Internal Server Error');
      expect(error.name).toBe('ApiError');
    });

    it('allows setting response', () => {
      const error = new ApiError('HTTP 400', 400);
      error.response = { code: 'BAD_REQUEST' };
      expect(error.response).toEqual({ code: 'BAD_REQUEST' });
    });

    it('handles optional parameters', () => {
      const error = new ApiError('Request failed');
      expect(error.status).toBeUndefined();
      expect(error.statusText).toBeUndefined();
    });
  });

  describe('ValidationError', () => {
    it('creates error with VALIDATION_ERROR code', () => {
      const error = new ValidationError('Invalid parameter');
      expect(error.message).toBe('Invalid parameter');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.name).toBe('ValidationError');
    });

    it('accepts context parameter', () => {
      const error = new ValidationError('Invalid value', { field: 'amount', value: -1 });
      expect(error.context).toEqual({ field: 'amount', value: -1 });
    });

    it('inherits from CantonError', () => {
      const error = new ValidationError('Test');
      expect(error).toBeInstanceOf(CantonError);
    });
  });

  describe('NetworkError', () => {
    it('creates error with NETWORK_ERROR code', () => {
      const error = new NetworkError('Connection refused');
      expect(error.message).toBe('Connection refused');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.name).toBe('NetworkError');
    });

    it('inherits from CantonError', () => {
      const error = new NetworkError('Test');
      expect(error).toBeInstanceOf(CantonError);
    });
  });

  describe('OperationError', () => {
    it('creates error with specific operation code', () => {
      const error = new OperationError(
        'No contract found',
        OperationErrorCode.MISSING_CONTRACT,
        { partyId: 'alice::123' }
      );
      expect(error.message).toBe('No contract found');
      expect(error.code).toBe('MISSING_CONTRACT');
      expect(error.name).toBe('OperationError');
      expect(error.context).toEqual({ partyId: 'alice::123' });
    });

    it('inherits from CantonError', () => {
      const error = new OperationError('Test', OperationErrorCode.INSUFFICIENT_FUNDS);
      expect(error).toBeInstanceOf(CantonError);
    });

    it('supports all operation error codes', () => {
      const codes = [
        OperationErrorCode.MISSING_CONTRACT,
        OperationErrorCode.MISSING_DOMAIN_ID,
        OperationErrorCode.INSUFFICIENT_FUNDS,
        OperationErrorCode.INVALID_AMOUNT,
        OperationErrorCode.INVALID_PARAMETER,
        OperationErrorCode.MINING_ROUND_NOT_FOUND,
        OperationErrorCode.PARTY_CREATION_FAILED,
        OperationErrorCode.TRANSACTION_FAILED,
      ];

      codes.forEach((code) => {
        const error = new OperationError('Test', code);
        expect(error.code).toBe(code);
      });
    });
  });
});

describe('error type checking', () => {
  it('can distinguish between error types using instanceof', () => {
    const errors = [
      new ConfigurationError('config'),
      new AuthenticationError('auth'),
      new ApiError('api', 500),
      new ValidationError('validation'),
      new NetworkError('network'),
      new OperationError('operation', OperationErrorCode.MISSING_CONTRACT),
    ];

    expect(errors.filter((e) => e instanceof ConfigurationError)).toHaveLength(1);
    expect(errors.filter((e) => e instanceof AuthenticationError)).toHaveLength(1);
    expect(errors.filter((e) => e instanceof ApiError)).toHaveLength(1);
    expect(errors.filter((e) => e instanceof ValidationError)).toHaveLength(1);
    expect(errors.filter((e) => e instanceof NetworkError)).toHaveLength(1);
    expect(errors.filter((e) => e instanceof OperationError)).toHaveLength(1);
    expect(errors.filter((e) => e instanceof CantonError)).toHaveLength(6);
  });

  it('can use error.code for type checking', () => {
    const error: CantonError = new ValidationError('Invalid value');
    expect(error.code).toBe('VALIDATION_ERROR');

    const opError: CantonError = new OperationError('Missing', OperationErrorCode.MISSING_CONTRACT);
    expect(opError.code).toBe('MISSING_CONTRACT');
  });
});
