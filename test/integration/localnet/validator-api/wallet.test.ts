/** ValidatorApiClient integration tests: Wallet Operations. */

import { randomUUID } from 'node:crypto';

import { type ValidatorWalletTransaction } from '../../../../src';
import { retry } from '../../../utils/testConfig';
import { getClient as getLedgerClient } from '../ledger-api/setup';
import { ensureValidatorUserOnboarded, getClient, VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS } from './setup';

const DAML_DECIMAL_PATTERN = /^-?\d{1,28}(?:\.\d{1,10})?$/;

function expectPartyAndAmount(value: { party: string; amount: string }): void {
  expect(value.party).toEqual(expect.any(String));
  expect(value.party).not.toHaveLength(0);
  expect(value.amount).toMatch(DAML_DECIMAL_PATTERN);
}

function expectTransactionWireShape(item: ValidatorWalletTransaction): void {
  expect(item.event_id).toEqual(expect.any(String));
  expect(item.event_id).not.toHaveLength(0);
  expect(Number.isNaN(Date.parse(item.date))).toBe(false);
  expect(item.transaction_subtype.template_id).toEqual(expect.any(String));
  expect(item.transaction_subtype.template_id).not.toHaveLength(0);
  expect(item.transaction_subtype.choice).toEqual(expect.any(String));
  expect(item.transaction_subtype.choice).not.toHaveLength(0);
  if (item.transaction_subtype.amulet_operation !== undefined) {
    expect(item.transaction_subtype.amulet_operation).toEqual(expect.any(String));
  }
  if (item.transaction_subtype.interface_id !== undefined) {
    expect(item.transaction_subtype.interface_id).toEqual(expect.any(String));
  }

  switch (item.transaction_type) {
    case 'transfer':
      expectPartyAndAmount(item.sender);
      item.receivers.forEach(expectPartyAndAmount);
      for (const amount of [
        item.holding_fees,
        item.app_rewards_used,
        item.validator_rewards_used,
        item.sv_rewards_used,
        item.development_fund_coupons_used,
      ]) {
        expect(amount).toMatch(DAML_DECIMAL_PATTERN);
      }
      if (item.transfer_instruction_amount !== undefined) {
        expect(item.transfer_instruction_amount).toMatch(DAML_DECIMAL_PATTERN);
      }
      for (const value of [item.transfer_instruction_receiver, item.transfer_instruction_cid, item.description]) {
        if (value !== undefined) {
          expect(value).toEqual(expect.any(String));
        }
      }
      break;
    case 'balance_change':
      expect(Array.isArray(item.receivers)).toBe(true);
      item.receivers.forEach(expectPartyAndAmount);
      if (item.transfer_instruction_cid !== undefined) {
        expect(item.transfer_instruction_cid).toEqual(expect.any(String));
      }
      break;
    case 'notification':
      expect(item.details).toEqual(expect.any(String));
      break;
    case 'unknown':
      break;
    default: {
      const unsupportedTransaction: never = item;
      const discriminator = (unsupportedTransaction as unknown as { transaction_type?: unknown }).transaction_type;
      throw new Error(`Unsupported wallet transaction discriminator: ${String(discriminator)}`);
    }
  }
}

