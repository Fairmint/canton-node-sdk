/**
 * ValidatorApiClient integration tests: Scan Proxy Operations
 *
 * Tests for the scan proxy endpoints exposed through the validator API.
 */

import { randomUUID } from 'node:crypto';
import { ApiError } from '../../../../src';
import type { components } from '../../../../src/generated/apps/validator/src/main/openapi/scan-proxy';
import { retry } from '../../../utils/testConfig';
import { getClient as getScanClient } from '../scan-api/setup';
import { ensureValidatorUserOnboarded, getClient, VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS } from './setup';

type Contract = components['schemas']['Contract'];
type ContractWithState = components['schemas']['ContractWithState'];
type TransferCommandStatusResponse = components['schemas']['LookupTransferCommandStatusResponse'];
type ForcedAcsSnapshotResponse = Awaited<ReturnType<ReturnType<typeof getScanClient>['forceAcsSnapshotNow']>>;
type HoldingsSummaryResponse = Awaited<ReturnType<ReturnType<typeof getClient>['getHoldingsSummaryAtV1']>>;
interface HoldingsSnapshotResult {
  snapshot: ForcedAcsSnapshotResponse;
  response: HoldingsSummaryResponse;
  summary: HoldingsSummaryResponse['summaries'][number];
}
interface SnapshotBoundarySelection {
  boundaryTime: string;
  selectedRecordTime: string;
}
interface StableHoldingsSelection {
  atOrBeforeResponse: HoldingsSummaryResponse;
  boundaryTime: string;
  exactResponse: HoldingsSummaryResponse;
  selectedRecordTime: string;
}

async function findNonSnapshotBoundary(
  scanClient: ReturnType<typeof getScanClient>,
  migrationId: number,
  snapshotTimeMs: number
): Promise<SnapshotBoundarySelection> {
  for (let offsetMs = 1; offsetMs <= 10; offsetMs += 1) {
    const boundaryTime = new Date(snapshotTimeMs + offsetMs).toISOString();
    const selectedSnapshot = await scanClient.getDateOfMostRecentSnapshotBefore({
      before: boundaryTime,
      migrationId,
    });

    if (Date.parse(selectedSnapshot.record_time) !== Date.parse(boundaryTime)) {
      return { boundaryTime, selectedRecordTime: selectedSnapshot.record_time };
    }
  }

  throw new Error('Could not find a non-snapshot boundary after the forced snapshot');
}

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

    const { status } = command;
    switch (status.status) {
      case 'created':
      case 'sent':
        break;
      case 'failed':
        expect(['failed', 'expired', 'withdrawn']).toContain(status.failure_kind);
        expect(status.reason).toEqual(expect.any(String));
        break;
      default: {
        const unsupportedStatus: never = status;
        throw new Error(`Unexpected transfer command status: ${JSON.stringify(unsupportedStatus)}`);
      }
    }
  }
}

function expectNotFound(error: unknown): void {
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(404);
}

function expectDecimalString(value: string): number {
  expect(value).not.toHaveLength(0);
  expect(value).toMatch(/^-?\d{1,28}(?:\.\d{1,10})?$/);
  const parsed = Number(value);
  expect(Number.isFinite(parsed)).toBe(true);
  return parsed;
}

