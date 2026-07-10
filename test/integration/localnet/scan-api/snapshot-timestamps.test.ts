/** ScanApiClient integration tests: ACS snapshot timestamp boundaries. */

import { retry } from '../../../utils/testConfig';
import { getClient } from './setup';

describe('ScanApiClient / Snapshot timestamps', (): void => {
  test('selects the forced snapshot exactly from both sides of its timestamp', async (): Promise<void> => {
    const client = getClient();
    const forcedSnapshot = await client.forceAcsSnapshotNow();
    const snapshotTimeMs = Date.parse(forcedSnapshot.record_time);

    expect(Number.isNaN(snapshotTimeMs)).toBe(false);

    const boundaryImmediatelyBefore = new Date(snapshotTimeMs - 1).toISOString();
    const boundaryImmediatelyAfter = new Date(snapshotTimeMs + 1).toISOString();
    const firstSnapshotAfter = await retry(
      async () => {
        const selected = await client.getDateOfFirstSnapshotAfter({
          after: boundaryImmediatelyBefore,
          migrationId: forcedSnapshot.migration_id,
        });
        if (selected.record_time !== forcedSnapshot.record_time) {
          throw new Error(`Expected forced snapshot ${forcedSnapshot.record_time}, received ${selected.record_time}`);
        }
        return selected;
      },
      {
        timeoutMs: 30_000,
        pollIntervalMs: 500,
        description: 'forced snapshot to be selectable after its lower boundary',
      }
    );
    const mostRecentSnapshotBefore = await client.getDateOfMostRecentSnapshotBefore({
      before: boundaryImmediatelyAfter,
      migrationId: forcedSnapshot.migration_id,
    });

    expect(Date.parse(boundaryImmediatelyBefore)).toBeLessThan(snapshotTimeMs);
    expect(Date.parse(boundaryImmediatelyAfter)).toBeGreaterThan(snapshotTimeMs);
    expect(firstSnapshotAfter).toEqual({ record_time: forcedSnapshot.record_time });
    expect(mostRecentSnapshotBefore).toEqual(firstSnapshotAfter);
  });
});
