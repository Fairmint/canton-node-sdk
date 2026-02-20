export interface ContinuousLoopOptions {
  /** Interval between cycles in seconds */
  readonly intervalSeconds: number;
  /**
   * Callback to run on each cycle.
   *
   * @param isShutdownRequested - Function to check if shutdown has been requested during the cycle
   * @returns Promise that resolves when the cycle is complete (return value is ignored)
   */
  readonly runCycle: (isShutdownRequested: () => boolean) => Promise<unknown>;
  /** Optional callback for cleanup on shutdown */
  readonly onShutdown?: () => Promise<void>;
  /** Optional callback for per-cycle errors */
  readonly onCycleError?: (error: unknown) => void;
}

/**
 * Run a function in a continuous loop with graceful shutdown support.
 */
export async function runContinuousLoop(options: ContinuousLoopOptions): Promise<void> {
  const { intervalSeconds, runCycle, onShutdown, onCycleError } = options;

  let shutdownRequested = false;
  let sleepResolve: (() => void) | null = null;
  let sleepTimeout: NodeJS.Timeout | null = null;

  const handleShutdown = (_signal: string): void => {
    shutdownRequested = true;
    if (sleepTimeout) {
      clearTimeout(sleepTimeout);
      sleepTimeout = null;
    }
    if (sleepResolve) {
      sleepResolve();
      sleepResolve = null;
    }
  };

  const sigintHandler = (): void => handleShutdown('SIGINT');
  const sigtermHandler = (): void => handleShutdown('SIGTERM');

  process.on('SIGINT', sigintHandler);
  process.on('SIGTERM', sigtermHandler);

  const isShutdownRequested = (): boolean => shutdownRequested;

  try {
    for (;;) {
      if (isShutdownRequested()) {
        break;
      }
      try {
        await runCycle(isShutdownRequested);
      } catch (error) {
        try {
          onCycleError?.(error);
        } catch {
          // Prevent a failing error callback from terminating the loop
        }
      }

      if (isShutdownRequested()) {
        break;
      }
      await new Promise<void>((resolve) => {
        sleepResolve = resolve;
        sleepTimeout = setTimeout(() => {
          sleepTimeout = null;
          sleepResolve = null;
          resolve();
        }, intervalSeconds * 1000);
      });
    }
  } finally {
    process.off('SIGINT', sigintHandler);
    process.off('SIGTERM', sigtermHandler);
    if (typeof onShutdown === 'function') {
      await onShutdown();
    }
  }
}
