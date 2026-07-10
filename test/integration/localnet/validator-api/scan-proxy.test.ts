/**
 * ValidatorApiClient integration tests: Scan Proxy Operations
 *
 * Tests for the scan proxy endpoints exposed through the validator API.
 */

import { ApiError } from '../../../../src';
import type { components } from '../../../../src/generated/apps/validator/src/main/openapi/scan-proxy';
import { retry } from '../../../utils/testConfig';
import { ensureValidatorUserOnboarded, getClient, VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS } from './setup';

type Contract = components['schemas']['Contract'];
type ContractWithState = components['schemas']['ContractWithState'];
type TransferCommandStatusResponse = components['schemas']['LookupTransferCommandStatusResponse'];

function expectContract(contract: Contract): void {
  expect(contract.template_id).toEqual(expect.any(String));
  expect(contract.contract_id).toEqual(expect.any(String));
  expect(contract.payload).toEqual(expect.any(Object));
  expect(contract.created_event_blob).toEqual(expect.any(String));
  expect(contract.created_at).toEqual(expect.any(String));
  expect(contract.template_id.length).toBeGreaterThan(0);
  expect(contract.contract_id.length).toBeGreaterThan(0);
  expect(Number.isNaN(Date.parse(contract.created_at))).toBe(false);
}

function expectContractWithState(contractWithState: ContractWithState): void {
  expectContract(contractWithState.contract);
  if (contractWithState.domain_id !== undefined) {
    expect(contractWithState.domain_id).toEqual(expect.any(String));
  }
}

function expectTransferCommandStatuses(response: TransferCommandStatusResponse): void {
  expect(response.transfer_commands_by_contract_id).toEqual(expect.any(Object));

  for (const [contractId, command] of Object.entries(response.transfer_commands_by_contract_id)) {
    expect(contractId.length).toBeGreaterThan(0);
    expectContract(command.contract);

    switch (command.status.status) {
      case 'created':
      case 'sent':
        break;
      case 'failed':
        expect(['failed', 'expired', 'withdrawn']).toContain(command.status.failure_kind);
        expect(command.status.reason).toEqual(expect.any(String));
        break;
    }
  }
}

function expectNotFound(error: unknown): void {
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(404);
}

