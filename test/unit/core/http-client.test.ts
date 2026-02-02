import axios from 'axios';
import { ApiError, NetworkError } from '../../../src/core/errors';
import { HttpClient } from '../../../src/core/http/HttpClient';

// Mock axios for testing error handling
jest.mock('axios', () => {
  const actual = jest.requireActual('axios');
  return {
    ...actual,
    create: jest.fn(() => ({
      get: jest.fn(),
      post: jest.fn(),
      delete: jest.fn(),
      patch: jest.fn(),
      defaults: { headers: { common: {} } },
    })),
    isAxiosError: actual.isAxiosError,
  };
});

// Helper to create a properly structured Axios error
function createAxiosError(
  status: number,
  data: Record<string, unknown>,
  statusText = 'Error'
): Error & { isAxiosError: boolean; response: { status: number; statusText: string; data: unknown } } {
  const error = new Error('Request failed') as Error & {
    isAxiosError: boolean;
    response: { status: number; statusText: string; data: unknown };
  };
  error.isAxiosError = true;
  error.response = { status, statusText, data };
  // Make axios.isAxiosError return true for this error
  Object.defineProperty(error, 'isAxiosError', { value: true });
  return error;
}

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

describe('HttpClient error diagnostics', () => {
  let httpClient: HttpClient;
  let mockAxiosInstance: { get: jest.Mock; post: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    httpClient = new HttpClient();
    httpClient.setRetryConfig({ maxRetries: 0, delayMs: 0 }); // Disable retries for tests
    mockAxiosInstance = (axios.create as jest.Mock).mock.results[0]?.value;
  });

  describe('cause extraction', () => {
    it('includes cause in error message when present', async () => {
      const axiosError = createAxiosError(400, {
        code: 'DAML_FAILURE',
        message: 'Contract not found',
        cause: 'The referenced contract does not exist in the active contract set',
      });
      mockAxiosInstance.get.mockRejectedValueOnce(axiosError);

      await expect(httpClient.makeGetRequest('http://test.com/api')).rejects.toThrow(
        /HTTP 400: DAML_FAILURE - Contract not found \(cause: The referenced contract does not exist/
      );
    });

    it('truncates long cause messages at 200 characters', async () => {
      const longCause = 'a'.repeat(250);
      const axiosError = createAxiosError(400, {
        code: 'DAML_FAILURE',
        message: 'Error',
        cause: longCause,
      });
      mockAxiosInstance.get.mockRejectedValueOnce(axiosError);

      try {
        await httpClient.makeGetRequest('http://test.com/api');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        // Should contain truncated cause with ellipsis
        expect(apiError.message).toContain(`(cause: ${'a'.repeat(200)}...)`);
        // Should not contain the full 250 characters
        expect(apiError.message).not.toContain('a'.repeat(250));
      }
    });

    it('ignores non-string cause values', async () => {
      const axiosError = createAxiosError(400, {
        code: 'DAML_FAILURE',
        message: 'Error',
        cause: { nested: 'object' },
      });
      mockAxiosInstance.get.mockRejectedValueOnce(axiosError);

      try {
        await httpClient.makeGetRequest('http://test.com/api');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.message).not.toContain('cause:');
      }
    });
  });

  describe('context extraction', () => {
    it('includes context summary in error message', async () => {
      const axiosError = createAxiosError(400, {
        code: 'DAML_FAILURE',
        message: 'Error',
        context: {
          contractId: 'abc123',
          templateId: 'Module:Template',
        },
      });
      mockAxiosInstance.get.mockRejectedValueOnce(axiosError);

      await expect(httpClient.makeGetRequest('http://test.com/api')).rejects.toThrow(
        /\[context: contractId=abc123, templateId=Module:Template\]/
      );
    });

    it('limits context to first 3 keys', async () => {
      const axiosError = createAxiosError(400, {
        code: 'DAML_FAILURE',
        message: 'Error',
        context: {
          key1: 'value1',
          key2: 'value2',
          key3: 'value3',
          key4: 'value4',
          key5: 'value5',
        },
      });
      mockAxiosInstance.get.mockRejectedValueOnce(axiosError);

      try {
        await httpClient.makeGetRequest('http://test.com/api');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.message).toContain('key1=value1');
        expect(apiError.message).toContain('key2=value2');
        expect(apiError.message).toContain('key3=value3');
        expect(apiError.message).not.toContain('key4');
        expect(apiError.message).not.toContain('key5');
      }
    });

    it('truncates long context values at 50 characters', async () => {
      const longValue = 'x'.repeat(100);
      const axiosError = createAxiosError(400, {
        code: 'DAML_FAILURE',
        message: 'Error',
        context: { longKey: longValue },
      });
      mockAxiosInstance.get.mockRejectedValueOnce(axiosError);

      try {
        await httpClient.makeGetRequest('http://test.com/api');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.message).toContain(`longKey=${'x'.repeat(50)}`);
        expect(apiError.message).not.toContain('x'.repeat(100));
      }
    });

    it('ignores arrays as context', async () => {
      const axiosError = createAxiosError(400, {
        code: 'DAML_FAILURE',
        message: 'Error',
        context: ['item1', 'item2'],
      });
      mockAxiosInstance.get.mockRejectedValueOnce(axiosError);

      try {
        await httpClient.makeGetRequest('http://test.com/api');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.message).not.toContain('[context:');
      }
    });

    it('handles null context values', async () => {
      const axiosError = createAxiosError(400, {
        code: 'DAML_FAILURE',
        message: 'Error',
        context: { nullValue: null },
      });
      mockAxiosInstance.get.mockRejectedValueOnce(axiosError);

      try {
        await httpClient.makeGetRequest('http://test.com/api');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.message).toContain('nullValue=null');
      }
    });

    it('handles undefined context values', async () => {
      const axiosError = createAxiosError(400, {
        code: 'DAML_FAILURE',
        message: 'Error',
        context: { undefinedValue: undefined },
      });
      mockAxiosInstance.get.mockRejectedValueOnce(axiosError);

      try {
        await httpClient.makeGetRequest('http://test.com/api');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.message).toContain('undefinedValue=undefined');
      }
    });

    it('serializes object context values as JSON', async () => {
      const axiosError = createAxiosError(400, {
        code: 'DAML_FAILURE',
        message: 'Error',
        context: { nested: { foo: 'bar' } },
      });
      mockAxiosInstance.get.mockRejectedValueOnce(axiosError);

      try {
        await httpClient.makeGetRequest('http://test.com/api');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.message).toContain('nested={"foo":"bar"}');
      }
    });

    it('handles non-serializable context values gracefully', async () => {
      // Create a circular reference
      const circular: Record<string, unknown> = {};
      circular['self'] = circular;

      const axiosError = createAxiosError(400, {
        code: 'DAML_FAILURE',
        message: 'Error',
        context: { circular },
      });
      mockAxiosInstance.get.mockRejectedValueOnce(axiosError);

      try {
        await httpClient.makeGetRequest('http://test.com/api');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        // Should use fallback [Object] representation
        expect(apiError.message).toContain('circular=[Object]');
      }
    });

    it('handles empty context object', async () => {
      const axiosError = createAxiosError(400, {
        code: 'DAML_FAILURE',
        message: 'Error',
        context: {},
      });
      mockAxiosInstance.get.mockRejectedValueOnce(axiosError);

      try {
        await httpClient.makeGetRequest('http://test.com/api');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.message).not.toContain('[context:');
      }
    });
  });

  describe('combined cause and context', () => {
    it('includes both cause and context when present', async () => {
      const axiosError = createAxiosError(400, {
        code: 'DAML_FAILURE',
        message: 'Contract not found',
        cause: 'The contract was archived',
        context: { contractId: 'xyz789' },
      });
      mockAxiosInstance.get.mockRejectedValueOnce(axiosError);

      await expect(httpClient.makeGetRequest('http://test.com/api')).rejects.toThrow(
        /HTTP 400: DAML_FAILURE - Contract not found \(cause: The contract was archived\) \[context: contractId=xyz789\]/
      );
    });
  });
});
