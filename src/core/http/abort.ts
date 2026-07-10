/** Return true when an error has the standard cancellation shape exposed by the SDK. */
export function isAbortError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'AbortError';
}

/** Create a stable AbortError while retaining the original reason as a non-enumerable cause. */
export function createAbortError(signal: AbortSignal | undefined, canceledError?: unknown): Error {
  const reason: unknown = signal?.reason ?? canceledError;
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string' && reason.length > 0
        ? reason
        : 'The operation was aborted';
  const abortError = new Error(message);
  abortError.name = 'AbortError';
  if (reason !== undefined) {
    Object.defineProperty(abortError, 'cause', { value: reason, enumerable: false });
  }
  return abortError;
}

/** Throw a stable AbortError when the supplied signal is already canceled. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw createAbortError(signal);
}

/** Race any synchronous or asynchronous pre-dispatch work against cancellation. */
export async function awaitWithAbort<Value>(
  work: () => Value | Promise<Value>,
  signal: AbortSignal | undefined
): Promise<Value> {
  throwIfAborted(signal);
  const workPromise = Promise.resolve().then(work);
  if (!signal) return workPromise;

  return new Promise<Value>((resolve, reject) => {
    const onAbort = (): void => {
      signal.removeEventListener('abort', onAbort);
      reject(createAbortError(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    void workPromise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
    if (signal.aborted) onAbort();
  });
}
