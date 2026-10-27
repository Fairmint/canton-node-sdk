import { type LedgerJsonApiClient } from '../../clients';
import { SynchronizerId } from '../../core';
import { type PreferredPackage } from './types';

/** Ids of every package uploaded to this participant, vetted or not. */
export async function listUploadedPackageIds(client: LedgerJsonApiClient): Promise<string[]> {
  const { packageIds } = await client.listPackages();
  return packageIds;
}

/**
 * The package version each name resolves to when every one of `parties` must have it vetted on `synchronizerId`.
 *
 * Use this to confirm that the packages a workflow needs (for example a DA Registry bundle) are vetted by all
 * confirming nodes before submitting package-name-form commands.
 */
export async function getPreferredPackages(
  client: LedgerJsonApiClient,
  params: { parties: string[]; packageNames: string[]; synchronizerId: string }
): Promise<PreferredPackage[]> {
  const { packageReferences } = await client.interactiveSubmissionGetPreferredPackages({
    packageVettingRequirements: params.packageNames.map((packageName) => ({
      parties: params.parties,
      packageName,
    })),
    synchronizerId: params.synchronizerId,
  });
  return packageReferences;
}

/** Uploads a DAR and vets every package in it on the given synchronizer. */
export async function uploadAndVetDar(
  client: LedgerJsonApiClient,
  params: { darFile: Buffer; synchronizerId: string }
): Promise<void> {
  await client.uploadDar({
    darFile: params.darFile,
    vetAllPackages: true,
    synchronizerId: SynchronizerId(params.synchronizerId),
  });
}
