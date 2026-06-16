import { SubmitAndWaitForTransactionTree } from '../../../src/clients/ledger-json-api/operations/v2/commands/submit-and-wait-for-transaction-tree';
import type { BaseClient } from '../../../src/core';

const createCommand = (): { CreateCommand: { templateId: string; createArguments: Record<string, never> } } => ({
  CreateCommand: {
    templateId: '#pkg:Module:Template',
    createArguments: {},
  },
});

describe('SubmitAndWaitForTransactionTree', () => {
  it('forwards traceContext in the submit request body', async () => {
    const makePostRequest = jest.fn().mockResolvedValue({
      transactionTree: {
        updateId: 'update-123',
      },
    });
    const client = {
      getApiUrl: () => 'https://ledger.example',
      getPartyId: () => 'alice::123',
      makePostRequest,
    } as unknown as BaseClient;

    await new SubmitAndWaitForTransactionTree(client).execute({
      commands: [createCommand()],
      commandId: 'cmd-123',
      traceContext: {
        traceId: 'trace-123',
        spanId: 'span-123',
        parentSpanId: 'parent-123',
        metadata: {
          requestId: 'request-123',
        },
      },
    });

    expect(makePostRequest).toHaveBeenCalledWith(
      'https://ledger.example/v2/commands/submit-and-wait-for-transaction-tree',
      expect.objectContaining({
        actAs: ['alice::123'],
        commandId: 'cmd-123',
        traceContext: {
          traceId: 'trace-123',
          spanId: 'span-123',
          parentSpanId: 'parent-123',
          metadata: {
            requestId: 'request-123',
          },
        },
      }),
      expect.objectContaining({
        contentType: 'application/json',
        includeBearerToken: true,
      })
    );
  });
});
