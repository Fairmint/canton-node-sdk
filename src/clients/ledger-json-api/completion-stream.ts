import { type LedgerJsonApiClient } from './index';
import { type CompletionsWsMessage } from './operations/v2/commands/subscribe-to-completions';

/**
 * Arguments for {@link waitForCompletion} / {@link waitForCompletionWithMetadata}.
 *
 * Use the same `submissionId` you passed when submitting the command, `partyId` / `userId` matching the subscription,
 * and `beginExclusive` set from ledger-offset bookkeeping used when subscribing (typically before submit offset).
 */
export interface WaitForCompletionParams {
  /** Submission identifier returned by the submit/prepare flow for this command. */
  readonly submissionId: string;
  /** Party whose completions stream should include this submission. */
  readonly partyId: string;
  /** Ledger user id used when subscribing to completions (must match authenticated stream user). */
  readonly userId: string;
  /** Exclusive lower bound for the completions stream (`beginExclusive` / checkpoint offset semantics). */
  readonly beginExclusive: number;
  /** Max wait before rejecting with a timeout error (default 10 minutes). */
  readonly timeoutMs?: number;
}

/** Result of waiting for a command completion, including optional paid traffic cost when the ledger reports it. */
export interface WaitForCompletionResult {
  readonly updateId: string;
  /** Present when the Ledger API includes `paidTrafficCost` on the completion (Canton). */
  readonly paidTrafficCost?: bigint | undefined;
}

interface CompletionDetails {
  readonly submissionId?: string | undefined;
  readonly statusCode?: number | undefined;
  readonly statusMessage?: string | undefined;
  readonly updateId?: string | undefined;
  readonly paidTrafficCost?: bigint | undefined;
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

  const paidRaw = completion.paidTrafficCost;
  let paidTrafficCost: bigint | undefined;
  if (typeof paidRaw === 'number' && Number.isSafeInteger(paidRaw)) {
    paidTrafficCost = BigInt(paidRaw);
  } else if (typeof paidRaw === 'string' && /^\d+$/.test(paidRaw)) {
    paidTrafficCost = BigInt(paidRaw);
  }

  return {
    submissionId: completion.submissionId,
    statusCode: typeof completion.status?.code === 'number' ? completion.status.code : undefined,
    statusMessage: typeof completion.status?.message === 'string' ? completion.status.message : undefined,
    updateId: typeof completion.updateId === 'string' ? completion.updateId : undefined,
    paidTrafficCost,
  };
}

async function waitForCompletionCore<T>(
  ledgerClient: LedgerJsonApiClient,
  params: WaitForCompletionParams,
  mapSuccess: (details: CompletionDetails, updateId: string) => T
): Promise<T> {
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

            const { updateId } = completion;
            if (!updateId) {
              reject(new Error('Completion did not include updateId'));
              return;
            }

            resolve(mapSuccess(completion, updateId));
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

/**
 * Waits until the completions WebSocket delivers the completion for `submissionId`, then returns the ledger `updateId`.
 *
 * Prefer this over polling HTTP completions when you already submitted async/interactive commands and need to block on
 * one submission.
 *
 * @param ledgerClient - Client used to open `subscribeToCompletions`
 * @param params - Submission identity, party/user, offset cursor, optional timeout
 * @returns The canonical update id string for the completed submission
 * @throws Error if the completion reports non-zero status, omits `updateId`, the stream errors/closes early, or time runs out
 *
 * @example
 * ```ts
 * const submissionId = '…'; // from your submit response
 * await waitForCompletion(ledger, {
 *   submissionId,
 *   partyId,
 *   userId,
 *   beginExclusive,
 * });
 * ```
 */
export async function waitForCompletion(
  ledgerClient: LedgerJsonApiClient,
  params: WaitForCompletionParams
): Promise<string> {
  return waitForCompletionCore(ledgerClient, params, (_c, updateId) => updateId);
}

/**
 * Same as {@link waitForCompletion}, but returns `{ updateId, paidTrafficCost? }` when the Ledger API attaches traffic
 * cost metadata to the completion (supported Canton versions).
 *
 * @param ledgerClient - Client used to open `subscribeToCompletions`
 * @param params - Same as {@link waitForCompletion}
 */
export async function waitForCompletionWithMetadata(
  ledgerClient: LedgerJsonApiClient,
  params: WaitForCompletionParams
): Promise<WaitForCompletionResult> {
  return waitForCompletionCore(ledgerClient, params, (c, updateId) =>
    c.paidTrafficCost === undefined ? { updateId } : { updateId, paidTrafficCost: c.paidTrafficCost }
  );
}