describe('ValidatorApiClient / Wallet', () => {
  beforeAll(ensureValidatorUserOnboarded, VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS);

  test('getWalletBalance returns balance information', async () => {
    const client = getClient();
    const response = await client.getWalletBalance();

    expect(response).toBeDefined();
    // Balance might be 0 for new/empty wallets
    expect(response.effective_unlocked_qty).toBeDefined();
  });

  test('getUserStatus returns user status', async () => {
    const client = getClient();
    const response = await client.getUserStatus();

    expect(response).toBeDefined();
    expect(response.party_id).toBeDefined();
  });

  test('listTransactions validates tap history and cursor pagination end to end', async () => {
    const client = getClient();
    const ledgerClient = getLedgerClient();
    const userStatus = await client.getUserStatus();
    if (userStatus.party_id.length === 0) {
      throw new Error('Expected the onboarded wallet user to have a party id');
    }
    ledgerClient.setPartyId(userStatus.party_id);

    const tappedContractIds: string[] = [];
    for (const amount of ['10', '11']) {
      const commandId = `transaction-history-${randomUUID()}`;
      const response = await client.tap({ amount, command_id: commandId });
      tappedContractIds.push(response.contract_id);
    }
    expect(new Set(tappedContractIds).size).toBe(tappedContractIds.length);

    const tappedUpdateIds = await Promise.all(
      tappedContractIds.map(async (contractId) =>
        retry(
          async (): Promise<string> => {
            const contractEvents = await ledgerClient.getEventsByContractId({ contractId });
            const createdEvent = contractEvents.created?.createdEvent;
            if (createdEvent?.contractId !== contractId) {
              throw new Error(`Ledger creation event for tapped contract ${contractId} is not available yet`);
            }

            const transactionTree = await ledgerClient.getTransactionTreeByOffset({
              offset: String(createdEvent.offset),
            });
            return transactionTree.transaction.updateId;
          },
          {
            timeoutMs: 60_000,
            pollIntervalMs: 1_000,
            description: `ledger transaction that created tapped contract ${contractId}`,
          }
        )
      )
    );

    const newTapTransactions = await retry(
      async (): Promise<ValidatorWalletTransaction[]> => {
        const response = await client.listTransactions({ page_size: 1_000 });
        response.items.forEach(expectTransactionWireShape);
        const matchingTaps: Array<{ historyIndex: number; transaction: ValidatorWalletTransaction }> = [];
        const missingUpdateIds: string[] = [];
        for (const updateId of tappedUpdateIds) {
          const historyIndex = response.items.findIndex(
            (item): boolean =>
              item.transaction_type === 'balance_change' &&
              item.transaction_subtype.choice === 'AmuletRules_DevNet_Tap' &&
              item.event_id.startsWith(`#${updateId}:`)
          );
          const transaction = response.items[historyIndex];
          if (transaction === undefined) {
            missingUpdateIds.push(updateId);
          } else {
            matchingTaps.push({ historyIndex, transaction });
          }
        }
        if (missingUpdateIds.length > 0) {
          throw new Error(`Wallet history is missing tap updates: ${missingUpdateIds.join(', ')}`);
        }
        return matchingTaps
          .sort((left, right): number => left.historyIndex - right.historyIndex)
          .map(({ transaction }): ValidatorWalletTransaction => transaction);
      },
      {
        timeoutMs: 120_000,
        pollIntervalMs: 2_000,
        description: 'wallet transaction history containing both taps',
      }
    );

    for (const tap of newTapTransactions) {
      expect(tap.transaction_type).toBe('balance_change');
      if (tap.transaction_type !== 'balance_change') {
        throw new Error(`Expected a balance_change transaction, received ${tap.transaction_type}`);
      }
      expect(tap.receivers.length).toBeGreaterThan(0);
      tap.receivers.forEach(expectPartyAndAmount);
    }
    expect(new Set(newTapTransactions.map((tap): string => tap.event_id)).size).toBe(tappedUpdateIds.length);

    const firstPage = await client.listTransactions({ page_size: 1 });
    expect(firstPage.items).toHaveLength(1);
    const firstItem = firstPage.items[0];
    expect(firstItem).toBeDefined();
    if (firstItem !== undefined) {
      expectTransactionWireShape(firstItem);
    }

    // The full response is newest-first. Starting at its newer observed tap guarantees the other tap is reachable by
    // following the API cursor, while allowing unrelated transactions to appear between them.
    const newerTap = newTapTransactions[0];
    const olderTap = newTapTransactions[1];
    expect(newerTap).toBeDefined();
    expect(olderTap).toBeDefined();
    if (newerTap === undefined || olderTap === undefined) {
      throw new Error('Expected two newly observed tap transactions');
    }

    let cursor = newerTap.event_id;
    const paginatedEventIds = new Set<string>();
    for (let page = 0; page < 100 && !paginatedEventIds.has(olderTap.event_id); page += 1) {
      const response = await client.listTransactions({ page_size: 1, begin_after_id: cursor });
      expect(response.items.length).toBeLessThanOrEqual(1);
      const item = response.items[0];
      if (item === undefined) {
        break;
      }
      expectTransactionWireShape(item);
      expect(item.event_id).not.toBe(cursor);
      expect(paginatedEventIds.has(item.event_id)).toBe(false);
      paginatedEventIds.add(item.event_id);
      cursor = item.event_id;
    }
    expect(paginatedEventIds.has(olderTap.event_id)).toBe(true);
  }, 240_000);
});
