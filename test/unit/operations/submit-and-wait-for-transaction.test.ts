import { SubmitAndWaitForTransaction } from '../../../src/clients/ledger-json-api/operations/v2/commands/submit-and-wait-for-transaction';
import type { BaseClient } from '../../../src/core';

const createCommand = (): { CreateCommand: { templateId: string; createArguments: Record<string, never> } } => ({
  CreateCommand: {
    templateId: '#pkg:Module:Template',
    createArguments: {},
  },
});

describe('SubmitAndWaitForTransaction', () => {
  it('wraps command fields in the Canton request envelope', async () => {
    const command = createCommand();
    const makePostRequest = jest.fn().mockResolvedValue({
      transaction: {
        updateId: 'update-123',
      },
    });
    const client = {
      getApiUrl: () => 'https://ledger.example',
      getPartyId: () => 'alice::123',
      makePostRequest,
    } as unknown as BaseClient;

    await new SubmitAndWaitForTransaction(client).execute({
      commands: [command],
      commandId: 'cmd-123',
      readAs: ['reader::123'],
    });

    expect(makePostRequest).toHaveBeenCalledWith(
      'https://ledger.example/v2/commands/submit-and-wait-for-transaction',
      {
        commands: {
          commands: [command],
          commandId: 'cmd-123',
          actAs: ['alice::123'],
          readAs: ['reader::123'],
        },
      },
      expect.objectContaining({
        contentType: 'application/json',
        includeBearerToken: true,
      })
    );
  });
});
