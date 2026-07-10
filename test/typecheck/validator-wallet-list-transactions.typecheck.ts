import type { ValidatorApiClient, ValidatorWalletTransaction } from '../../src/clients/validator-api';

type ListTransactionsRequest = Parameters<ValidatorApiClient['listTransactions']>[0];
type ListTransactionsResponse = Awaited<ReturnType<ValidatorApiClient['listTransactions']>>;
type ClientTransaction = ListTransactionsResponse['items'][number];

const firstPage: ListTransactionsRequest = { page_size: 1 };
const followingPage: ListTransactionsRequest = {
  page_size: 1,
  begin_after_id: 'event-cursor-123',
};
const response: ListTransactionsResponse = {
  items: [
    {
      transaction_type: 'balance_change',
      transaction_subtype: {
        template_id: 'package:Module:AmuletRules',
        choice: 'AmuletRules_DevNet_Tap',
      },
      event_id: 'event-123',
      date: '2026-07-10T02:00:00Z',
      receivers: [{ party: 'alice::namespace', amount: '10' }],
    },
  ],
};

function publicEventId(item: ValidatorWalletTransaction): string {
  return item.event_id;
}
const publicEventIds = response.items.map(publicEventId);

function narrowTransaction(item: ClientTransaction): string {
  switch (item.transaction_type) {
    case 'transfer':
      item.sender.amount;
      item.holding_fees;
      // @ts-expect-error Transfer items do not expose notification details.
      item.details;
      return item.sender.party;
    case 'balance_change':
      item.receivers[0]?.amount;
      // @ts-expect-error Balance changes do not expose a transfer sender.
      item.sender;
      return item.event_id;
    case 'notification':
      item.details;
      // @ts-expect-error Notifications do not expose balance-change receivers.
      item.receivers;
      return item.details;
    case 'unknown':
      // @ts-expect-error Unknown items only expose the base transaction fields.
      item.details;
      return item.transaction_subtype.choice;
  }
}

// @ts-expect-error The generated request requires page_size.
const missingPageSize: ListTransactionsRequest = {};

// @ts-expect-error The generated cursor is a string.
const numericCursor: ListTransactionsRequest = { page_size: 1, begin_after_id: 123 };

const unsupportedBranch: ValidatorWalletTransaction = {
  // @ts-expect-error The generated response discriminator only allows the four documented branches.
  transaction_type: 'mint',
  transaction_subtype: { template_id: 'package:Module:AmuletRules', choice: 'Tap' },
  event_id: 'event-456',
  date: '2026-07-10T02:00:00Z',
};

void firstPage;
void followingPage;
void response;
void publicEventIds;
void narrowTransaction;
void missingPageSize;
void numericCursor;
void unsupportedBranch;
