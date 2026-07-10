import { CreateUser, CreateUserParamsSchema } from '../../../src/clients/validator-api/operations/v0/admin/create-user';
import { SubmitTransferPreapprovalSendParamsSchema } from '../../../src/clients/validator-api/operations/v0/admin/submit-transfer-preapproval-send';
import {
  ListTransactions,
  type ListTransactionsParams,
  ListTransactionsParamsSchema,
  type ListTransactionsResponse,
} from '../../../src/clients/validator-api/operations/v0/wallet/list-transactions';
import {
  Tap,
  type TapParams,
  TapParamsSchema,
  type TapResponse,
} from '../../../src/clients/validator-api/operations/v0/wallet/tap';
import {
  TransferPreapprovalSend,
  TransferPreapprovalSendParamsSchema,
} from '../../../src/clients/validator-api/operations/v0/wallet/transfer-preapproval-send';
import type { BaseClient } from '../../../src/core';

function createClient(makePostRequest: jest.Mock): BaseClient {
  return {
    getApiUrl: () => 'https://validator.example',
    makePostRequest,
  } as unknown as BaseClient;
}

describe('validator request schema integrity', () => {
  it('preserves createPartyIfMissing while validating onboard-user requests', async () => {
    const request = {
      name: 'Alice',
      party_id: 'alice::namespace',
      createPartyIfMissing: true,
    };

    expect(CreateUserParamsSchema.parse(request)).toEqual(request);

    const makePostRequest = jest.fn().mockResolvedValue({ party_id: request.party_id });
    await new CreateUser(createClient(makePostRequest)).execute(request);

    expect(makePostRequest).toHaveBeenCalledWith('https://validator.example/api/validator/v0/admin/users', request, {
      contentType: 'application/json',
      includeBearerToken: true,
    });
  });

  it('keeps createPartyIfMissing optional', () => {
    expect(CreateUserParamsSchema.parse({ name: 'Alice' })).toEqual({ name: 'Alice' });
    expect(
      CreateUserParamsSchema.parse({
        name: 'Alice',
        party_id: undefined,
        createPartyIfMissing: undefined,
      })
    ).toEqual({ name: 'Alice' });
  });

  it('rejects request keys that are absent from the generated contract', () => {
    expect(() =>
      CreateUserParamsSchema.parse({
        name: 'Alice',
        createPartyIfMising: true,
      })
    ).toThrow();
  });

  it('rejects request keys that are absent from a nested generated contract', () => {
    expect(() =>
      SubmitTransferPreapprovalSendParamsSchema.parse({
        submission: {
          party_id: 'alice::namespace',
          transaction: 'prepared-transaction',
          signed_tx_hash: 'abcd',
          public_key: '1234',
          signed_transaction_hash: 'silent-typo',
        },
      })
    ).toThrow();
  });

  it('models transfer-preapproval send as a no-content response', async () => {
    const request = {
      receiver_party_id: 'bob::namespace',
      amount: '10.5',
      deduplication_id: 'payment-123',
      description: 'Invoice 123',
    };

    expect(TransferPreapprovalSendParamsSchema.parse(request)).toEqual(request);

    const makePostRequest = jest.fn().mockResolvedValue(undefined);
    await new TransferPreapprovalSend(createClient(makePostRequest)).execute(request);

    expect(makePostRequest).toHaveBeenCalledWith(
      'https://validator.example/api/validator/v0/wallet/transfer-preapproval/send',
      request,
      {
        contentType: 'application/json',
        includeBearerToken: true,
      }
    );
  });

  it('posts the exact generated wallet tap request and returns its contract id', async () => {
    const request = {
      amount: '10.5',
      command_id: 'tap-command-123',
    } satisfies TapParams;
    const response = { contract_id: 'tap-contract-123' } satisfies TapResponse;

    expect(TapParamsSchema.parse(request)).toEqual(request);

    const makePostRequest = jest.fn().mockResolvedValue(response);
    await expect(new Tap(createClient(makePostRequest)).execute(request)).resolves.toEqual(response);

    expect(makePostRequest).toHaveBeenCalledWith('https://validator.example/api/validator/v0/wallet/tap', request, {
      contentType: 'application/json',
      includeBearerToken: true,
    });
  });

  it('keeps the tap command id optional while rejecting invalid request shapes', () => {
    expect(TapParamsSchema.parse({ amount: '1', command_id: undefined })).toEqual({ amount: '1' });
    for (const amount of ['', ' ', '1e3', '12345678901234567890123456789', '0.12345678901', '.5', '1.']) {
      expect(() => TapParamsSchema.parse({ amount })).toThrow();
    }
    expect(() => TapParamsSchema.parse({ amount: 1 })).toThrow();
    expect(() => TapParamsSchema.parse({ amount: '1', commandId: 'typo' })).toThrow();
  });

  it('generates a client-side UUID command id before posting when the caller omits it', async () => {
    const response = { contract_id: 'tap-contract-456' } satisfies TapResponse;
    const makePostRequest = jest.fn().mockResolvedValue(response);

    await new Tap(createClient(makePostRequest)).execute({ amount: '1' });

    expect(makePostRequest).toHaveBeenCalledTimes(1);
    const body = makePostRequest.mock.calls[0]?.[1];
    expect(body).toEqual({
      amount: '1',
      command_id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      ) as string,
    });
  });

  it('posts the exact wallet transaction-history request and returns every discriminated response branch', async () => {
    const request = {
      begin_after_id: 'event-cursor-123',
      page_size: 25,
    } satisfies ListTransactionsParams;
    const response = {
      items: [
        {
          transaction_type: 'transfer',
          transaction_subtype: {
            template_id: 'package:Module:Transfer',
            choice: 'Transfer',
            amulet_operation: 'transfer',
            interface_id: 'package:Module:TransferInterface',
          },
          event_id: 'transfer-event',
          date: '2026-07-10T02:00:00Z',
          sender: { party: 'alice::namespace', amount: '-10' },
          receivers: [{ party: 'bob::namespace', amount: '10' }],
          holding_fees: '0',
          app_rewards_used: '0',
          validator_rewards_used: '0',
          sv_rewards_used: '0',
          development_fund_coupons_used: '0',
          description: 'test transfer',
        },
        {
          transaction_type: 'balance_change',
          transaction_subtype: {
            template_id: 'package:Module:AmuletRules',
            choice: 'AmuletRules_DevNet_Tap',
          },
          event_id: 'balance-event',
          date: '2026-07-10T02:00:01Z',
          receivers: [{ party: 'alice::namespace', amount: '10' }],
        },
        {
          transaction_type: 'notification',
          transaction_subtype: {
            template_id: 'package:Module:Subscription',
            choice: 'ExpireSubscription',
          },
          event_id: 'notification-event',
          date: '2026-07-10T02:00:02Z',
          details: 'Subscription expired',
        },
        {
          transaction_type: 'unknown',
          transaction_subtype: { template_id: 'unknown', choice: 'unknown' },
          event_id: 'unknown-event',
          date: '2026-07-10T02:00:03Z',
        },
      ],
    } satisfies ListTransactionsResponse;

    expect(ListTransactionsParamsSchema.parse(request)).toEqual(request);

    const makePostRequest = jest.fn().mockResolvedValue(response);
    await expect(new ListTransactions(createClient(makePostRequest)).execute(request)).resolves.toEqual(response);

    expect(makePostRequest).toHaveBeenCalledWith(
      'https://validator.example/api/validator/v0/wallet/transactions',
      request,
      {
        contentType: 'application/json',
        includeBearerToken: true,
      }
    );
  });

  it('validates the transaction-history cursor and handler page limits exactly', () => {
    expect(ListTransactionsParamsSchema.parse({ page_size: 1, begin_after_id: undefined })).toEqual({
      page_size: 1,
    });
    expect(ListTransactionsParamsSchema.parse({ page_size: 1_000, begin_after_id: '' })).toEqual({
      page_size: 1_000,
      begin_after_id: '',
    });

    for (const page_size of [0, -1, 1.5, 1_001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => ListTransactionsParamsSchema.parse({ page_size })).toThrow();
    }
    expect(() => ListTransactionsParamsSchema.parse({ page_size: 1, begin_after_id: 123 })).toThrow();
    expect(() => ListTransactionsParamsSchema.parse({ page_size: 1, beginAfterId: 'typo' })).toThrow();
  });
});
