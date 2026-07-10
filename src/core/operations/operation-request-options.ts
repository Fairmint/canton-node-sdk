import { ConfigurationError, ValidationError } from '../errors';
import {
  type DeepReadonly,
  type HttpRequestAttemptContext,
  type HttpRequestOptionsForSemantics,
  type HttpRequestRetryContext,
  type HttpRequestRetryHooks,
  type HttpRequestRetryStrategy,
  type MaybePromise,
  type RequestSemantics,
} from '../http/request-retry';
import { cloneRequestValue, deepFreezeRequestValue } from '../http/request-value';
import {
  type OperationAttemptContext,
  type OperationExecuteOptions,
  type OperationRetryContext,
  type RequestRetryHooks,
  type RequestRetryStrategy,
} from './operation-execute-options';

/** Inputs needed to map one operation's typed retry controls onto a fixed HTTP endpoint. */
export interface OperationRequestOptionsConfig<Params, Body, Semantics extends RequestSemantics> {
  readonly initialParams: Params;
  readonly options: OperationExecuteOptions<Params>;
  readonly requestSemantics: Semantics;
  readonly initialUrl: string;
  readonly validateParams: (params: Params) => Params;
  readonly buildUrl: (params: Params) => MaybePromise<string>;
  readonly buildBody: (params: Params) => MaybePromise<Body>;
}

/** Map operation-level params/hooks to transport-level body/hooks without exposing unsound caller subtypes. */
export function createOperationHttpRequestOptions<Params, Body, Semantics extends RequestSemantics>(
  config: OperationRequestOptionsConfig<Params, Body, Semantics>
): HttpRequestOptionsForSemantics<Body, Semantics> {
  let currentParams = config.initialParams;

  const toOperationAttemptContext = (context: HttpRequestAttemptContext<Body>): OperationAttemptContext<Params> =>
    Object.freeze({
      attempt: context.attempt,
      params: createReadonlyParams(currentParams),
      previousAttempts: context.previousAttempts,
      ...(context.signal !== undefined ? { signal: context.signal } : {}),
    });

  const toOperationRetryContext = (context: HttpRequestRetryContext<Body>): OperationRetryContext<Params> =>
    Object.freeze({
      ...toOperationAttemptContext(context),
      error: context.error,
      errorClassification: context.errorClassification,
      outcomeCertainty: context.outcomeCertainty,
      retryable: context.retryable,
    });

  const operationRetry = config.options.retry;
  const deriveBody: ((context: HttpRequestRetryContext<Body>) => Promise<DeepReadonly<Body>>) | undefined =
    operationRetry?.kind === 'derived-body'
      ? async (context: HttpRequestRetryContext<Body>): Promise<DeepReadonly<Body>> => {
          const readonlyDerivedParams = await operationRetry.deriveParams(toOperationRetryContext(context));
          const derivedParams = cloneDerivedParams<Params>(readonlyDerivedParams);
          const validatedDerivedParams = config.validateParams(derivedParams);
          const derivedUrl = await config.buildUrl(validatedDerivedParams);
          if (derivedUrl !== config.initialUrl) {
            throw new ValidationError(
              'Derived retry parameters must resolve to the same HTTP endpoint as the initial request'
            );
          }
          currentParams = validatedDerivedParams;
          return (await config.buildBody(currentParams)) as DeepReadonly<Body>;
        }
      : undefined;
  const retry =
    operationRetry === undefined
      ? undefined
      : mapOperationRetryStrategy(operationRetry, toOperationAttemptContext, toOperationRetryContext, deriveBody);

  return {
    ...(config.options.signal !== undefined ? { signal: config.options.signal } : {}),
    ...(retry !== undefined ? { retry } : {}),
    requestSemantics: config.requestSemantics,
  } as HttpRequestOptionsForSemantics<Body, Semantics>;
}

function mapOperationRetryStrategy<Params, Body>(
  retry: RequestRetryStrategy<Params>,
  toAttemptContext: (context: HttpRequestAttemptContext<Body>) => OperationAttemptContext<Params>,
  toRetryContext: (context: HttpRequestRetryContext<Body>) => OperationRetryContext<Params>,
  deriveBody: ((context: HttpRequestRetryContext<Body>) => Promise<DeepReadonly<Body>>) | undefined
): HttpRequestRetryStrategy<Body> {
  if (retry.kind === 'none') return Object.freeze({ kind: 'none' });

  const hooks = mapRetryHooks(retry, toAttemptContext, toRetryContext);
  if (retry.kind === 'exact-body') return Object.freeze({ kind: 'exact-body', ...hooks });
  if (deriveBody === undefined) {
    throw new ConfigurationError('A derived-body retry strategy requires a body derivation callback');
  }
  return Object.freeze({ kind: 'derived-body', ...hooks, deriveBody });
}

function mapRetryHooks<Params, Body>(
  hooks: RequestRetryHooks<Params>,
  toAttemptContext: (context: HttpRequestAttemptContext<Body>) => OperationAttemptContext<Params>,
  toRetryContext: (context: HttpRequestRetryContext<Body>) => OperationRetryContext<Params>
): HttpRequestRetryHooks<Body> {
  const { shouldRetry, backoffMs, beforeAttempt, getAttemptIdentifier } = hooks;
  return {
    maxAttempts: hooks.maxAttempts,
    ...(shouldRetry !== undefined
      ? {
          shouldRetry: async (context: HttpRequestRetryContext<Body>): Promise<boolean> =>
            shouldRetry(toRetryContext(context)),
        }
      : {}),
    ...(typeof backoffMs === 'function'
      ? {
          backoffMs: async (context: HttpRequestRetryContext<Body>): Promise<number> =>
            backoffMs(toRetryContext(context)),
        }
      : backoffMs !== undefined
        ? { backoffMs }
        : {}),
    ...(beforeAttempt !== undefined
      ? {
          beforeAttempt: async (context: HttpRequestAttemptContext<Body>): Promise<void> =>
            beforeAttempt(toAttemptContext(context)),
        }
      : {}),
    ...(getAttemptIdentifier !== undefined
      ? {
          getAttemptIdentifier: async (context: HttpRequestAttemptContext<Body>): Promise<string | undefined> =>
            getAttemptIdentifier(toAttemptContext(context)),
        }
      : {}),
  };
}

function createReadonlyParams<Params>(params: Params): DeepReadonly<Params> {
  if (params === null || typeof params !== 'object') return params as DeepReadonly<Params>;
  try {
    return deepFreezeRequestValue(cloneRequestValue(params)) as DeepReadonly<Params>;
  } catch (error) {
    throw new ConfigurationError('Retryable operation parameters must be structured-cloneable', {
      cause: error instanceof Error ? error.message : 'unknown clone failure',
    });
  }
}

function cloneDerivedParams<Params>(params: DeepReadonly<Params>): Params {
  try {
    return cloneRequestValue(params) as Params;
  } catch (error) {
    throw new ConfigurationError('Derived retry parameters must be structured-cloneable', {
      cause: error instanceof Error ? error.message : 'unknown clone failure',
    });
  }
}
