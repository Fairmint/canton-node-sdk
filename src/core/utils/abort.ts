export async function runWithAbortSignal<T>(
  signal: AbortSignal | undefined,
  createAbortError: () => Error,
  operation: () => Promise<T>
): Promise<T> {
  if (!signal) return operation();

  return new Promise<T>((resolve, reject) => {
    const cleanup = (): void => signal.removeEventListener('abort', onAbort);
    const onAbort = (): void => {
      cleanup();
      reject(createAbortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }

    let pending: Promise<T>;
    try {
      pending = operation();
    } catch (error) {
      cleanup();
      reject(error);
      return;
    }

    pending.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      }
    );
  });
}

export async function delayWithAbortSignal(
  ms: number,
  signal: AbortSignal | undefined,
  createAbortError: () => Error
): Promise<void> {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms));

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      reject(createAbortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
    }
  });
}
