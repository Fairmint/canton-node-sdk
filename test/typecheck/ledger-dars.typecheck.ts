import {
  SynchronizerId,
  type LedgerJsonApiClient,
  type UploadDarParams,
  type UploadDarResponse,
  type ValidateDarParams,
  type ValidateDarResponse,
} from '../../src';

declare const client: LedgerJsonApiClient;

const validateParams = {
  darFile: Buffer.from('dar'),
  synchronizerId: SynchronizerId('sync::one'),
} satisfies ValidateDarParams;
const uploadParams = {
  darFile: Buffer.from('dar'),
  vetAllPackages: false,
} satisfies UploadDarParams;

const validation: Promise<ValidateDarResponse> = client.validateDar(validateParams);
const upload: Promise<UploadDarResponse> = client.uploadDar(uploadParams);
void validation;
void upload;

// @ts-expect-error File-system paths are not part of the exact DAR upload request contract.
void client.uploadDar({ filePath: '/tmp/package.dar' });

// @ts-expect-error The deprecated /v2/packages upload method is intentionally absent.
void client.uploadDarFile({ darFile: Buffer.from('dar') });

// @ts-expect-error DAR payloads must be Node.js Buffers.
void client.validateDar({ darFile: new Uint8Array([1, 2, 3]) });

// @ts-expect-error Synchronizer IDs must be deliberately branded after validation or trusted construction.
void client.validateDar({ darFile: Buffer.from('dar'), synchronizerId: 'sync::one' });

// @ts-expect-error Successful DAR upload responses cannot expose arbitrary properties.
const invalidResponse: UploadDarResponse = { packageId: 'unexpected' };
void invalidResponse;
