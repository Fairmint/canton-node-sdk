/** A value that can be returned synchronously or asynchronously. */
export type MaybePromise<T> = T | Promise<T>;

/** Recursively marks a request value as readonly while it is exposed to retry callbacks. */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? { readonly [Index in keyof T]: DeepReadonly<T[Index]> }
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

/** How a failed request attempt was classified by the transport. */
export type RequestErrorClassification =
  | 'pre-dispatch-failure'
  | 'definite-rejection'
  | 'ambiguous-mutation-outcome'
  | 'transient-read-failure';

/** Whether a request can change server state from the SDK caller's perspective. */
export type RequestSemantics = 'read' | 'mutation';

/** Whether the SDK can determine the server-side outcome of a failed request attempt. */
export type RequestOutcomeCertainty = 'not-dispatched' | 'definite' | 'ambiguous';

/** Redacted information about a completed request attempt. Request bodies are deliberately excluded. */
export interface RequestAttemptSummary {
  /** One-based request attempt number. */
  readonly attempt: number;
  /** Optional caller-supplied, redacted identifier such as a command or submission ID. */
  readonly identifier?: string;
  /** Transport classification for the failed attempt. */
  readonly errorClassification: RequestErrorClassification;
  /** Certainty of the server-side outcome, independently from whether the error is transient. */
  readonly outcomeCertainty: RequestOutcomeCertainty;
  /** Whether the transport error is normally transient. */
  readonly retryable: boolean;
}

/** Context supplied before an HTTP request attempt is dispatched. */
export interface HttpRequestAttemptContext<Body> {
  /** One-based request attempt number. */
  readonly attempt: number;
  /** Immutable snapshot of the body that will be used for this attempt. */
  readonly body: DeepReadonly<Body>;
  /** Redacted summaries of failed attempts that preceded this one. */
  readonly previousAttempts: readonly RequestAttemptSummary[];
  /** Cancellation signal supplied for the operation, when present. */
  readonly signal?: AbortSignal;
}

/** Context supplied after a failed HTTP request attempt. */
export interface HttpRequestRetryContext<Body> extends HttpRequestAttemptContext<Body> {
  /** Normalized transport error for the failed attempt. */
  readonly error: Error;
  /** Classification of the failed attempt. */
  readonly errorClassification: RequestErrorClassification;
  /** Certainty of the server-side outcome, independently from whether the error is transient. */
  readonly outcomeCertainty: RequestOutcomeCertainty;
  /** Whether the transport error is normally transient. */
  readonly retryable: boolean;
}

/** Context used to select an equivalent endpoint for one semantic-read attempt. */
export interface HttpReadAttemptUrlContext<Body> extends HttpRequestAttemptContext<Body> {
  /** The URL supplied when the logical request began. */
  readonly originalUrl: string;
}

/** Shared hooks for an explicitly retryable HTTP request. */
export interface HttpRequestRetryHooks<Body> {
  /** Maximum number of attempts, including the initial request. */
  readonly maxAttempts: number;
  /**
   * Optional retry predicate. Without one, reads retry transient failures while mutations retry only definite transient
   * rejections. Ambiguous mutation outcomes require an explicit predicate override.
   */
  readonly shouldRetry?: (context: HttpRequestRetryContext<Body>) => MaybePromise<boolean>;
  /** Optional delay, or delay calculator, evaluated between attempts. */
  readonly backoffMs?: number | ((context: HttpRequestRetryContext<Body>) => MaybePromise<number>);
  /** Hook awaited immediately before every attempt, including the first. */
  readonly beforeAttempt?: (context: HttpRequestAttemptContext<Body>) => MaybePromise<void>;
  /**
   * Returns a redacted identifier that is safe to expose in {@link UnknownMutationOutcomeError}. The request body is
   * never inferred or serialized as an identifier.
   */
  readonly getAttemptIdentifier?: (context: HttpRequestAttemptContext<Body>) => MaybePromise<string | undefined>;
}

/** Disable automatic retry for this request. This is the default for every mutating method. */
export interface NoHttpRequestRetryStrategy {
  readonly kind: 'none';
}

