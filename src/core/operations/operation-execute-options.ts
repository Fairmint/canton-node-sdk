import {
  type DeepReadonly,
  type MaybePromise,
  type RequestAttemptSummary,
  type RequestErrorClassification,
  type RequestOutcomeCertainty,
} from '../http/request-retry';

/** Context supplied before an operation request attempt is dispatched. */
export interface OperationAttemptContext<Params> {
  /** One-based request attempt number. */
  readonly attempt: number;
  /** Immutable, validated operation parameters for the current attempt. */
  readonly params: DeepReadonly<Params>;
  /** Redacted summaries of failed attempts that preceded this one. */
  readonly previousAttempts: readonly RequestAttemptSummary[];
  /** Cancellation signal supplied for the operation, when present. */
  readonly signal?: AbortSignal;
}

/** Context supplied after an operation request attempt fails. */
export interface OperationRetryContext<Params> extends OperationAttemptContext<Params> {
  /** Normalized transport error for the failed attempt. */
  readonly error: Error;
  /** Classification of the failed attempt. */
  readonly errorClassification: RequestErrorClassification;
  /** Certainty of the server-side outcome, independently from whether the error is transient. */
  readonly outcomeCertainty: RequestOutcomeCertainty;
  /** Whether the transport error is normally transient. */
  readonly retryable: boolean;
}

/** Shared hooks for an operation that explicitly opts into retry. */
export interface RequestRetryHooks<Params> {
  /** Maximum number of attempts, including the initial request. */
  readonly maxAttempts: number;
  /**
   * Optional retry predicate. Without one, reads retry transient failures while mutations retry only definite transient
   * rejections. Ambiguous mutation outcomes require an explicit predicate override.
   */
  readonly shouldRetry?: (context: OperationRetryContext<Params>) => MaybePromise<boolean>;
  /** Optional delay, or delay calculator, evaluated between attempts. */
  readonly backoffMs?: number | ((context: OperationRetryContext<Params>) => MaybePromise<number>);
  /** Hook awaited immediately before every attempt, including the first. */
  readonly beforeAttempt?: (context: OperationAttemptContext<Params>) => MaybePromise<void>;
  /** Returns a redacted identifier, such as a command ID, that is safe to expose if the mutation outcome is unknown. */
  readonly getAttemptIdentifier?: (context: OperationAttemptContext<Params>) => MaybePromise<string | undefined>;
}

/** Disable automatic retry. This is the default for every mutating operation. */
export interface NoRequestRetryStrategy {
  readonly kind: 'none';
}

/** Replay the exact immutable HTTP body built for the first operation attempt. */
export interface ExactBodyRequestRetryStrategy<Params> extends RequestRetryHooks<Params> {
  readonly kind: 'exact-body';
}

/** Revalidate parameters and rebuild the HTTP body before each retry. */
export interface DerivedBodyRequestRetryStrategy<Params> extends RequestRetryHooks<Params> {
  readonly kind: 'derived-body';
  /** Produce the operation parameters for the next attempt. The operation endpoint may not change. */
  readonly deriveParams: (context: OperationRetryContext<Params>) => MaybePromise<DeepReadonly<Params>>;
}

/** Immutable retry behavior for one operation execution. */
export type RequestRetryStrategy<Params> =
  | NoRequestRetryStrategy
  | ExactBodyRequestRetryStrategy<Params>
  | DerivedBodyRequestRetryStrategy<Params>;

/** Transport and retry controls for one operation execution. */
export interface OperationExecuteOptions<Params> {
  readonly signal?: AbortSignal;
  readonly retry?: RequestRetryStrategy<Params>;
}

/**
 * Capture caller-owned execution options before an operation crosses an asynchronous boundary.
 *
 * The returned objects retain the original signal and hook function references but cannot be redirected by replacing
 * properties on the caller's options or retry objects while request data is being built.
 */
export function snapshotOperationExecuteOptions<Params>(
  options: OperationExecuteOptions<Params> | undefined
): Readonly<OperationExecuteOptions<Params>> | undefined {
  if (options === undefined) return undefined;

  const { signal, retry } = options;
  const retrySnapshot = retry === undefined ? undefined : snapshotRequestRetryStrategy(retry);
  return Object.freeze({
    ...(signal !== undefined ? { signal } : {}),
    ...(retrySnapshot !== undefined ? { retry: retrySnapshot } : {}),
  });
}

function snapshotRequestRetryStrategy<Params>(retry: RequestRetryStrategy<Params>): RequestRetryStrategy<Params> {
  if (retry.kind === 'none') return Object.freeze({ kind: 'none' });

  const { maxAttempts, shouldRetry, backoffMs, beforeAttempt, getAttemptIdentifier } = retry;
  const hooks = {
    maxAttempts,
    ...(shouldRetry !== undefined ? { shouldRetry } : {}),
    ...(backoffMs !== undefined ? { backoffMs } : {}),
    ...(beforeAttempt !== undefined ? { beforeAttempt } : {}),
    ...(getAttemptIdentifier !== undefined ? { getAttemptIdentifier } : {}),
  };
  if (retry.kind === 'exact-body') return Object.freeze({ kind: 'exact-body', ...hooks });

  const { deriveParams } = retry;
  return Object.freeze({ kind: 'derived-body', ...hooks, deriveParams });
}
