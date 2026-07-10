/** ScanApiClient integration tests: ACS snapshot timestamp boundaries. */

import { randomUUID } from 'node:crypto';

import { retry } from '../../../utils/testConfig';
import {
  ensureValidatorUserOnboarded,
  getClient as getValidatorClient,
  VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS,
} from '../validator-api/setup';
import { getClient } from './setup';

describe('ScanApiClient / Snapshot timestamps', (): void => {
  beforeAll(ensureValidatorUserOnboarded, VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS);

  test('selects the first distinct snapshot strictly after an exact record time', async (): Promise<void> => {
    const scanClient = getClient();
    const validatorClient = getValidatorClient();
    const firstSnapshot = await scanClient.forceAcsSnapshotNow();

    const tapResponse = await validatorClient.tap({
      amount: '1',
      command_id: `snapshot-after-${randomUUID()}`,
    });
    expect(tapResponse.contract_id).toEqual(expect.any(String));
    expect(tapResponse.contract_id).not.toHaveLength(0);

    const secondSnapshot = await retry(
      async () => {
        const candidate = await scanClient.forceAcsSnapshotNow();
        if (candidate.migration_id !== firstSnapshot.migration_id) {
          throw new Error(`Snapshot migration changed from ${firstSnapshot.migration_id} to ${candidate.migration_id}`);
        }
        if (candidate.record_time === firstSnapshot.record_time) {
          throw new Error(`Scan has not indexed the tapped update after ${firstSnapshot.record_time}`);
        }
        return candidate;
      },
      {
        timeoutMs: 120_000,
        pollIntervalMs: 1_000,
        description: 'a second forced snapshot containing the tapped ledger update',
      }
    );

    // Pass through the exact wire timestamp. Converting through Date would truncate its microseconds.
    const firstSnapshotAfter = await retry(
      async () => {
        const selected = await scanClient.getDateOfFirstSnapshotAfter({
          after: firstSnapshot.record_time,
          migrationId: firstSnapshot.migration_id,
        });
        if (selected.record_time !== secondSnapshot.record_time) {
          throw new Error(`Expected second snapshot ${secondSnapshot.record_time}, received ${selected.record_time}`);
        }
        return selected;
      },
      {
        timeoutMs: 30_000,
        pollIntervalMs: 500,
        description: 'the second snapshot to be selectable after the exact first record time',
      }
    );

    const secondSnapshotTimeMs = Date.parse(secondSnapshot.record_time);
    expect(Number.isNaN(secondSnapshotTimeMs)).toBe(false);

    const boundaryImmediatelyAfterSecond = new Date(secondSnapshotTimeMs + 1).toISOString();
    const mostRecentSnapshotBefore = await scanClient.getDateOfMostRecentSnapshotBefore({
      before: boundaryImmediatelyAfterSecond,
      migrationId: secondSnapshot.migration_id,
    });

    expect(firstSnapshotAfter.record_time).not.toBe(firstSnapshot.record_time);
    expect(firstSnapshotAfter).toEqual({ record_time: secondSnapshot.record_time });
    expect(mostRecentSnapshotBefore).toEqual(firstSnapshotAfter);
  }, 180_000);
});
