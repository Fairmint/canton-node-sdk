import { ApiError, NetworkError } from '../../../src/core/errors';

describe('HttpClient error types', () => {
  describe('ApiError', () => {
    it('creates ApiError with status code', () => {
      const error = new ApiError('HTTP 400', 400, 'Bad Request');
      expect(error.message).toBe('HTTP 400');
      expect(error.status).toBe(400);
      expect(error.statusText).toBe('Bad Request');
      expect(error.code).toBe('API_ERROR');
      expect(error.name).toBe('ApiError');
    });

    it('allows setting response data', () => {
      const error = new ApiError('HTTP 500', 500);
      error.response = { code: 'INTERNAL_ERROR', details: 'Something went wrong' };

      expect(error.response).toEqual({
        code: 'INTERNAL_ERROR',
        details: 'Something went wrong',
      });
    });

    it('inherits from CantonError', () => {
      const error = new ApiError('Test error', 404);
      expect(error).toBeInstanceOf(Error);
    });

    it('handles missing status gracefully', () => {
      const error = new ApiError('Request failed');
      expect(error.status).toBeUndefined();
      expect(error.statusText).toBeUndefined();
    });
  });

  describe('NetworkError', () => {
    it('creates NetworkError with message', () => {
      const error = new NetworkError('Connection refused');
      expect(error.message).toBe('Connection refused');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.name).toBe('NetworkError');
    });

    it('inherits from CantonError', () => {
      const error = new NetworkError('Test error');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('error identification', () => {
    it('can distinguish between ApiError and NetworkError', () => {
      const apiError = new ApiError('HTTP 500', 500);
      const networkError = new NetworkError('Connection failed');

      expect(apiError).toBeInstanceOf(ApiError);
      expect(networkError).toBeInstanceOf(NetworkError);
      expect(apiError).not.toBeInstanceOf(NetworkError);
      expect(networkError).not.toBeInstanceOf(ApiError);
    });
  });
});

describe('error codes', () => {
  it('ApiError has API_ERROR code', () => {
    const error = new ApiError('test', 500);
    expect(error.code).toBe('API_ERROR');
  });

  it('NetworkError has NETWORK_ERROR code', () => {
    const error = new NetworkError('test');
    expect(error.code).toBe('NETWORK_ERROR');
  });
});
