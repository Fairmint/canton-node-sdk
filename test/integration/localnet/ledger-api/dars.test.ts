/** End-to-end validation for the canonical Ledger JSON API DAR endpoints and wire formats. */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { ApiError, SynchronizerId } from '../../../../src';
import {
  getLocalnetNonAdminLedgerClient,
  getLocalnetParticipantAdminLedgerClient,
} from '../../../utils/localnetLedgerClients';

const QUICKSTART_DARS_DIRECTORY = path.resolve(__dirname, '../../../..', 'libs/cn-quickstart/quickstart/daml/dars');
const ABSENT_VALID_DAR_PATH = path.resolve(
  __dirname,
  '../../../..',
  'libs/splice/daml/dars/splice-token-test-dummy-holding-0.0.3.dar'
);
const ABSENT_VALID_DAR_MAIN_PACKAGE_ID = '26c72abb5a4b485e58f201021de6f9e525c85863fa115536f768d6ee138ef13e';
// A syntactically valid Canton unique identifier that LocalNet deliberately does not connect to.
const UNCONNECTED_SYNCHRONIZER_ID = SynchronizerId('dar_upload_e2e_unconnected::unused_namespace');

async function readInstalledQuickstartDar(): Promise<Buffer> {
  const filenames = (await readdir(QUICKSTART_DARS_DIRECTORY))
    .filter((filename) => /^splice-api-featured-app-v1-\d.*\.dar$/u.test(filename))
    .sort();
  const filename = filenames[filenames.length - 1];
  if (!filename) {
    throw new Error(`Could not find the installed Featured App API DAR in ${QUICKSTART_DARS_DIRECTORY}`);
  }
  return readFile(path.join(QUICKSTART_DARS_DIRECTORY, filename));
}

function expectInvalidDarFailure(failure: unknown): void {
  expect(failure).toBeInstanceOf(ApiError);
  const apiError = failure as ApiError;
  expect(apiError.status).toBe(400);

  // Canton 0.6.8 follows the pinned text/plain contract; newer Canton releases return a structured Canton error.
  if (apiError.context?.['code'] === 'INVALID_DAR') {
    expect(apiError.context).toMatchObject({ code: 'INVALID_DAR', cause: 'Dar file is corrupt' });
    expect(apiError.message).toContain('INVALID_DAR');
    return;
  }

  expect(apiError.context).toMatchObject({ body: expect.stringMatching(/\S/u) });
  expect(apiError.message).toContain('response body:');
}

