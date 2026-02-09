import { type LedgerJsonApiClient } from './index';
import { type CompletionsWsMessage } from './operations/v2/commands/subscribe-to-completions';

export interface WaitForCompletionParams {
  readonly submissionId: string;
  readonly partyId: string;
  readonly userId: string;
  readonly beginExclusive: number;
  readonly timeoutMs?: number;
}

interface CompletionDetails {
  readonly submissionId?: string | undefined;
  readonly statusCode?: number | undefined;
  readonly statusMessage?: string | undefined;
  readonly updateId?: string | undefined;
}

function extractCompletion(message: CompletionsWsMessage): CompletionDetails | null {
  if (!('completionResponse' in message)) {
    return null;
  }

  const { completionResponse } = message;
  if (!('Completion' in completionResponse)) {
    return null;
  }

  const completion = completionResponse.Completion.value;
  if (typeof completion.submissionId !== 'string') {
    return null;
  }

  return {
    submissionId: completion.submissionId,
    statusCode: typeof completion.status?.code === 'number' ? completion.status.code : undefined,
    statusMessage: typeof completion.status?.message === 'string' ? completion.status.message : undefined,
    updateId: typeof completion.updateId === 'string' ? completion.updateId : undefined,
  };
}

/** Wait for a specific completion using the ledger's WebSocket completions stream. */
export async function waitForCompletion(
  ledgerClient: LedgerJsonApiClient,
  params: WaitForCompletionParams
): Promise<string> {
  const { submissionId, partyId, userId, beginExclusive, timeoutMs = 10 * 60 * 1000 } = params;

  return new Promise((resolve, reject) => {
    let closed = false;
    let subscription: { close: () => void } | null = null;

    const cleanup = (): void => {
      closed = true;
      if (subscription) {
        subscription.close();
        subscription = null;
      }
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for completion of submission ${submissionId}`));
    }, timeoutMs);

    const handleError = (error: unknown): void => {
      if (closed) {
        return;
      }
      clearTimeout(timer);
      cleanup();
      const err = error instanceof Error ? error : new Error(String(error));
      reject(err);
    };

    void ledgerClient
      .subscribeToCompletions(
        {
          userId,
          parties: [partyId],
          beginExclusive,
        },
        {
          onMessage: (message: CompletionsWsMessage) => {
            const completion = extractCompletion(message);
            if (!completion) {
              return;
            }
            if (completion.submissionId !== submissionId) {
              return;
            }
            clearTimeout(timer);
            cleanup();

            if (completion.statusCode && completion.statusCode !== 0) {
              reject(new Error(completion.statusMessage ?? 'Transaction failed'));
              return;
            }

            if (!completion.updateId) {
              reject(new Error('Completion did not include updateId'));
              return;
            }

            resolve(completion.updateId);
          },
          onError: handleError,
          onClose: () => {
            handleError(new Error('Completion subscription closed before receiving response'));
          },
        }
      )
      .then((sub) => {
        subscription = sub;
        if (closed) {
          subscription.close();
        }
      })
      .catch(handleError);
  });
}