describe('ValidatorApiClient / ScanProxy', () => {
  beforeAll(ensureValidatorUserOnboarded, VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS);

  test('getDsoPartyId returns DSO party ID', async () => {
    const client = getClient();

    const dsoResponse = await client.getDsoPartyId();

    expect(dsoResponse.dso_party_id).toBeDefined();
    expect(typeof dsoResponse.dso_party_id).toBe('string');
  });

  test('getDsoInfo returns the full current scan-proxy envelope', async () => {
    const client = getClient();

    const [response, dsoParty] = await Promise.all([client.getDsoInfo(), client.getDsoPartyId()]);

    expect(response.sv_user).toEqual(expect.any(String));
    expect(response.sv_party_id).toEqual(expect.any(String));
    expect(response.dso_party_id).toBe(dsoParty.dso_party_id);
    expect(response.voting_threshold).toEqual(expect.any(Number));
    expect(response.voting_threshold).toBeGreaterThan(0);
    expectContractWithState(response.latest_mining_round);
    expectContractWithState(response.amulet_rules);
    expectContractWithState(response.dso_rules);
    expect(Array.isArray(response.sv_node_states)).toBe(true);
    expect(response.sv_node_states.length).toBeGreaterThan(0);
    response.sv_node_states.forEach(expectContractWithState);
    if (response.initial_round !== undefined) {
      expect(response.initial_round).toEqual(expect.any(String));
    }
  });

  test('getHoldingsSummaryAtV1 returns a typed snapshot for the onboarded validator party', async () => {
    const client = getClient();
    const userStatus = await client.getUserStatus();
    expect(userStatus.party_id).toEqual(expect.any(String));
    const ownerPartyIds = [userStatus.party_id];

    const requestedAt = new Date().toISOString();
    const response = await retry(
      async () =>
        client.getHoldingsSummaryAtV1({
          migration_id: 0,
          record_time: requestedAt,
          record_time_match: 'at_or_before',
          owner_party_ids: ownerPartyIds,
        }),
      {
        timeoutMs: 45_000,
        pollIntervalMs: 2_000,
        description: 'validator scan-proxy v1 holdings summary',
      }
    );

    expect(response.migration_id).toBe(0);
    expect(Number.isNaN(Date.parse(response.record_time))).toBe(false);
    expect(Date.parse(response.record_time)).toBeLessThanOrEqual(Date.parse(requestedAt));
    expect(Array.isArray(response.summaries)).toBe(true);
    for (const summary of response.summaries) {
      expect(summary.party_id).toBe(userStatus.party_id);
      for (const amount of [summary.total_unlocked_coin, summary.total_locked_coin, summary.total_coin_holdings]) {
        expect(amount).toEqual(expect.any(String));
        expect(Number.isFinite(Number(amount))).toBe(true);
      }
    }

    await expect(
      client.getHoldingsSummaryAtV1({
        migration_id: 0,
        record_time: response.record_time,
        owner_party_ids: ownerPartyIds,
      })
    ).resolves.toEqual(response);
  });

  test('listUnclaimedDevelopmentFundCoupons preserves the hyphenated response key and contract format', async () => {
    const client = getClient();

    const response = await client.listUnclaimedDevelopmentFundCoupons();
    const coupons = response['unclaimed-development-fund-coupons'];

    expect(Object.keys(response)).toContain('unclaimed-development-fund-coupons');
    expect(Array.isArray(coupons)).toBe(true);
    coupons.forEach(expectContractWithState);
  });

  test('lookupTransferPreapprovalByParty returns error for non-existent party', async () => {
    const client = getClient();

    await expect(
      client.lookupTransferPreapprovalByParty({
        partyId: 'non-existent-party-id',
      })
    ).rejects.toThrow();
  });

  test('lookupTransferCommandCounterByParty returns error for non-existent party', async () => {
    const client = getClient();

    await expect(
      client.lookupTransferCommandCounterByParty({
        party: 'non-existent-party-id',
      })
    ).rejects.toThrow();
  });

  test('lookupTransferCommandCounterByParty returns the generated contract envelope when seeded', async () => {
    const client = getClient();
    const userStatus = await client.getUserStatus();
    expect(userStatus.party_id).toEqual(expect.any(String));

    try {
      const response = await client.lookupTransferCommandCounterByParty({ party: userStatus.party_id });
      expectContractWithState(response.transfer_command_counter);

      const { nextNonce } = response.transfer_command_counter.contract.payload;
      expect(
        (typeof nextNonce === 'number' && Number.isSafeInteger(nextNonce) && nextNonce >= 0) ||
          (typeof nextNonce === 'string' && /^(?:0|[1-9]\d*)$/.test(nextNonce))
      ).toBe(true);
    } catch (error) {
      // A fresh LocalNet wallet is allowed to have no TransferCommandCounter yet.
      expectNotFound(error);
    }
  });

  test('lookupTransferCommandStatus returns error for non-existent command', async () => {
    const client = getClient();

    await expect(
      client.lookupTransferCommandStatus({
        sender: 'non-existent-sender',
        nonce: 0,
      })
    ).rejects.toThrow();
  });

  test('lookupTransferCommandStatus returns the generated status map when seeded', async () => {
    const client = getClient();
    const userStatus = await client.getUserStatus();
    expect(userStatus.party_id).toEqual(expect.any(String));

    try {
      const response = await client.lookupTransferCommandStatus({
        sender: userStatus.party_id,
        nonce: 0,
      });
      expectTransferCommandStatuses(response);
    } catch (error) {
      // A fresh LocalNet wallet is allowed to have no TransferCommand for nonce zero.
      expectNotFound(error);
    }
  });

  test('getOpenAndIssuingMiningRounds returns mining rounds', async () => {
    const client = getClient();

    const rounds = await client.getOpenAndIssuingMiningRounds();

    expect(rounds.open_mining_rounds).toBeDefined();
    expect(Array.isArray(rounds.open_mining_rounds)).toBe(true);
  });

  test('lookupFeaturedAppRight returns error for non-existent provider', async () => {
    const client = getClient();

    await expect(
      client.lookupFeaturedAppRight({
        partyId: 'non-existent-provider',
      })
    ).rejects.toThrow();
  });
});
