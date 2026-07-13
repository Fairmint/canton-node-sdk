import axios from 'axios';
import { z } from 'zod';
import { Completions } from '../../../src/clients/ledger-json-api/operations/v2/commands/completions';
import { InteractiveSubmissionExecute } from '../../../src/clients/ledger-json-api/operations/v2/interactive-submission/execute';
import { InteractiveSubmissionExecuteAndWait } from '../../../src/clients/ledger-json-api/operations/v2/interactive-submission/execute-and-wait';
import { InteractiveSubmissionExecuteAndWaitForTransaction } from '../../../src/clients/ledger-json-api/operations/v2/interactive-submission/execute-and-wait-for-transaction';
import { InteractiveSubmissionGetPreferredPackages } from '../../../src/clients/ledger-json-api/operations/v2/interactive-submission/get-preferred-packages';
import { InteractiveSubmissionPrepare } from '../../../src/clients/ledger-json-api/operations/v2/interactive-submission/prepare';
import type { InteractiveSubmissionExecuteRequest } from '../../../src/clients/ledger-json-api/schemas/api/interactive-submission';
import { CreateTransferOffer } from '../../../src/clients/validator-api/operations/v0/wallet/transfer-offers/create';
import { GetTransferOfferStatus } from '../../../src/clients/validator-api/operations/v0/wallet/transfer-offers/get-status';
import {
  type ApiOperationConfig,
  type BaseClient,
  ConfigurationError,
  HttpClient,
  type OperationExecuteOptions,
  type OperationRetryContext,
  UnknownMutationOutcomeError,
  ValidationError,
  createApiOperation,
} from '../../../src/core';

const PREPARED_TRANSACTION_BASE64 = Buffer.from('prepared-transaction').toString('base64');
const PREPARED_HASH_BASE64 = Buffer.from(`1220${'11'.repeat(32)}`, 'hex').toString('base64');
const SIGNATURE_BASE64 = Buffer.alloc(64, 1).toString('base64');

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

function createInteractiveExecuteRequest(submissionId = 'submission-1'): InteractiveSubmissionExecuteRequest {
  return {
    preparedTransaction: PREPARED_TRANSACTION_BASE64,
    partySignatures: {
      signatures: [
        {
          party: 'party::fingerprint',
          signatures: [
            {
              format: 'SIGNATURE_FORMAT_RAW',
              signature: SIGNATURE_BASE64,
              signedBy: 'fingerprint',
              signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_ED25519',
            },
          ],
        },
      ],
    },
    submissionId,
    hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V3',
  };
}

type InteractiveMutationOptions = OperationExecuteOptions<InteractiveSubmissionExecuteRequest>;

