import { type Canton, type CantonHealthCheckOptions, type ServiceHealthStatus } from '../../Canton';
import { waitForCondition, type WaitForConditionOptions } from '../../core/utils/polling';

export interface WaitForReadyOptions extends WaitForConditionOptions {
  /** Health check service selection passed to Canton.checkHealth(). */
  readonly healthCheck?: CantonHealthCheckOptions;
}

/**
 * Waits until the selected Canton services report healthy.
 *
 * Defaults to five minutes because LocalNet can take several minutes to become ready.
 */
export async function waitForReady(
  canton: Pick<Canton, 'checkHealth'>,
  options: WaitForReadyOptions = {}
): Promise<ServiceHealthStatus> {
  return waitForCondition(
    async () => {
      const health = await canton.checkHealth(options.healthCheck);
      return health.ok ? health : null;
    },
    {
      timeout: options.timeout ?? 300_000,
      interval: options.interval ?? 5_000,
      timeoutMessage: options.timeoutMessage ?? 'Timed out waiting for Canton services to become ready',
    }
  );
}
