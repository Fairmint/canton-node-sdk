import { type LedgerJsonApiClient } from './index';
import { type CompletionsWsMessage } from './operations/v2/commands/subscribe-to-completions';

export interface WaitForCompletionParams {
  submissionId: string;
  partyId: string;
  userId: string;
  beginExclusive: number;
  timeoutMs?: number;
}

interface CompletionDetails {
  submissionId?: string;
  statusCode?: number;
  statusMessage?: string;
  updateId?: string;
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

  const details: CompletionDetails = {
    submissionId: completion.submissionId,
  };

  if (typeof completion.status?.code === 'number') {
    details.statusCode = completion.status.code;
  }

  if (typeof completion.status?.message === 'string') {
    details.statusMessage = completion.status.message;
  }

  if (typeof completion.updateId === 'string') {
    details.updateId = completion.updateId;
  }

  return details;
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