describe('ValidatorApiClient / ScanProxy', () => {
  beforeAll(ensureValidatorUserOnboarded, VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS);

  test('getDsoPartyId returns DSO party ID', async () => {
    const client = getClient();

    const dsoResponse = await client.getDsoPartyId();

    expect(dsoResponse.dso_party_id).toBeDefined();
    expect(typeof dsoResponse.dso_party_id).toBe('string');
  });

  test('getDsoInfo returns the full current scan-proxy envelope', async (): Promise<void> => {
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

  test('getHoldingsSummaryAtV1 returns the exact typed snapshot selected by Scan', async (): Promise<void> => {
    const client = getClient();
    const scanClient = getScanClient();
    const userStatus = await client.getUserStatus();
    expect(userStatus.party_id).toEqual(expect.any(String));
    const ownerPartyIds = [userStatus.party_id];

    const tapResponse = await client.tap({
      amount: '10',
      command_id: `holdings-summary-${randomUUID()}`,
    });
    expect(tapResponse.contract_id).toEqual(expect.any(String));
    expect(tapResponse.contract_id).not.toHaveLength(0);

    const { snapshot, response, summary } = await retry(
      async (): Promise<HoldingsSnapshotResult> => {
        const forcedSnapshot = await scanClient.forceAcsSnapshotNow();
        const exactResponse = await client.getHoldingsSummaryAtV1({
          migration_id: forcedSnapshot.migration_id,
          record_time: forcedSnapshot.record_time,
          owner_party_ids: ownerPartyIds,
        });
        const partySummary = exactResponse.summaries.find((entry): boolean => entry.party_id === userStatus.party_id);
        if (partySummary === undefined) {
          throw new Error(`Forced snapshot ${forcedSnapshot.record_time} does not yet contain the tapped holding`);
        }
        return { snapshot: forcedSnapshot, response: exactResponse, summary: partySummary };
      },
      {
        timeoutMs: 120_000,
        pollIntervalMs: 2_000,
        description: 'forced Scan ACS snapshot containing the tapped holding',
      }
    );

    expect(response.migration_id).toBe(snapshot.migration_id);
    expect(response.record_time).toBe(snapshot.record_time);
    expect(Array.isArray(response.summaries)).toBe(true);
    expect(response.summaries.length).toBeGreaterThan(0);
    expect(summary.party_id).toBe(userStatus.party_id);
    expect(expectDecimalString(summary.total_coin_holdings)).toBeGreaterThan(0);
    for (const entrySummary of response.summaries) {
      expect(entrySummary.party_id).toBe(userStatus.party_id);
      for (const amount of [
        entrySummary.total_unlocked_coin,
        entrySummary.total_locked_coin,
        entrySummary.total_coin_holdings,
      ]) {
        expect(expectDecimalString(amount)).toBeGreaterThanOrEqual(0);
      }
    }

    const snapshotTime = Date.parse(snapshot.record_time);
    expect(Number.isNaN(snapshotTime)).toBe(false);
    const { atOrBeforeResponse, boundaryTime, exactResponse, selectedRecordTime } = await retry(
      async (): Promise<StableHoldingsSelection> => {
        const selectionBefore = await findNonSnapshotBoundary(scanClient, snapshot.migration_id, snapshotTime);
        const selectedExactResponse =
          selectionBefore.selectedRecordTime === response.record_time
            ? response
            : await client.getHoldingsSummaryAtV1({
                migration_id: snapshot.migration_id,
                record_time: selectionBefore.selectedRecordTime,
                owner_party_ids: ownerPartyIds,
              });
        const selectedAtOrBeforeResponse = await client.getHoldingsSummaryAtV1({
          migration_id: snapshot.migration_id,
          record_time: selectionBefore.boundaryTime,
          record_time_match: 'at_or_before',
          owner_party_ids: ownerPartyIds,
        });
        const selectionAfter = await scanClient.getDateOfMostRecentSnapshotBefore({
          before: selectionBefore.boundaryTime,
          migrationId: snapshot.migration_id,
        });

        if (
          selectionAfter.record_time !== selectionBefore.selectedRecordTime ||
          selectedAtOrBeforeResponse.record_time !== selectionBefore.selectedRecordTime
        ) {
          throw new Error(`Snapshot selection changed while validating ${selectionBefore.boundaryTime}`);
        }

        return {
          atOrBeforeResponse: selectedAtOrBeforeResponse,
          boundaryTime: selectionBefore.boundaryTime,
          exactResponse: selectedExactResponse,
          selectedRecordTime: selectionBefore.selectedRecordTime,
        };
      },
      {
        timeoutMs: 30_000,
        pollIntervalMs: 500,
        description: 'stable at-or-before Scan snapshot selection',
      }
    );

    const selectedSnapshotTime = Date.parse(selectedRecordTime);
    const boundarySnapshotTime = Date.parse(boundaryTime);
    expect(Number.isNaN(selectedSnapshotTime)).toBe(false);
    expect(Number.isNaN(boundarySnapshotTime)).toBe(false);
    expect(selectedSnapshotTime).toBeLessThan(boundarySnapshotTime);
    expect(atOrBeforeResponse.record_time).toBe(selectedRecordTime);
    expect(atOrBeforeResponse).toEqual(exactResponse);
  }, 180_000);

  test('listUnclaimedDevelopmentFundCoupons preserves the hyphenated response key and contract format', async (): Promise<void> => {
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

  test('lookupTransferCommandCounterByParty returns the generated contract envelope when seeded', async (): Promise<void> => {
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

  test('lookupTransferCommandStatus returns the generated status map when seeded', async (): Promise<void> => {
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