describe('LedgerJsonApiClient / DARs', () => {
  test('validates a Quickstart DAR without returning a response body', async () => {
    const client = await getLocalnetParticipantAdminLedgerClient();
    const darFile = await readInstalledQuickstartDar();

    await expect(client.validateDar({ darFile })).resolves.toBeUndefined();
  }, 120_000);

  test('forwards the validation synchronizer ID to Canton', async () => {
    const client = await getLocalnetParticipantAdminLedgerClient();
    const darFile = await readInstalledQuickstartDar();

    await expect(client.validateDar({ darFile, synchronizerId: UNCONNECTED_SYNCHRONIZER_ID })).rejects.toMatchObject({
      context: { code: 'PACKAGE_SERVICE_NOT_CONNECTED_TO_SYNCHRONIZER' },
    });
  }, 120_000);

  test('validates a genuinely absent DAR without persisting any package', async () => {
    const client = await getLocalnetParticipantAdminLedgerClient();
    const darFile = await readFile(ABSENT_VALID_DAR_PATH);
    const packageIdsBefore = [...(await client.listPackages()).packageIds].sort();

    expect(packageIdsBefore).not.toContain(ABSENT_VALID_DAR_MAIN_PACKAGE_ID);
    await expect(client.validateDar({ darFile })).resolves.toBeUndefined();

    const packageIdsAfter = [...(await client.listPackages()).packageIds].sort();
    expect(packageIdsAfter).toEqual(packageIdsBefore);
    expect(packageIdsAfter).not.toContain(ABSENT_VALID_DAR_MAIN_PACKAGE_ID);
  }, 120_000);

  test('surfaces HTTP 400 for bytes that are not a DAR archive', async () => {
    const client = await getLocalnetParticipantAdminLedgerClient();

    let failure: unknown;
    try {
      await client.validateDar({ darFile: Buffer.from('not-a-dar-archive') });
    } catch (error) {
      failure = error;
    }

    expectInvalidDarFailure(failure);
  }, 120_000);

  test('rejects a malformed upload without changing the package set', async () => {
    const client = await getLocalnetParticipantAdminLedgerClient();
    const packageIdsBefore = [...(await client.listPackages()).packageIds].sort();

    let failure: unknown;
    try {
      await client.uploadDar({ darFile: Buffer.from('not-a-dar-archive') });
    } catch (error) {
      failure = error;
    }

    expectInvalidDarFailure(failure);

    const packageIdsAfter = [...(await client.listPackages()).packageIds].sort();
    expect(packageIdsAfter).toEqual(packageIdsBefore);
  }, 120_000);

  test('requires participant-admin authorization for validation and upload', async () => {
    const adminClient = await getLocalnetParticipantAdminLedgerClient();
    const nonAdminClient = await getLocalnetNonAdminLedgerClient();
    const darFile = await readInstalledQuickstartDar();
    const packageIdsBefore = [...(await adminClient.listPackages()).packageIds].sort();

    await expect(nonAdminClient.validateDar({ darFile })).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
    });
    await expect(nonAdminClient.uploadDar({ darFile })).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
    });

    const packageIdsAfter = [...(await adminClient.listPackages()).packageIds].sort();
    expect(packageIdsAfter).toEqual(packageIdsBefore);
  }, 120_000);

  test('repeatedly reuploads an installed DAR with server defaults without changing packages', async () => {
    const client = await getLocalnetParticipantAdminLedgerClient();
    const darFile = await readInstalledQuickstartDar();
    const packageIdsBefore = [...(await client.listPackages()).packageIds].sort();

    await expect(client.uploadDar({ darFile })).resolves.toEqual({});
    const packageIdsAfterFirstUpload = [...(await client.listPackages()).packageIds].sort();
    await expect(client.uploadDar({ darFile })).resolves.toEqual({});
    const packageIdsAfterSecondUpload = [...(await client.listPackages()).packageIds].sort();

    expect(packageIdsAfterFirstUpload).toEqual(packageIdsBefore);
    expect(packageIdsAfterSecondUpload).toEqual(packageIdsBefore);
  }, 120_000);

  test('reuploads an installed DAR without vetting or changing the package set', async () => {
    const client = await getLocalnetParticipantAdminLedgerClient();
    const darFile = await readInstalledQuickstartDar();
    const packageIdsBefore = [...(await client.listPackages()).packageIds].sort();

    let vettingFailure: unknown;
    try {
      await client.uploadDar({
        darFile,
        vetAllPackages: true,
        synchronizerId: UNCONNECTED_SYNCHRONIZER_ID,
      });
    } catch (error) {
      vettingFailure = error;
    }

    expect(vettingFailure).toBeInstanceOf(ApiError);
    expect(vettingFailure).toMatchObject({
      context: { code: 'PACKAGE_SERVICE_NOT_CONNECTED_TO_SYNCHRONIZER' },
    });

    const response = await client.uploadDar({
      darFile,
      vetAllPackages: false,
      synchronizerId: UNCONNECTED_SYNCHRONIZER_ID,
    });
    const packageIdsAfter = [...(await client.listPackages()).packageIds].sort();

    expect(Object.keys(response)).toEqual([]);
    expect(packageIdsAfter).toEqual(packageIdsBefore);
  }, 120_000);
});
