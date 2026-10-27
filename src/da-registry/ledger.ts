/**
 * The ledger operations a DA Registry workflow needs, behind a narrow port so flows can be tested with an in-memory
 * fake. `createDaRegistryLedger` implements the port on a {@link LedgerJsonApiClient} using the generic helpers from
 * `utils/ledger`, which are also exported directly for other consumers.
 *
 * Every call names its parties explicitly: a client's default party is typically the validator party, and falling back
 * to it would read or act as the wrong party.
 */
import { type LedgerJsonApiClient } from '../clients';
import {
  checkUserActAs,
  getActiveContractsByTemplate,
  getConnectedSynchronizerIds,
  getPreferredPackages,
  listUploadedPackageIds,
  submitLedgerCommands,
  uploadAndVetDar,
  type ActiveContract,
  type LedgerSubmission,
  type PreferredPackage,
  type SubmittedTransaction,
  type UserActAsStatus,
} from '../utils/ledger';

export interface DaRegistryLedger {
  /** Active contracts of these templates visible to `parties`, on the configured synchronizer only. */
  activeContracts: (parties: string[], templateIds: string[]) => Promise<ActiveContract[]>;
  submit: (submission: LedgerSubmission) => Promise<SubmittedTransaction>;
  /** The authenticated user's id, which of `parties` it cannot act as, and whether it may upload DARs. */
  checkActAs: (parties: string[]) => Promise<UserActAsStatus>;
  /** Ids of every package uploaded to this participant, vetted or not. */
  listPackageIds: () => Promise<string[]>;
  connectedSynchronizerIds: (party: string) => Promise<string[]>;
  /** The package version each name resolves to when every one of `parties` must have it vetted. */
  preferredPackages: (parties: string[], packageNames: string[], synchronizerId: string) => Promise<PreferredPackage[]>;
  uploadDar: (dar: Buffer, synchronizerId: string) => Promise<void>;
}

export function createDaRegistryLedger(
  client: LedgerJsonApiClient,
  options: { synchronizerId: string; packageIdSelectionPreference: string[] }
): DaRegistryLedger {
  return {
    activeContracts: async (parties, templateIds) =>
      getActiveContractsByTemplate(client, {
        parties,
        templateIds,
        synchronizerId: options.synchronizerId,
      }),
    submit: async (submission) =>
      submitLedgerCommands(client, submission, {
        synchronizerId: options.synchronizerId,
        packageIdSelectionPreference: options.packageIdSelectionPreference,
      }),
    checkActAs: async (parties) => checkUserActAs(client, parties),
    listPackageIds: async () => listUploadedPackageIds(client),
    connectedSynchronizerIds: async (party) => getConnectedSynchronizerIds(client, party),
    preferredPackages: async (parties, packageNames, synchronizerId) =>
      getPreferredPackages(client, { parties, packageNames, synchronizerId }),
    uploadDar: async (dar, synchronizerId) => uploadAndVetDar(client, { darFile: dar, synchronizerId }),
  };
}