const interactiveMutationCases: ReadonlyArray<{
  readonly name: string;
  readonly response: unknown;
  readonly execute: (
    client: BaseClient,
    params: InteractiveSubmissionExecuteRequest,
    options: InteractiveMutationOptions
  ) => Promise<unknown>;
}> = [
  {
    name: 'execute',
    response: {},
    execute: async (client, params, options) => {
      const result = await new InteractiveSubmissionExecute(client).execute(
        params,
        options as Parameters<InstanceType<typeof InteractiveSubmissionExecute>['execute']>[1]
      );
      return result;
    },
  },
  {
    name: 'executeAndWait',
    response: { updateId: 'update-1', completionOffset: 1 },
    execute: async (client, params, options) => {
      const result = await new InteractiveSubmissionExecuteAndWait(client).execute(
        params,
        options as Parameters<InstanceType<typeof InteractiveSubmissionExecuteAndWait>['execute']>[1]
      );
      return result;
    },
  },
  {
    name: 'executeAndWaitForTransaction',
    response: {
      transaction: {
        updateId: 'update-1',
        effectiveAt: '2026-07-09T12:00:00Z',
        events: [],
        offset: 1,
        synchronizerId: 'synchronizer::id',
        recordTime: '2026-07-09T12:00:01Z',
      },
    },
    execute: async (client, params, options) => {
      const result = await new InteractiveSubmissionExecuteAndWaitForTransaction(client).execute(
        params,
        options as Parameters<InstanceType<typeof InteractiveSubmissionExecuteAndWaitForTransaction>['execute']>[1]
      );
      return result;
    },
  },
];

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

  it('resolves a response schema from the parameters used by the successful retry attempt', async () => {
    const Operation = createApiOperation<RetryOperationParams, { readonly submissionId: string }>({
      paramsSchema: RetryOperationParamsSchema,
      method: 'POST',
      requestSemantics: 'read',
      buildUrl: (params, apiUrl): string => `${apiUrl}/resources/${params.resourceId}`,
      buildRequestData: (params) => ({ submissionId: params.submissionId, payload: params.payload }),
      responseSchema: (params) => z.strictObject({ submissionId: z.literal(params.submissionId) }),
    });
    const { client, post } = createSemanticPostClient();
    post.mockRejectedValueOnce(createAxiosError(503)).mockResolvedValueOnce({ data: { submissionId: 'submission-2' } });

    await expect(
      new Operation(client).execute(
        { resourceId: 'resource-1', submissionId: 'submission-1', payload: 'query' },
        {
          retry: {
            kind: 'derived-body',
            maxAttempts: 2,
            backoffMs: 0,
            shouldRetry: () => true,
            deriveParams: ({ params }) => ({
              resourceId: params.resourceId,
              submissionId: 'submission-2',
              payload: params.payload,
            }),
          },
        }
      )
    ).resolves.toEqual({ submissionId: 'submission-2' });
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

describe('factory-created operation runtime semantics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(['DELETE', 'PATCH'] as const)(
    'rejects an untyped-JavaScript read semantic on mutation-only %s before dispatch',
    async (method) => {
      const makeDeleteRequest = jest.fn();
      const makePatchRequest = jest.fn();
      const buildRequestData = jest.fn(() => ({ value: 'request-body' }));
      const client = {
        getApiUrl: (): string => 'https://api.example',
        makeDeleteRequest,
        makePatchRequest,
      } as unknown as BaseClient;
      const unsafeConfig = {
        paramsSchema: z.void(),
        method,
        requestSemantics: 'read',
        buildUrl: (_params: void, apiUrl: string): string => `${apiUrl}/mutation`,
        buildRequestData,
      } as unknown as ApiOperationConfig<void, unknown>;
      const UnsafeOperation = createApiOperation<void, unknown>(unsafeConfig);

      const execution = new UnsafeOperation(client).execute();

      await expect(execution).rejects.toBeInstanceOf(ConfigurationError);
      await expect(execution).rejects.toThrow(`Factory-created ${method} operations must use mutation semantics`);
      expect(buildRequestData).not.toHaveBeenCalled();
      expect(makeDeleteRequest).not.toHaveBeenCalled();
      expect(makePatchRequest).not.toHaveBeenCalled();
    }
  );
});

