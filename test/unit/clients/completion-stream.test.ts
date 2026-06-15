import { waitForCompletionWithMetadata } from '../../../src/clients/ledger-json-api';
import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import type { CompletionsWsMessage } from '../../../src/clients/ledger-json-api/operations/v2/commands/subscribe-to-completions';

type SubscribeHandlers = Parameters<LedgerJsonApiClient['subscribeToCompletions']>[1];
type CompletionSubscription = Awaited<ReturnType<LedgerJsonApiClient['subscribeToCompletions']>>;

const completionMessage = (submissionId: string): CompletionsWsMessage =>
  ({
    completionResponse: {
      Completion: {
        value: {
          submissionId,
          updateId: 'update-123',
          commandId: 'command-123',
          offset: 42,
          synchronizerTime: {
            synchronizerId: 'sync-123',
            recordTime: '2026-01-01T00:00:00Z',
          },
          status: { code: 0 },
          paidTrafficCost: '17',
        },
      },
    },
  }) as CompletionsWsMessage;

const createSubscription = (): CompletionSubscription => ({
  close: jest.fn(),
  isConnected: jest.fn().mockReturnValue(true),
  getConnectionState: jest.fn().mockReturnValue(1),
});

describe('waitForCompletionWithMetadata', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resubscribes when the completions stream closes before the target completion arrives', async () => {
    jest.useFakeTimers();

    const handlers: SubscribeHandlers[] = [];
    const subscriptions = [createSubscription(), createSubscription()];
    const client = {
      subscribeToCompletions: jest.fn(async (_params, nextHandlers: SubscribeHandlers) => {
        handlers.push(nextHandlers);
        return subscriptions[handlers.length - 1];
      }),
    } as unknown as jest.Mocked<LedgerJsonApiClient>;

    const resultPromise = waitForCompletionWithMetadata(client, {
      submissionId: 'submission-123',
      partyId: 'party-123',
      userId: 'user-123',
      beginExclusive: 10,
      timeoutMs: 30_000,
    });

    await Promise.resolve();
    expect(client.subscribeToCompletions).toHaveBeenCalledTimes(1);

    const firstHandlers = handlers[0];
    if (!firstHandlers) {
      throw new Error('Expected first completion subscription');
    }
    firstHandlers.onClose?.(1000, 'stream complete');
    firstHandlers.onClose?.(1000, 'duplicate close');
    jest.advanceTimersByTime(250);
    await Promise.resolve();

    expect(client.subscribeToCompletions).toHaveBeenCalledTimes(2);

    const secondHandlers = handlers[1];
    if (!secondHandlers) {
      throw new Error('Expected second completion subscription');
    }
    secondHandlers.onMessage(completionMessage('submission-123'));

    await expect(resultPromise).resolves.toEqual({
      updateId: 'update-123',
      paidTrafficCost: 17n,
    });
    const secondSubscription = subscriptions[1];
    if (!secondSubscription) {
      throw new Error('Expected second completion subscription handle');
    }
    expect(secondSubscription.close).toHaveBeenCalledTimes(1);
  });
});
