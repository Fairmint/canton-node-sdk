import { ValidationError } from '../../../src/core/errors';
import { runWithAbortSignal } from '../../../src/core/utils/abort';

describe('abort-aware operations', (): void => {
  it('keeps a successful result when the operation fulfilled before abort', async (): Promise<void> => {
    const controller = new AbortController();
    let resolveOperation: ((value: string) => void) | undefined;
    const operation = new Promise<string>((resolve) => {
      resolveOperation = resolve;
    });
    const result = runWithAbortSignal(
      controller.signal,
      () => new ValidationError('operation aborted'),
      // Exact promise identity is the behavior under test.
      // eslint-disable-next-line @typescript-eslint/promise-function-async
      () => operation
    );

    resolveOperation?.('ready');
    controller.abort();

    await expect(result).resolves.toBe('ready');
  });

  it('rejects when abort occurs before the operation fulfills', async (): Promise<void> => {
    const controller = new AbortController();
    let resolveOperation: ((value: string) => void) | undefined;
    const operation = new Promise<string>((resolve) => {
      resolveOperation = resolve;
    });
    const result = runWithAbortSignal(
      controller.signal,
      () => new ValidationError('operation aborted'),
      // Exact promise identity is the behavior under test.
      // eslint-disable-next-line @typescript-eslint/promise-function-async
      () => operation
    );

    controller.abort();
    resolveOperation?.('too late');

    await expect(result).rejects.toThrow('operation aborted');
  });

  it('does not start a pre-aborted operation', async (): Promise<void> => {
    const controller = new AbortController();
    const operation = jest.fn(async () => 'unexpected');
    controller.abort();

    await expect(
      runWithAbortSignal(controller.signal, () => new ValidationError('operation aborted'), operation)
    ).rejects.toThrow('operation aborted');
    expect(operation).not.toHaveBeenCalled();
  });
});