/** Replay the exact immutable request body when a retry is explicitly authorized. */
export interface ExactBodyHttpRequestRetryStrategy<Body> extends HttpRequestRetryHooks<Body> {
  readonly kind: 'exact-body';
}

/** Derive and validate a new request body before each retry. */
export interface DerivedBodyHttpRequestRetryStrategy<Body> extends HttpRequestRetryHooks<Body> {
  readonly kind: 'derived-body';
  /** Called after a failed attempt to produce the body for the next attempt. */
  readonly deriveBody: (context: HttpRequestRetryContext<Body>) => MaybePromise<DeepReadonly<Body>>;
}

/** Explicit retry behavior for one HTTP request. */
export type HttpRequestRetryStrategy<Body> =
  | NoHttpRequestRetryStrategy
  | ExactBodyHttpRequestRetryStrategy<Body>
  | DerivedBodyHttpRequestRetryStrategy<Body>;

interface HttpRequestControlOptions<Body> {
  readonly signal?: AbortSignal;
  readonly retry?: HttpRequestRetryStrategy<Body>;
}

/** Options for an HTTP GET, whose semantics are always read-only. */
export type HttpReadRequestOptions<Body> = HttpRequestControlOptions<Body> & {
  readonly requestSemantics?: 'read';
  /**
   * Select an equivalent URL for each semantic-read attempt while retaining one retry state and attempt budget.
   * Mutations cannot use endpoint failover.
   */
  readonly resolveReadAttemptUrl?: (context: HttpReadAttemptUrlContext<Body>) => MaybePromise<string>;
};

/** Transport controls for POST/PATCH/DELETE, discriminated so failover is available only to explicit reads. */
export type HttpRequestOptions<Body> =
  | (HttpRequestControlOptions<Body> & {
      readonly requestSemantics: 'read';
      readonly resolveReadAttemptUrl?: (context: HttpReadAttemptUrlContext<Body>) => MaybePromise<string>;
    })
  | (HttpRequestControlOptions<Body> & {
      /** POST/PATCH/DELETE default to mutation when semantics are omitted. */
      readonly requestSemantics?: 'mutation';
      readonly resolveReadAttemptUrl?: never;
    });

/** HTTP options with an explicit semantic discriminator. */
export type HttpRequestOptionsForSemantics<Body, Semantics extends RequestSemantics> = Semantics extends 'read'
  ? HttpRequestControlOptions<Body> & {
      readonly requestSemantics: 'read';
      readonly resolveReadAttemptUrl?: (context: HttpReadAttemptUrlContext<Body>) => MaybePromise<string>;
    }
  : HttpRequestControlOptions<Body> & {
      readonly requestSemantics: 'mutation';
      readonly resolveReadAttemptUrl?: never;
    };

/**
 * Capture caller-owned HTTP options before a request crosses an asynchronous boundary.
 *
 * The signal and callback references intentionally remain live, but replacing properties on either the options object
 * or its retry strategy cannot change an in-flight request or a later Scan failover attempt.
 */
export function snapshotHttpRequestOptions<Body>(
  options: HttpReadRequestOptions<Body>
): Readonly<HttpReadRequestOptions<Body>>;
export function snapshotHttpRequestOptions<Body>(options: HttpRequestOptions<Body>): Readonly<HttpRequestOptions<Body>>;
export function snapshotHttpRequestOptions<Body>(
  options: HttpReadRequestOptions<Body> | HttpRequestOptions<Body>
): Readonly<HttpReadRequestOptions<Body> | HttpRequestOptions<Body>> {
  const { signal, retry, requestSemantics, resolveReadAttemptUrl } = options;
  const retrySnapshot: HttpRequestRetryStrategy<Body> | undefined =
    retry === undefined ? undefined : Object.freeze({ ...retry });

  return Object.freeze({
    ...(signal !== undefined ? { signal } : {}),
    ...(retrySnapshot !== undefined ? { retry: retrySnapshot } : {}),
    ...(requestSemantics !== undefined ? { requestSemantics } : {}),
    ...(resolveReadAttemptUrl !== undefined ? { resolveReadAttemptUrl } : {}),
  }) as Readonly<HttpReadRequestOptions<Body> | HttpRequestOptions<Body>>;
}
