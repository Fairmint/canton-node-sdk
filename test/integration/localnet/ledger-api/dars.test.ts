/** End-to-end validation for the canonical Ledger JSON API DAR endpoints and wire formats. */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { ApiError } from '../../../../src';
import { getClient } from './setup';

const QUICKSTART_DARS_DIRECTORY = path.resolve(__dirname, '../../../..', 'libs/cn-quickstart/quickstart/daml/dars');
// A syntactically valid Canton unique identifier that LocalNet deliberately does not connect to.
const UNCONNECTED_SYNCHRONIZER_ID = 'dar_upload_e2e_unconnected::unused_namespace';

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

describe('LedgerJsonApiClient / DARs', () => {
  test('validates a Quickstart DAR without returning a response body', async () => {
    const client = getClient();
    const darFile = await readInstalledQuickstartDar();

    await expect(client.validateDar({ darFile })).resolves.toBeUndefined();
  }, 120_000);

  test('surfaces HTTP 400 for bytes that are not a DAR archive', async () => {
    const client = getClient();

    let failure: unknown;
    try {
      await client.validateDar({ darFile: Buffer.from('not-a-dar-archive') });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ApiError);
    const apiError = failure as ApiError;
    expect(apiError).toMatchObject({
      status: 400,
      context: { body: expect.stringMatching(/\S/u) },
    });
    expect(apiError.message).toContain('response body:');
  }, 120_000);

  test('reuploads an installed DAR without vetting or changing the package set', async () => {
    const client = getClient();
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
