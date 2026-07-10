import axios from 'axios';
import { z } from 'zod';
import { Completions } from '../../../src/clients/ledger-json-api/operations/v2/commands/completions';
import { InteractiveSubmissionGetPreferredPackages } from '../../../src/clients/ledger-json-api/operations/v2/interactive-submission/get-preferred-packages';
import { InteractiveSubmissionPrepare } from '../../../src/clients/ledger-json-api/operations/v2/interactive-submission/prepare';
import { CreateTransferOffer } from '../../../src/clients/validator-api/operations/v0/wallet/transfer-offers/create';
import { GetTransferOfferStatus } from '../../../src/clients/validator-api/operations/v0/wallet/transfer-offers/get-status';
import {
  type BaseClient,
  HttpClient,
  type OperationRetryContext,
  UnknownMutationOutcomeError,
  ValidationError,
  createApiOperation,
} from '../../../src/core';

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

interface RetryOperationParams {
  readonly resourceId: string;
  readonly submissionId: string;
  readonly payload: string;
}

interface RetryOperationResponse {
  readonly accepted: boolean;
}

const RetryOperationParamsSchema = z.object({
  resourceId: z.string(),
  submissionId: z.string(),
  payload: z.string(),
});

function createAxiosError(status: number): Error {
  const error = new Error('Request failed');
  Object.assign(error, {
    isAxiosError: true,
    code: 'ERR_BAD_RESPONSE',
    response: { status, statusText: 'Server Error', data: {} },
  });
  return error;
}

function createOperation(buildCounter: { count: number }): {
  readonly operation: InstanceType<ReturnType<typeof createRetryOperation>>;
  readonly post: jest.Mock;
} {
  const Operation = createRetryOperation(buildCounter);
  const httpClient = new HttpClient(undefined, async (): Promise<string> => 'test-token');
  const { results } = (axios.create as jest.Mock).mock;
  const axiosInstance = results[results.length - 1]?.value as { readonly post: jest.Mock };
  const client = {
    getApiUrl: (): string => 'https://ledger.example',
    makePostRequest: httpClient.makePostRequest.bind(httpClient),
  } as unknown as BaseClient;
  return { operation: new Operation(client), post: axiosInstance.post };
}

function createRetryOperation(buildCounter: {
  count: number;
}): ReturnType<typeof createApiOperation<RetryOperationParams, RetryOperationResponse>> {
  return createApiOperation<RetryOperationParams, RetryOperationResponse>({
    paramsSchema: RetryOperationParamsSchema,
    method: 'POST',
    buildUrl: (params, apiUrl): string => `${apiUrl}/resources/${params.resourceId}/submit`,
    buildRequestData: (params) => {
      buildCounter.count += 1;
      return {
        submission_id: params.submissionId,
        payload: params.payload,
        build_number: buildCounter.count,
      };
    },
  });
}

function createSemanticPostClient(): {
  readonly client: BaseClient;
  readonly post: jest.Mock;
} {
  const httpClient = new HttpClient(undefined, async (): Promise<string> => 'test-token');
  httpClient.setRetryConfig({ maxRetries: 1, delayMs: 0 });
  const { results } = (axios.create as jest.Mock).mock;
  const axiosInstance = results[results.length - 1]?.value as { readonly post: jest.Mock };
  const client = {
    getApiUrl: (): string => 'https://api.example',
    makePostRequest: httpClient.makePostRequest.bind(httpClient),
  } as unknown as BaseClient;
  return { client, post: axiosInstance.post };
}

