import axios from 'axios';
import { ApiError, ConfigurationError, NetworkError, UnknownMutationOutcomeError } from '../../../src/core/errors';
import { HttpClient } from '../../../src/core/http/HttpClient';
import { type HttpRequestOptions } from '../../../src/core/http/request-retry';
import { type Logger } from '../../../src/core/logging';

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
    isCancel: actual.isCancel,
  };
});

interface MockAxiosInstance {
  readonly get: jest.Mock;
  readonly post: jest.Mock;
  readonly delete: jest.Mock;
  readonly patch: jest.Mock;
}

function createAxiosError(status?: number, data: Record<string, unknown> = {}): Error {
  const error = new Error('Request failed');
  Object.assign(error, {
    isAxiosError: true,
    code: status === undefined ? 'ECONNRESET' : 'ERR_BAD_RESPONSE',
    ...(status === undefined
      ? {}
      : {
          response: {
            status,
            statusText: status >= 500 ? 'Server Error' : 'Bad Request',
            data,
          },
        }),
  });
  return error;
}

function createClient(
  logger?: Logger,
  bearerTokenProvider?: () => Promise<string>
): { readonly client: HttpClient; readonly axiosInstance: MockAxiosInstance } {
  const client = new HttpClient(logger, bearerTokenProvider);
  const { results } = (axios.create as jest.Mock).mock;
  const axiosInstance = results[results.length - 1]?.value as MockAxiosInstance;
  return { client, axiosInstance };
}

const loggerCases: ReadonlyArray<readonly [string, () => Promise<void>]> = [
  [
    'synchronous throw',
    (): never => {
      throw new Error('logger failed synchronously');
    },
  ],
  ['rejected promise', async (): Promise<void> => Promise.reject(new Error('logger rejected'))],
  ['never-settling promise', async (): Promise<void> => new Promise<void>(() => undefined)],
];

