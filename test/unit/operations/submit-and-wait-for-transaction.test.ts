import {
  defaultSubmitTransactionFormat,
  SubmitAndWaitForTransaction,
  type SubmitAndWaitForTransactionParams,
} from '../../../src/clients/ledger-json-api/operations/v2/commands/submit-and-wait-for-transaction';
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
        transactionFormat: defaultSubmitTransactionFormat(['alice::123', 'reader::123']),
      },
      expect.objectContaining({
        contentType: 'application/json',
        includeBearerToken: true,
      })
    );
  });

  it('defaults to verbose ledger effects for every submitting party when no transactionFormat is given', () => {
    expect(defaultSubmitTransactionFormat(['alice::123', 'reader::123', 'alice::123'])).toEqual({
      eventFormat: {
        filtersByParty: {
          'alice::123': {
            cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: true } } } }],
          },
          'reader::123': {
            cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: true } } } }],
          },
        },
        verbose: true,
      },
      transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS',
    });
  });

  it('keeps transactionFormat at the top level of the request envelope', async () => {
    const command = createCommand();
    const transactionFormat: NonNullable<SubmitAndWaitForTransactionParams['transactionFormat']> = {
      eventFormat: {
        filtersByParty: {},
      },
      transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
    };
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
      transactionFormat,
    });

    expect(makePostRequest).toHaveBeenCalledWith(
      'https://ledger.example/v2/commands/submit-and-wait-for-transaction',
      {
        commands: {
          commands: [command],
          commandId: 'cmd-123',
          actAs: ['alice::123'],
        },
        transactionFormat,
      },
      expect.objectContaining({
        contentType: 'application/json',
        includeBearerToken: true,
      })
    );
  });
});