describe('semantic POST operation coverage matrix', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      clientFamily: 'Ledger',
      response: { ok: true },
      execute: async (client: BaseClient): Promise<unknown> =>
        new Completions(client).execute({ userId: 'user', parties: ['party'], beginExclusive: 0 }),
    },
    {
      clientFamily: 'Validator',
      response: { ok: true },
      execute: async (client: BaseClient): Promise<unknown> =>
        new GetTransferOfferStatus(client).execute({ trackingId: 'tracking-id' }),
    },
    {
      clientFamily: 'Ledger interactive prepare',
      response: {
        preparedTransaction: PREPARED_TRANSACTION_BASE64,
        preparedTransactionHash: PREPARED_HASH_BASE64,
        hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
      },
      execute: async (client: BaseClient): Promise<unknown> =>
        new InteractiveSubmissionPrepare(client).execute({
          commands: [{ CreateCommand: { templateId: 'pkg:Module:Template', createArguments: {} } }],
          commandId: 'command-id',
          userId: 'user',
          actAs: ['party'],
          readAs: [],
          synchronizerId: 'synchronizer',
        }),
    },
    {
      clientFamily: 'Ledger preferred packages',
      response: {
        packageReferences: [{ packageId: 'package-id', packageName: 'package-name', packageVersion: '1.0.0' }],
        synchronizerId: 'synchronizer',
      },
      execute: async (client: BaseClient): Promise<unknown> =>
        new InteractiveSubmissionGetPreferredPackages(client).execute({
          packageVettingRequirements: [{ parties: ['party'], packageName: 'package-name' }],
          synchronizerId: 'synchronizer',
        }),
    },
  ])('retries a transient $clientFamily read-only POST', async ({ execute, response }) => {
    const { client, post } = createSemanticPostClient();
    post.mockRejectedValueOnce(createAxiosError(503)).mockResolvedValueOnce({ data: response });

    await expect(execute(client)).resolves.toEqual(response);
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

  it('validates semantic-read responses after transport retry handling and does not retry schema failures', async () => {
    const { client, post } = createSemanticPostClient();
    post.mockResolvedValue({ data: { packageReferences: [], synchronizerId: 'synchronizer::id' } });

    await expect(
      new InteractiveSubmissionGetPreferredPackages(client).execute({
        packageVettingRequirements: [{ parties: ['party'], packageName: 'package-name' }],
        synchronizerId: 'synchronizer',
      })
    ).rejects.toThrow('Response validation failed');
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe('interactive submission retry freshness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(interactiveMutationCases)('rejects exact-body retry for $name before dispatch', async ({ execute }) => {
    const { client, post } = createSemanticPostClient();

    await expect(
      execute(client, createInteractiveExecuteRequest(), {
        retry: { kind: 'exact-body', maxAttempts: 2 },
      })
    ).rejects.toThrow('cannot use exact-body retry');
    expect(post).not.toHaveBeenCalled();
  });

  it.each(interactiveMutationCases)(
    'rejects nonconsecutive submission ID reuse for $name before the third dispatch',
    async ({ execute }) => {
      const { client, post } = createSemanticPostClient();
      post.mockRejectedValue(createAxiosError(400));

      const failure: unknown = await execute(client, createInteractiveExecuteRequest(), {
        retry: {
          kind: 'derived-body',
          maxAttempts: 3,
          backoffMs: 0,
          shouldRetry: () => true,
          deriveParams: ({ attempt, params }) => ({
            ...params,
            submissionId: attempt === 1 ? 'submission-2' : 'submission-1',
          }),
        },
      }).then(
        () => new Error('Expected retry identifier reuse to fail'),
        (error: unknown) => error
      );

      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toContain('reused a fresh retry identifier');
      expect((failure as Error).message).not.toContain('submission-1');
      expect(post).toHaveBeenCalledTimes(2);
    }
  );

  it.each(interactiveMutationCases)(
    'dispatches every fresh derived submission ID for $name',
    async ({ execute, response }) => {
      const { client, post } = createSemanticPostClient();
      const beforeAttempt = jest.fn();
      post
        .mockRejectedValueOnce(createAxiosError(400))
        .mockRejectedValueOnce(createAxiosError(400))
        .mockResolvedValueOnce({ data: response });

      await expect(
        execute(client, createInteractiveExecuteRequest(), {
          retry: {
            kind: 'derived-body',
            maxAttempts: 3,
            backoffMs: 0,
            shouldRetry: () => true,
            beforeAttempt,
            deriveParams: ({ attempt, params }) => ({
              ...params,
              submissionId: `submission-${attempt + 1}`,
            }),
          },
        })
      ).resolves.toEqual(response);
      expect(post).toHaveBeenCalledTimes(3);
      expect(beforeAttempt).toHaveBeenCalledTimes(3);
      expect(post.mock.calls.map((call) => (call[1] as InteractiveSubmissionExecuteRequest).submissionId)).toEqual([
        'submission-1',
        'submission-2',
        'submission-3',
      ]);
    }
  );

  it('does not treat a successful but invalid execute response as retryable transport failure', async () => {
    const { client, post } = createSemanticPostClient();
    const deriveParams = jest.fn(({ params }: OperationRetryContext<InteractiveSubmissionExecuteRequest>) => ({
      ...params,
      submissionId: 'submission-2',
    }));
    post.mockResolvedValue({ data: { updateId: 'not-part-of-the-empty-response' } });

    await expect(
      new InteractiveSubmissionExecute(client).execute(createInteractiveExecuteRequest(), {
        retry: {
          kind: 'derived-body',
          maxAttempts: 2,
          shouldRetry: () => true,
          deriveParams,
        },
      })
    ).rejects.toThrow('Response validation failed');
    expect(post).toHaveBeenCalledTimes(1);
    expect(deriveParams).not.toHaveBeenCalled();
  });

  it('isolates used submission IDs between separate executions', async () => {
    const { client, post } = createSemanticPostClient();
    const operation = new InteractiveSubmissionExecute(client);
    post.mockResolvedValue({ data: {} });
    const options = {
      retry: {
        kind: 'derived-body' as const,
        maxAttempts: 1,
        deriveParams: ({ params }: OperationRetryContext<InteractiveSubmissionExecuteRequest>) => params,
      },
    };

    await expect(operation.execute(createInteractiveExecuteRequest(), options)).resolves.toEqual({});
    await expect(operation.execute(createInteractiveExecuteRequest(), options)).resolves.toEqual({});
    expect(post).toHaveBeenCalledTimes(2);
  });
});
