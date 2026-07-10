import {
  ApiError,
  AuthenticationError,
  CantonError,
  ConfigurationError,
  NetworkError,
  OperationError,
  OperationErrorCode,
  ValidationError,
  isDefiniteCantonMutationRejection,
  normalizeCantonError,
  readCantonDefiniteAnswer,
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

    it('accepts response in constructor', () => {
      const error = new ApiError('HTTP 400', 400, 'Bad Request', { code: 'BAD_REQUEST' });
      expect(error.response).toEqual({ code: 'BAD_REQUEST' });
    });

    it('has undefined response when not provided', () => {
      const error = new ApiError('HTTP 400', 400);
      expect(error.response).toBeUndefined();
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
      const error = new OperationError('No contract found', OperationErrorCode.MISSING_CONTRACT, {
        partyId: 'alice::123',
      });
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

describe('normalizeCantonError', () => {
  it('normalizes ApiError details for consumers', () => {
    const error = new ApiError('HTTP 409: ALREADY_EXISTS', 409, 'Conflict', {
      code: 'ALREADY_EXISTS',
      message: 'Party already exists',
    });

    expect(normalizeCantonError(error)).toEqual({
      name: 'ApiError',
      message: 'HTTP 409: ALREADY_EXISTS',
      status: 409,
      statusText: 'Conflict',
      code: 'ALREADY_EXISTS',
      context: {
        code: 'ALREADY_EXISTS',
        message: 'Party already exists',
      },
      response: {
        code: 'ALREADY_EXISTS',
        message: 'Party already exists',
      },
    });
  });

  it('normalizes operation errors without HTTP status', () => {
    const error = new OperationError('Canton transfer failed', OperationErrorCode.TRANSACTION_FAILED, {
      senderPartyId: 'sender::fingerprint',
    });

    expect(normalizeCantonError(error)).toEqual({
      name: 'OperationError',
      message: 'Canton transfer failed',
      code: OperationErrorCode.TRANSACTION_FAILED,
      context: {
        senderPartyId: 'sender::fingerprint',
      },
      response: {
        senderPartyId: 'sender::fingerprint',
      },
    });
  });

  it('normalizes SDK-shaped legacy errors with statusCode and response', () => {
    const error = Object.assign(new Error('HTTP 429'), {
      name: 'ApiError',
      statusCode: 429,
      statusText: 'Too Many Requests',
      response: { code: 'RESOURCE_EXHAUSTED' },
    });

    expect(normalizeCantonError(error)).toEqual({
      name: 'ApiError',
      message: 'HTTP 429',
      status: 429,
      statusText: 'Too Many Requests',
      code: 'RESOURCE_EXHAUSTED',
      context: { code: 'RESOURCE_EXHAUSTED' },
      response: { code: 'RESOURCE_EXHAUSTED' },
    });
  });

  it('falls back to legacy response when context is undefined', () => {
    const error = Object.assign(new Error('HTTP 400'), {
      name: 'ApiError',
      status: 400,
      context: undefined,
      response: { code: 'UNKNOWN_CONTRACT_SYNCHRONIZERS' },
    });

    expect(normalizeCantonError(error)).toEqual({
      name: 'ApiError',
      message: 'HTTP 400',
      status: 400,
      code: 'UNKNOWN_CONTRACT_SYNCHRONIZERS',
      context: { code: 'UNKNOWN_CONTRACT_SYNCHRONIZERS' },
      response: { code: 'UNKNOWN_CONTRACT_SYNCHRONIZERS' },
    });
    expect(isDefiniteCantonMutationRejection(error)).toBe(false);
  });

  it('ignores plain errors without SDK markers', () => {
    expect(normalizeCantonError(new Error('plain failure'))).toBeNull();
  });
});

describe('isDefiniteCantonMutationRejection', () => {
  it('treats non-transient 4xx API responses as definite rejections', () => {
    expect(isDefiniteCantonMutationRejection(new ApiError('bad request', 400))).toBe(true);
    expect(isDefiniteCantonMutationRejection(new ApiError('conflict', 409))).toBe(true);
    expect(isDefiniteCantonMutationRejection(new ApiError('not found', 404))).toBe(true);
    expect(
      isDefiniteCantonMutationRejection(
        new ApiError('invalid argument', 400, 'Bad Request', { code: 'INVALID_ARGUMENT' })
      )
    ).toBe(true);
    expect(
      isDefiniteCantonMutationRejection(new ApiError('conflict', 409, 'Conflict', { code: 'ALREADY_EXISTS' }))
    ).toBe(true);
  });

  it('does not treat retryable or non-HTTP errors as definite rejections', () => {
    expect(
      isDefiniteCantonMutationRejection(
        new ApiError('unknown contract synchronizers', 400, 'Bad Request', { code: 'UNKNOWN_CONTRACT_SYNCHRONIZERS' })
      )
    ).toBe(false);
    expect(
      isDefiniteCantonMutationRejection(
        new ApiError('sequencer backpressure', 409, 'Conflict', { code: 'SEQUENCER_BACKPRESSURE' })
      )
    ).toBe(false);
    expect(isDefiniteCantonMutationRejection(new ApiError('timeout', 408))).toBe(false);
    expect(isDefiniteCantonMutationRejection(new ApiError('too early', 425))).toBe(false);
    expect(isDefiniteCantonMutationRejection(new ApiError('rate limited', 429))).toBe(false);
    expect(isDefiniteCantonMutationRejection(new ApiError('server error', 503))).toBe(false);
    expect(isDefiniteCantonMutationRejection(new NetworkError('network unavailable'))).toBe(false);
    expect(isDefiniteCantonMutationRejection(new OperationError('failed', OperationErrorCode.TRANSACTION_FAILED))).toBe(
      false
    );
  });
});

describe('readCantonDefiniteAnswer', () => {
  it('reads certainty from raw Canton errors and normalized API response bodies', () => {
    expect(readCantonDefiniteAnswer({ definiteAnswer: true })).toBe(true);
    expect(readCantonDefiniteAnswer({ definite_answer: false })).toBe(false);
    expect(
      readCantonDefiniteAnswer(new ApiError('uncertain rejection', 400, 'Bad Request', { definiteAnswer: false }))
    ).toBe(false);
  });

  it('ignores absent and non-boolean certainty fields', () => {
    expect(readCantonDefiniteAnswer({ definiteAnswer: 'true' })).toBeUndefined();
    expect(readCantonDefiniteAnswer(new ApiError('no certainty', 503))).toBeUndefined();
  });
});
