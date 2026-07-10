import type {
  GetDateOfFirstSnapshotAfterParams,
  GetDateOfFirstSnapshotAfterResponse,
  ScanApiClient,
} from '../../src/clients/scan-api';

type ClientParams = Parameters<ScanApiClient['getDateOfFirstSnapshotAfter']>[0];
type ClientResponse = Awaited<ReturnType<ScanApiClient['getDateOfFirstSnapshotAfter']>>;

const params: GetDateOfFirstSnapshotAfterParams = {
  after: '2026-07-10T12:00:00Z',
  migrationId: 7,
};
const clientParams: ClientParams = params;
const response: GetDateOfFirstSnapshotAfterResponse = {
  record_time: '2026-07-10T12:00:01Z',
};
const clientResponse: ClientResponse = response;

// @ts-expect-error The generated query contract requires the migration id.
const missingMigrationId: ClientParams = { after: '2026-07-10T12:00:00Z' };

// @ts-expect-error The public client intentionally exposes camelCase rather than the wire query key.
const wireQueryName: ClientParams = { after: '2026-07-10T12:00:00Z', migration_id: 7 };

// @ts-expect-error The generated response contract requires record_time.
const missingRecordTime: ClientResponse = {};

// @ts-expect-error The generated response contract does not include additional envelope fields.
const extraResponseField: ClientResponse = { record_time: '2026-07-10T12:00:01Z', unexpected: true };

void clientParams;
void clientResponse;
void missingMigrationId;
void wireQueryName;
void missingRecordTime;
void extraResponseField;