describe('HttpClient mutation retry safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not automatically retry or mutate a mutating request body', async () => {
    const { client, axiosInstance } = createClient();
    const body = {
      commandId: 'command-original',
      nested: { signature: 'secret-signature' },
    };
    axiosInstance.post.mockRejectedValueOnce(createAxiosError(503)).mockResolvedValueOnce({ data: { ok: true } });

    await expect(client.makePostRequest('https://ledger.example/v2/commands', body)).rejects.toBeInstanceOf(
      UnknownMutationOutcomeError
    );

    expect(axiosInstance.post).toHaveBeenCalledTimes(1);
    expect(axiosInstance.post.mock.calls[0]?.[1]).toEqual(body);
    expect(body).toEqual({
      commandId: 'command-original',
      nested: { signature: 'secret-signature' },
    });
  });

  it('rejects an unsupported mutation body before asynchronous pre-dispatch work', async () => {
    const bearerTokenProvider = jest.fn(async (): Promise<string> => 'unused-token');
    const { client, axiosInstance } = createClient(undefined, bearerTokenProvider);

    await expect(
      client.makePostRequest(
        'https://ledger.example/v2/commands',
        new Map<string, string>([['commandId', 'command-1']]),
        { includeBearerToken: true }
      )
    ).rejects.toEqual(
      expect.objectContaining({
        name: ConfigurationError.name,
        message: 'HTTP request bodies must be structured-cloneable',
      })
    );

    expect(bearerTokenProvider).not.toHaveBeenCalled();
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });

  it('snapshots a single-attempt mutation body before asynchronous authentication', async () => {
    let releaseToken: ((token: string) => void) | undefined;
    const token = new Promise<string>((resolve) => {
      releaseToken = resolve;
    });
    const { client, axiosInstance } = createClient(undefined, async (): Promise<string> => token);
    const body = {
      commandId: 'command-original',
      nested: { signature: 'signature-original' },
    };
    axiosInstance.post.mockResolvedValueOnce({ data: { ok: true } });

    const request = client.makePostRequest('https://ledger.example/v2/commands', body, {
      includeBearerToken: true,
    });
    await Promise.resolve();
    body.commandId = 'command-mutated';
    body.nested.signature = 'signature-mutated';
    releaseToken?.('token');

    await expect(request).resolves.toEqual({ ok: true });
    expect(axiosInstance.post.mock.calls[0]?.[1]).toEqual({
      commandId: 'command-original',
      nested: { signature: 'signature-original' },
    });
  });

  it('does not retry an ambiguous mutation by default even with an explicit exact-body strategy', async () => {
    const { client, axiosInstance } = createClient();
    axiosInstance.post.mockRejectedValueOnce(createAxiosError(503)).mockResolvedValueOnce({ data: { ok: true } });

    await expect(
      client.makePostRequest(
        'https://ledger.example/v2/commands',
        { commandId: 'command-1' },
        {},
        { retry: { kind: 'exact-body', maxAttempts: 2, backoffMs: 0 } }
      )
    ).rejects.toBeInstanceOf(UnknownMutationOutcomeError);

    expect(axiosInstance.post).toHaveBeenCalledTimes(1);
  });

  it.each([
    [400, 'UNKNOWN_CONTRACT_SYNCHRONIZERS'],
    [409, 'SEQUENCER_BACKPRESSURE'],
  ] as const)(
    'retries definite transient Canton rejection %i %s when an explicit strategy exists',
    async (status, code) => {
      const { client, axiosInstance } = createClient();
      axiosInstance.post
        .mockRejectedValueOnce(createAxiosError(status, { code }))
        .mockResolvedValueOnce({ data: { ok: true } });
      const previousAttempts: unknown[] = [];

      await expect(
        client.makePostRequest(
          'https://ledger.example/v2/commands',
          { commandId: 'command-1' },
          {},
          {
            retry: {
              kind: 'exact-body',
              maxAttempts: 2,
              backoffMs: 0,
              beforeAttempt: ({ attempt, previousAttempts: previous }) => {
                if (attempt === 2) previousAttempts.push(...previous);
              },
            },
          }
        )
      ).resolves.toEqual({ ok: true });

      expect(axiosInstance.post).toHaveBeenCalledTimes(2);
      expect(previousAttempts).toEqual([
        expect.objectContaining({
          errorClassification: 'definite-rejection',
          outcomeCertainty: 'definite',
          retryable: true,
        }),
      ]);
    }
  );

  it('retries a POST explicitly classified as a semantic read', async () => {
    const { client, axiosInstance } = createClient();
    client.setRetryConfig({ maxRetries: 1, delayMs: 0 });
    axiosInstance.post.mockRejectedValueOnce(createAxiosError(503)).mockResolvedValueOnce({ data: { page: [] } });

    await expect(
      client.makePostRequest(
        'https://scan.example/api/scan/v2/updates',
        { pageSize: 10 },
        {},
        { requestSemantics: 'read' }
      )
    ).resolves.toEqual({ page: [] });
    expect(axiosInstance.post).toHaveBeenCalledTimes(2);
  });

  it('replays the exact immutable prepare body when explicitly authorized', async () => {
    const { client, axiosInstance } = createClient();
    const prepareBody = {
      commandId: 'prepare-command',
      commands: [{ CreateCommand: { templateId: 'pkg:Module:Template' } }],
    };
    axiosInstance.post.mockRejectedValueOnce(createAxiosError(503)).mockResolvedValueOnce({
      data: { preparedTransaction: 'prepared' },
    });

    await expect(
      client.makePostRequest(
        'https://ledger.example/v2/interactive-submission/prepare',
        prepareBody,
        {},
        {
          retry: {
            kind: 'exact-body',
            maxAttempts: 2,
            backoffMs: 0,
            shouldRetry: ({ errorClassification, outcomeCertainty, retryable }) => {
              expect(errorClassification).toBe('ambiguous-mutation-outcome');
              expect(outcomeCertainty).toBe('ambiguous');
              expect(retryable).toBe(true);
              return true;
            },
            getAttemptIdentifier: ({ body }) => body.commandId,
          },
        }
      )
    ).resolves.toEqual({ preparedTransaction: 'prepared' });

    expect(axiosInstance.post).toHaveBeenCalledTimes(2);
    expect(axiosInstance.post.mock.calls[0]?.[1]).toEqual(prepareBody);
    expect(axiosInstance.post.mock.calls[1]?.[1]).toEqual(prepareBody);
    expect(axiosInstance.post.mock.calls[0]?.[1]).not.toBe(prepareBody);
    expect(axiosInstance.post.mock.calls[1]?.[1]).not.toBe(axiosInstance.post.mock.calls[0]?.[1]);
  });

  it('derives a fresh submission ID without changing the caller body', async () => {
    const { client, axiosInstance } = createClient();
    const body = { submissionId: 'submission-1', payload: 'prepared-transaction' };
    axiosInstance.post.mockRejectedValueOnce(createAxiosError(503)).mockResolvedValueOnce({ data: { ok: true } });

    await expect(
      client.makePostRequest(
        'https://ledger.example/v2/interactive-submission/execute',
        body,
        {},
        {
          retry: {
            kind: 'derived-body',
            maxAttempts: 2,
            backoffMs: 0,
            shouldRetry: () => true,
            deriveBody: ({ attempt, body: attemptedBody }) => ({
              ...attemptedBody,
              submissionId: `submission-${attempt + 1}`,
            }),
            getAttemptIdentifier: ({ body: attemptedBody }) => attemptedBody.submissionId,
          },
        }
      )
    ).resolves.toEqual({ ok: true });

    expect(axiosInstance.post.mock.calls.map((call) => call[1])).toEqual([
      { submissionId: 'submission-1', payload: 'prepared-transaction' },
      { submissionId: 'submission-2', payload: 'prepared-transaction' },
    ]);
    expect(body).toEqual({ submissionId: 'submission-1', payload: 'prepared-transaction' });
  });

  it('rejects a malformed derived-body strategy before dispatch', async () => {
    const { client, axiosInstance } = createClient();
    const malformedOptions = {
      retry: { kind: 'derived-body', maxAttempts: 2 },
    } as unknown as HttpRequestOptions<{ submissionId: string }>;

    await expect(
      client.makePostRequest(
        'https://ledger.example/v2/interactive-submission/execute',
        { submissionId: 'submission-1' },
        {},
        malformedOptions
      )
    ).rejects.toEqual(
      expect.objectContaining({
        name: ConfigurationError.name,
        message: 'HTTP derived-body retry requires a deriveBody function',
      })
    );
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });

  it('preserves definite mutation rejections and redacts ambiguous outcomes', async () => {
    const definite = createClient();
    definite.axiosInstance.post.mockRejectedValueOnce(createAxiosError(400, { code: 'INVALID_ARGUMENT' }));

    await expect(
      definite.client.makePostRequest('https://validator.example/api/mutate?token=secret', {
        signature: 'must-not-leak',
      })
    ).rejects.toBeInstanceOf(ApiError);

    const ambiguous = createClient();
    ambiguous.axiosInstance.post.mockRejectedValueOnce(createAxiosError());

    let caught: unknown;
    try {
      await ambiguous.client.makePostRequest(
        'https://validator.example/api/mutate?token=secret',
        { signature: 'must-not-leak' },
        {},
        {
          retry: {
            kind: 'exact-body',
            maxAttempts: 1,
            getAttemptIdentifier: () => 'submission-redacted-1',
          },
        }
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(UnknownMutationOutcomeError);
    const unknownOutcome = caught as UnknownMutationOutcomeError;
    expect(unknownOutcome.endpoint).toBe('https://validator.example/api/mutate');
    expect(unknownOutcome.attemptIdentifiers).toEqual(['submission-redacted-1']);
    expect(JSON.stringify(unknownOutcome)).not.toContain('must-not-leak');
    expect(JSON.stringify(unknownOutcome)).not.toContain('token=secret');
  });

  it.each(loggerCases)('keeps POST success independent from a logger %s', async (_name, logRequestResponse) => {
    const logger: Logger = { logRequestResponse: jest.fn(logRequestResponse) };
    const { client, axiosInstance } = createClient(logger);
    axiosInstance.post.mockResolvedValueOnce({ data: { ok: true } });

    await expect(client.makePostRequest('https://validator.example/api/mutate', { value: 1 })).resolves.toEqual({
      ok: true,
    });
    expect(axiosInstance.post).toHaveBeenCalledTimes(1);
  });

  it('summarizes a binary request body before logging a successful POST', async () => {
    const loggedRequests: unknown[] = [];
    const logger: Logger = {
      logRequestResponse: async (_url, request): Promise<void> => {
        loggedRequests.push(request);
      },
    };
    const { client, axiosInstance } = createClient(logger);
    const darFile = Buffer.from('private-dar-contents');
    axiosInstance.post.mockResolvedValueOnce({ data: { ok: true } });

    await expect(
      client.makePostRequest('https://ledger.example/v2/dars', darFile, {
        contentType: 'application/octet-stream',
      })
    ).resolves.toEqual({ ok: true });

    expect(axiosInstance.post.mock.calls[0]?.[1]).toEqual(darFile);
    expect(loggedRequests).toEqual([
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        data: { type: 'Buffer', byteLength: darFile.byteLength },
      },
    ]);
    expect(JSON.stringify(loggedRequests)).not.toContain('private-dar-contents');
  });

  it.each(loggerCases)(
    'keeps ambiguous POST failure independent from a logger %s',
    async (_name, logRequestResponse) => {
      const logger: Logger = { logRequestResponse: jest.fn(logRequestResponse) };
      const { client, axiosInstance } = createClient(logger);
      axiosInstance.post.mockRejectedValueOnce(createAxiosError());

      await expect(client.makePostRequest('https://validator.example/api/mutate', { value: 1 })).rejects.toBeInstanceOf(
        UnknownMutationOutcomeError
      );
      expect(axiosInstance.post).toHaveBeenCalledTimes(1);
    }
  );

  it('summarizes a binary request body before logging a failed POST', async () => {
    const loggedRequests: unknown[] = [];
    const logger: Logger = {
      logRequestResponse: async (_url, request): Promise<void> => {
        loggedRequests.push(request);
      },
    };
    const { client, axiosInstance } = createClient(logger);
    const darFile = Buffer.from('private-dar-contents');
    axiosInstance.post.mockRejectedValueOnce(createAxiosError(400, { code: 'INVALID_ARGUMENT' }));

    await expect(
      client.makePostRequest('https://ledger.example/v2/dars', darFile, {
        contentType: 'application/octet-stream',
      })
    ).rejects.toBeInstanceOf(ApiError);

    expect(loggedRequests).toEqual([
      {
        method: 'POST',
        data: { type: 'Buffer', byteLength: darFile.byteLength },
      },
    ]);
    expect(JSON.stringify(loggedRequests)).not.toContain('private-dar-contents');
  });

  it('does not let a never-settling logger block an authorized retry', async () => {
    const logger: Logger = {
      logRequestResponse: async (): Promise<void> => new Promise<void>(() => undefined),
    };
    const { client, axiosInstance } = createClient(logger);
    axiosInstance.post
      .mockRejectedValueOnce(createAxiosError(409, { code: 'SEQUENCER_BACKPRESSURE' }))
      .mockResolvedValueOnce({ data: { ok: true } });

    await expect(
      client.makePostRequest(
        'https://validator.example/api/mutate',
        {},
        {},
        { retry: { kind: 'exact-body', maxAttempts: 2, backoffMs: 0 } }
      )
    ).resolves.toEqual({ ok: true });
    expect(axiosInstance.post).toHaveBeenCalledTimes(2);
  });

  it('isolates retry bodies and successful responses from logger mutation', async () => {
    const logger: Logger = {
      logRequestResponse: async (_url, request, response): Promise<void> => {
        if (typeof request === 'object' && request !== null && 'data' in request) {
          const { data } = request;
          if (typeof data === 'object' && data !== null) Reflect.set(data, 'commandId', 'logger-mutated');
        }
        if (typeof response === 'object' && response !== null) Reflect.set(response, 'ok', false);
      },
    };
    const { client, axiosInstance } = createClient(logger);
    const body = { commandId: 'command-original' };
    axiosInstance.post
      .mockRejectedValueOnce(createAxiosError(409, { code: 'SEQUENCER_BACKPRESSURE' }))
      .mockResolvedValueOnce({ data: { ok: true } });

    await expect(
      client.makePostRequest(
        'https://validator.example/api/mutate',
        body,
        {},
        { retry: { kind: 'exact-body', maxAttempts: 2, backoffMs: 0 } }
      )
    ).resolves.toEqual({ ok: true });

    expect(axiosInstance.post.mock.calls.map((call) => call[1])).toEqual([
      { commandId: 'command-original' },
      { commandId: 'command-original' },
    ]);
    expect(body).toEqual({ commandId: 'command-original' });
  });

  it('redacts authorization headers from logger snapshots without changing dispatch headers', async () => {
    const loggedRequests: unknown[] = [];
    const logger: Logger = {
      logRequestResponse: async (_url, request): Promise<void> => {
        loggedRequests.push(request);
      },
    };
    const { client, axiosInstance } = createClient(logger, async (): Promise<string> => 'super-secret-token');
    axiosInstance.post.mockResolvedValueOnce({ data: { ok: true } });

    await expect(
      client.makePostRequest('https://validator.example/api/mutate', {}, { includeBearerToken: true })
    ).resolves.toEqual({ ok: true });

    expect(axiosInstance.post.mock.calls[0]?.[2]?.headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer super-secret-token' })
    );
    expect(loggedRequests).toEqual([
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: '[REDACTED]' }) }),
    ]);
    expect(JSON.stringify(loggedRequests)).not.toContain('super-secret-token');
  });

  it('forwards AbortSignal and rejects a pre-aborted request before dispatch', async () => {
    const forwarded = createClient();
    const activeController = new AbortController();
    forwarded.axiosInstance.post.mockResolvedValueOnce({ data: { ok: true } });

    await forwarded.client.makePostRequest(
      'https://validator.example/api/mutate',
      {},
      {},
      {
        signal: activeController.signal,
      }
    );

    expect(forwarded.axiosInstance.post.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({ signal: activeController.signal })
    );

    const preAborted = createClient();
    const abortedController = new AbortController();
    abortedController.abort();
    await expect(
      preAborted.client.makePostRequest(
        'https://validator.example/api/mutate',
        {},
        {},
        {
          signal: abortedController.signal,
        }
      )
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(preAborted.axiosInstance.post).not.toHaveBeenCalled();
  });

  it('normalizes a custom abort reason to AbortError and retains the reason as a non-enumerable cause', async () => {
    const { client, axiosInstance } = createClient();
    const controller = new AbortController();
    const reason = new Error('caller stopped the request');
    controller.abort(reason);

    let caught: unknown;
    try {
      await client.makePostRequest('https://validator.example/api/mutate', {}, {}, { signal: controller.signal });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({ name: 'AbortError', message: reason.message, cause: reason });
    expect(Object.keys(caught as object)).not.toContain('cause');
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });

  it('cancels hung bearer-token acquisition before dispatch', async () => {
    const tokenGate = new Promise<string>(() => undefined);
    const { client, axiosInstance } = createClient(undefined, async () => tokenGate);
    const controller = new AbortController();

    const request = client.makePostRequest(
      'https://validator.example/api/mutate',
      {},
      { includeBearerToken: true },
      { signal: controller.signal }
    );
    await Promise.resolve();
    controller.abort(new Error('stop waiting for token'));

    await expect(request).rejects.toMatchObject({ name: 'AbortError', message: 'stop waiting for token' });
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });

  it('keeps the entry-time signal when the caller replaces options during token acquisition', async () => {
    let releaseToken: ((token: string) => void) | undefined;
    const tokenGate = new Promise<string>((resolve) => {
      releaseToken = resolve;
    });
    const { client, axiosInstance } = createClient(undefined, async () => tokenGate);
    const initialController = new AbortController();
    const replacementController = new AbortController();
    const options = { signal: initialController.signal };
    axiosInstance.post.mockResolvedValueOnce({ data: { ok: true } });

    const request = client.makePostRequest(
      'https://validator.example/api/mutate',
      {},
      { includeBearerToken: true },
      options
    );
    await Promise.resolve();
    options.signal = replacementController.signal;
    replacementController.abort(new Error('replacement signal must be ignored'));
    releaseToken?.('token');

    await expect(request).resolves.toEqual({ ok: true });
    expect(axiosInstance.post.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({ signal: initialController.signal })
    );
  });

  it('snapshots request headers before asynchronous pre-dispatch work', async () => {
    let releaseAttempt: (() => void) | undefined;
    const attemptGate = new Promise<void>((resolve) => {
      releaseAttempt = resolve;
    });
    let markAttemptStarted: (() => void) | undefined;
    const attemptStarted = new Promise<void>((resolve) => {
      markAttemptStarted = resolve;
    });
    const { client, axiosInstance } = createClient(undefined, async () => 'entry-token');
    const config: {
      includeBearerToken: boolean;
      contentType: 'application/json' | 'application/octet-stream';
    } = {
      includeBearerToken: true,
      contentType: 'application/json',
    };
    axiosInstance.get.mockResolvedValueOnce({ data: { ok: true } });

    const request = client.makeGetRequest('https://validator.example/api/read', config, {
      retry: {
        kind: 'exact-body',
        maxAttempts: 1,
        beforeAttempt: async (): Promise<void> => {
          markAttemptStarted?.();
          await attemptGate;
        },
      },
    });
    await attemptStarted;
    config.includeBearerToken = false;
    config.contentType = 'application/octet-stream';
    releaseAttempt?.();

    await expect(request).resolves.toEqual({ ok: true });
    expect(axiosInstance.get.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: 'Bearer entry-token',
      'Content-Type': 'application/json',
    });
  });

  it('treats a canceled Axios mutation after dispatch as an unknown outcome', async () => {
    const { client, axiosInstance } = createClient();
    axiosInstance.post.mockRejectedValueOnce(new axios.CanceledError('request canceled'));

    await expect(client.makePostRequest('https://validator.example/api/mutate', {})).rejects.toMatchObject({
      name: 'UnknownMutationOutcomeError',
      cause: { name: 'AbortError' },
    });
    expect(axiosInstance.post).toHaveBeenCalledTimes(1);
  });

  it('surfaces a canceled read request as an AbortError', async () => {
    const { client, axiosInstance } = createClient();
    axiosInstance.get.mockRejectedValueOnce(new axios.CanceledError('request canceled'));

    await expect(client.makeGetRequest('https://validator.example/api/read')).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('awaits beforeAttempt before dispatching the request', async () => {
    const { client, axiosInstance } = createClient();
    axiosInstance.post.mockResolvedValueOnce({ data: { ok: true } });
    let releaseHook: (() => void) | undefined;
    const hookGate = new Promise<void>((resolve) => {
      releaseHook = resolve;
    });

    const request = client.makePostRequest(
      'https://validator.example/api/mutate',
      {},
      {},
      {
        retry: {
          kind: 'exact-body',
          maxAttempts: 1,
          beforeAttempt: async () => hookGate,
        },
      }
    );
    await Promise.resolve();
    expect(axiosInstance.post).not.toHaveBeenCalled();

    releaseHook?.();
    await expect(request).resolves.toEqual({ ok: true });
    expect(axiosInstance.post).toHaveBeenCalledTimes(1);
  });

  it('cancels a hung pre-dispatch retry hook', async () => {
    const { client, axiosInstance } = createClient();
    const controller = new AbortController();
    const hookGate = new Promise<void>(() => undefined);

    const request = client.makePostRequest(
      'https://validator.example/api/mutate',
      {},
      {},
      {
        signal: controller.signal,
        retry: { kind: 'exact-body', maxAttempts: 1, beforeAttempt: async () => hookGate },
      }
    );
    await Promise.resolve();
    controller.abort(new Error('stop waiting for hook'));

    await expect(request).rejects.toMatchObject({ name: 'AbortError', message: 'stop waiting for hook' });
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });

  it('preserves an ambiguous attempt when body derivation fails', async () => {
    const { client, axiosInstance } = createClient();
    axiosInstance.post.mockRejectedValueOnce(createAxiosError(503));

    await expect(
      client.makePostRequest(
        'https://validator.example/api/mutate',
        { submissionId: 'submission-1' },
        {},
        {
          retry: {
            kind: 'derived-body',
            maxAttempts: 2,
            backoffMs: 0,
            shouldRetry: () => true,
            getAttemptIdentifier: ({ body }) => body.submissionId,
            deriveBody: async () => {
              throw new Error('derivation failed');
            },
          },
        }
      )
    ).rejects.toMatchObject({
      name: 'UnknownMutationOutcomeError',
      attemptIdentifiers: ['submission-1'],
      cause: { message: 'derivation failed' },
    });
    expect(axiosInstance.post).toHaveBeenCalledTimes(1);
  });

  it('cancels hung body derivation while preserving the prior ambiguous attempt', async () => {
    const { client, axiosInstance } = createClient();
    const controller = new AbortController();
    axiosInstance.post.mockRejectedValueOnce(createAxiosError());

    await expect(
      client.makePostRequest(
        'https://validator.example/api/mutate',
        { submissionId: 'submission-1' },
        {},
        {
          signal: controller.signal,
          retry: {
            kind: 'derived-body',
            maxAttempts: 2,
            backoffMs: 0,
            shouldRetry: () => true,
            deriveBody: async () => {
              controller.abort(new Error('stop derivation'));
              return new Promise<{ submissionId: string }>(() => undefined);
            },
          },
        }
      )
    ).rejects.toMatchObject({
      name: 'UnknownMutationOutcomeError',
      cause: { name: 'AbortError', message: 'stop derivation' },
    });
    expect(axiosInstance.post).toHaveBeenCalledTimes(1);
  });

  it('preserves an ambiguous attempt when a later pre-dispatch hook fails', async () => {
    const { client, axiosInstance } = createClient();
    axiosInstance.post.mockRejectedValueOnce(createAxiosError());

    await expect(
      client.makePostRequest(
        'https://validator.example/api/mutate',
        { submissionId: 'submission-1' },
        {},
        {
          retry: {
            kind: 'exact-body',
            maxAttempts: 2,
            backoffMs: 0,
            shouldRetry: () => true,
            beforeAttempt: ({ attempt }) => {
              if (attempt === 2) throw new Error('hook failed');
            },
          },
        }
      )
    ).rejects.toMatchObject({ name: 'UnknownMutationOutcomeError', cause: { message: 'hook failed' } });
    expect(axiosInstance.post).toHaveBeenCalledTimes(1);
  });

  it('preserves an ambiguous attempt when backoff calculation fails', async () => {
    const { client, axiosInstance } = createClient();
    axiosInstance.post.mockRejectedValueOnce(createAxiosError());

    await expect(
      client.makePostRequest(
        'https://validator.example/api/mutate',
        {},
        {},
        {
          retry: {
            kind: 'exact-body',
            maxAttempts: 2,
            shouldRetry: () => true,
            backoffMs: () => {
              throw new Error('backoff failed');
            },
          },
        }
      )
    ).rejects.toMatchObject({ name: 'UnknownMutationOutcomeError', cause: { message: 'backoff failed' } });
    expect(axiosInstance.post).toHaveBeenCalledTimes(1);
  });

  it('surfaces a first-attempt pre-dispatch hook failure directly', async () => {
    const { client, axiosInstance } = createClient();
    const hookError = new Error('hook failed before dispatch');

    await expect(
      client.makePostRequest(
        'https://validator.example/api/mutate',
        {},
        {},
        {
          retry: {
            kind: 'exact-body',
            maxAttempts: 2,
            beforeAttempt: () => {
              throw hookError;
            },
          },
        }
      )
    ).rejects.toBe(hookError);
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });

  it('preserves an ambiguous mutation outcome when the signal aborts during retry backoff', async () => {
    const { client, axiosInstance } = createClient();
    const controller = new AbortController();
    let markBackoffStarted: (() => void) | undefined;
    const backoffStarted = new Promise<void>((resolve) => {
      markBackoffStarted = resolve;
    });
    axiosInstance.post.mockRejectedValueOnce(createAxiosError()).mockResolvedValueOnce({ data: { ok: true } });

    const request = client.makePostRequest(
      'https://validator.example/api/mutate',
      {},
      {},
      {
        signal: controller.signal,
        retry: {
          kind: 'exact-body',
          maxAttempts: 2,
          backoffMs: () => {
            markBackoffStarted?.();
            return 60_000;
          },
          shouldRetry: () => true,
        },
      }
    );
    await backoffStarted;
    controller.abort();

    await expect(request).rejects.toMatchObject({
      name: 'UnknownMutationOutcomeError',
      cause: { name: 'AbortError' },
    });
    expect(axiosInstance.post).toHaveBeenCalledTimes(1);
  });

  it('surfaces AbortError when a definite mutation rejection is canceled during retry backoff', async () => {
    const { client, axiosInstance } = createClient();
    const controller = new AbortController();
    let markBackoffStarted: (() => void) | undefined;
    const backoffStarted = new Promise<void>((resolve) => {
      markBackoffStarted = resolve;
    });
    axiosInstance.post.mockRejectedValueOnce(createAxiosError(409, { code: 'SEQUENCER_BACKPRESSURE' }));

    const request = client.makePostRequest(
      'https://validator.example/api/mutate',
      {},
      {},
      {
        signal: controller.signal,
        retry: {
          kind: 'exact-body',
          maxAttempts: 2,
          backoffMs: () => {
            markBackoffStarted?.();
            return 60_000;
          },
        },
      }
    );
    await backoffStarted;
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(axiosInstance.post).toHaveBeenCalledTimes(1);
  });

  it('surfaces AbortError when a read is canceled during retry backoff', async () => {
    const { client, axiosInstance } = createClient();
    const controller = new AbortController();
    let markBackoffStarted: (() => void) | undefined;
    const backoffStarted = new Promise<void>((resolve) => {
      markBackoffStarted = resolve;
    });
    axiosInstance.get.mockRejectedValueOnce(createAxiosError(503));

    const request = client.makeGetRequest(
      'https://validator.example/api/read',
      {},
      {
        signal: controller.signal,
        retry: {
          kind: 'exact-body',
          maxAttempts: 2,
          backoffMs: () => {
            markBackoffStarted?.();
            return 60_000;
          },
        },
      }
    );
    await backoffStarted;
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(axiosInstance.get).toHaveBeenCalledTimes(1);
  });

  it('surfaces AbortError when a pre-dispatch failure is canceled during retry backoff', async () => {
    let tokenAttempts = 0;
    const { client, axiosInstance } = createClient(undefined, async (): Promise<string> => {
      tokenAttempts += 1;
      if (tokenAttempts === 1) throw new NetworkError('token unavailable');
      return 'token';
    });
    const controller = new AbortController();
    let markBackoffStarted: (() => void) | undefined;
    const backoffStarted = new Promise<void>((resolve) => {
      markBackoffStarted = resolve;
    });

    const request = client.makePostRequest(
      'https://validator.example/api/mutate',
      {},
      { includeBearerToken: true },
      {
        signal: controller.signal,
        retry: {
          kind: 'exact-body',
          maxAttempts: 2,
          backoffMs: () => {
            markBackoffStarted?.();
            return 60_000;
          },
        },
      }
    );
    await backoffStarted;
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });
});