describe('factory-created operation retry plumbing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds once and replays the exact request body for exact-body retries', async () => {
    const buildCounter = { count: 0 };
    const { operation, post } = createOperation(buildCounter);
    post.mockRejectedValueOnce(createAxiosError(503)).mockResolvedValueOnce({ data: { accepted: true } });

    await expect(
      operation.execute(
        { resourceId: 'resource-1', submissionId: 'prepare-1', payload: 'commands' },
        {
          retry: {
            kind: 'exact-body',
            maxAttempts: 2,
            backoffMs: 0,
            shouldRetry: () => true,
            getAttemptIdentifier: ({ params }) => params.submissionId,
          },
        }
      )
    ).resolves.toEqual({ accepted: true });

    expect(buildCounter.count).toBe(1);
    expect(post.mock.calls.map((call) => call[1])).toEqual([
      { submission_id: 'prepare-1', payload: 'commands', build_number: 1 },
      { submission_id: 'prepare-1', payload: 'commands', build_number: 1 },
    ]);
  });

  it('revalidates derived params and rebuilds fresh submission IDs', async () => {
    const buildCounter = { count: 0 };
    const { operation, post } = createOperation(buildCounter);
    post.mockRejectedValueOnce(createAxiosError(503)).mockResolvedValueOnce({ data: { accepted: true } });

    await expect(
      operation.execute(
        { resourceId: 'resource-1', submissionId: 'submission-1', payload: 'signed-transaction' },
        {
          retry: {
            kind: 'derived-body',
            maxAttempts: 2,
            backoffMs: 0,
            shouldRetry: () => true,
            deriveParams: ({ attempt, params }) => ({
              resourceId: params.resourceId,
              submissionId: `submission-${attempt + 1}`,
              payload: params.payload,
            }),
            getAttemptIdentifier: ({ params }) => params.submissionId,
          },
        }
      )
    ).resolves.toEqual({ accepted: true });

    expect(buildCounter.count).toBe(2);
    expect(post.mock.calls.map((call) => call[1])).toEqual([
      { submission_id: 'submission-1', payload: 'signed-transaction', build_number: 1 },
      { submission_id: 'submission-2', payload: 'signed-transaction', build_number: 2 },
    ]);
  });

  it('rejects derived parameters that would silently change the endpoint', async () => {
    const buildCounter = { count: 0 };
    const { operation, post } = createOperation(buildCounter);
    post.mockRejectedValueOnce(createAxiosError(503));

    await expect(
      operation.execute(
        { resourceId: 'resource-1', submissionId: 'submission-1', payload: 'signed-transaction' },
        {
          retry: {
            kind: 'derived-body',
            maxAttempts: 2,
            backoffMs: 0,
            shouldRetry: () => true,
            deriveParams: ({ params }) => ({
              resourceId: 'resource-2',
              submissionId: 'submission-2',
              payload: params.payload,
            }),
          },
        }
      )
    ).rejects.toMatchObject({
      name: 'UnknownMutationOutcomeError',
      cause: expect.any(ValidationError),
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(buildCounter.count).toBe(1);
  });

  it('reports non-cloneable derived parameters as a configuration error', async () => {
    const buildCounter = { count: 0 };
    const { operation, post } = createOperation(buildCounter);
    const nonCloneableParams = new Map<string, unknown>([
      ['callback', () => undefined],
    ]) as unknown as RetryOperationParams;
    post.mockRejectedValueOnce(createAxiosError(503));

    await expect(
      operation.execute(
        { resourceId: 'resource-1', submissionId: 'submission-1', payload: 'signed-transaction' },
        {
          retry: {
            kind: 'derived-body',
            maxAttempts: 2,
            backoffMs: 0,
            shouldRetry: () => true,
            deriveParams: () => nonCloneableParams,
          },
        }
      )
    ).rejects.toMatchObject({
      name: 'UnknownMutationOutcomeError',
      cause: expect.objectContaining({
        name: 'ConfigurationError',
        message: 'Derived retry parameters must be structured-cloneable',
      }),
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(buildCounter.count).toBe(1);
  });

  it('cancels a hung initial request-body builder before dispatch', async () => {
    const bodyGate = new Promise<Record<string, unknown>>(() => undefined);
    const Operation = createApiOperation<RetryOperationParams, RetryOperationResponse>({
      paramsSchema: RetryOperationParamsSchema,
      method: 'POST',
      buildUrl: (_params, apiUrl): string => `${apiUrl}/submit`,
      buildRequestData: async () => bodyGate,
    });
    const httpClient = new HttpClient(undefined, async (): Promise<string> => 'test-token');
    const { results } = (axios.create as jest.Mock).mock;
    const axiosInstance = results[results.length - 1]?.value as { readonly post: jest.Mock };
    const client = {
      getApiUrl: (): string => 'https://ledger.example',
      makePostRequest: httpClient.makePostRequest.bind(httpClient),
    } as unknown as BaseClient;
    const controller = new AbortController();

    const request = new Operation(client).execute(
      { resourceId: 'resource-1', submissionId: 'submission-1', payload: 'payload' },
      { signal: controller.signal }
    );
    await Promise.resolve();
    controller.abort(new Error('stop building request'));

    await expect(request).rejects.toMatchObject({ name: 'AbortError', message: 'stop building request' });
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });

  it('snapshots signal and retry hook references before an asynchronous initial body build', async () => {
    let markBuildStarted: (() => void) | undefined;
    let releaseBuild: (() => void) | undefined;
    const buildStarted = new Promise<void>((resolve) => {
      markBuildStarted = resolve;
    });
    const buildGate = new Promise<void>((resolve) => {
      releaseBuild = resolve;
    });
    const Operation = createApiOperation<RetryOperationParams, RetryOperationResponse>({
      paramsSchema: RetryOperationParamsSchema,
      method: 'POST',
      buildUrl: (params, apiUrl): string => `${apiUrl}/resources/${params.resourceId}/submit`,
      buildRequestData: async (params) => {
        markBuildStarted?.();
        await buildGate;
        return { submissionId: params.submissionId, payload: params.payload };
      },
    });
    const { client, post } = createSemanticPostClient();
    const initialController = new AbortController();
    const replacementController = new AbortController();
    const originalShouldRetry = jest.fn(async (): Promise<boolean> => true);
    const replacementShouldRetry = jest.fn(async (): Promise<boolean> => false);
    const originalDeriveParams = jest.fn(
      async (context: OperationRetryContext<RetryOperationParams>): Promise<RetryOperationParams> => ({
        ...context.params,
        submissionId: 'submission-2',
      })
    );
    const replacementDeriveParams = jest.fn(
      async (_context: OperationRetryContext<RetryOperationParams>): Promise<RetryOperationParams> => ({
        resourceId: 'replacement-resource',
        submissionId: 'replacement-submission',
        payload: 'replacement-payload',
      })
    );
    const retry = {
      kind: 'derived-body' as const,
      maxAttempts: 2,
      backoffMs: 0,
      shouldRetry: originalShouldRetry,
      deriveParams: originalDeriveParams,
    };
    const options = { signal: initialController.signal, retry };
    post.mockRejectedValueOnce(createAxiosError(503)).mockResolvedValueOnce({ data: { accepted: true } });

    const request = new Operation(client).execute(
      { resourceId: 'resource-1', submissionId: 'submission-1', payload: 'payload' },
      options
    );
    await buildStarted;
    options.signal = replacementController.signal;
    retry.shouldRetry = replacementShouldRetry;
    retry.deriveParams = replacementDeriveParams;
    replacementController.abort(new Error('replacement signal must be ignored'));
    releaseBuild?.();

    await expect(request).resolves.toEqual({ accepted: true });
    expect(originalShouldRetry).toHaveBeenCalledTimes(1);
    expect(originalDeriveParams).toHaveBeenCalledTimes(1);
    expect(replacementShouldRetry).not.toHaveBeenCalled();
    expect(replacementDeriveParams).not.toHaveBeenCalled();
    expect(post.mock.calls.map((call) => call[1])).toEqual([
      { submissionId: 'submission-1', payload: 'payload' },
      { submissionId: 'submission-2', payload: 'payload' },
    ]);
    expect(post.mock.calls[0]?.[2]).toEqual(expect.objectContaining({ signal: initialController.signal }));
  });
});

describe('semantic POST operation coverage matrix', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      clientFamily: 'Ledger',
      execute: async (client: BaseClient): Promise<unknown> =>
        new Completions(client).execute({ userId: 'user', parties: ['party'], beginExclusive: 0 }),
    },
    {
      clientFamily: 'Validator',
      execute: async (client: BaseClient): Promise<unknown> =>
        new GetTransferOfferStatus(client).execute({ trackingId: 'tracking-id' }),
    },
    {
      clientFamily: 'Ledger interactive prepare',
      execute: async (client: BaseClient): Promise<unknown> =>
        new InteractiveSubmissionPrepare(client).execute({
          commands: [],
          commandId: 'command-id',
          userId: 'user',
          actAs: [],
          readAs: [],
          synchronizerId: 'synchronizer',
        }),
    },
    {
      clientFamily: 'Ledger preferred packages',
      execute: async (client: BaseClient): Promise<unknown> =>
        new InteractiveSubmissionGetPreferredPackages(client).execute({
          packageVettingRequirements: [{ parties: ['party'], packageName: 'package-name' }],
          synchronizerId: 'synchronizer',
        }),
    },
  ])('retries a transient $clientFamily read-only POST', async ({ execute }) => {
    const { client, post } = createSemanticPostClient();
    post.mockRejectedValueOnce(createAxiosError(503)).mockResolvedValueOnce({ data: { ok: true } });

    await expect(execute(client)).resolves.toEqual({ ok: true });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('does not retry an unannotated Validator mutation POST', async () => {
    const { client, post } = createSemanticPostClient();
    post.mockRejectedValueOnce(createAxiosError(503)).mockResolvedValueOnce({ data: { ok: true } });

    await expect(
      new CreateTransferOffer(client).execute({
        receiver_party_id: 'receiver',
        amount: '10',
        description: 'test transfer',
        expires_at: 1_800_000_000_000,
        tracking_id: 'tracking-id',
      })
    ).rejects.toBeInstanceOf(UnknownMutationOutcomeError);
    expect(post).toHaveBeenCalledTimes(1);
  });
});
