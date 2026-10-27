/**
 * The Digital Asset Registry DAR bundle this module's template ids, choices and argument shapes were checked against.
 *
 * DA's terms make the Daml source confidential, so nothing here copies it; these are the published package names,
 * versions and content-hash package ids of the bundle, which any participant can read back after an upload.
 *
 * Template ids in this module use the package-name form (`#<package-name>:<Module>:<Entity>`), which matches contracts
 * created under any version of the package. The pins below are for vetting checks: every confirming node must vet
 * exactly these package ids before package-name-form commands resolve to this bundle's code.
 */

/** One package of DA's Registry bundle: its name, the version this module supports, and its content-hash id. */
export interface DaRegistryPackageRequirement {
  name: string;
  version: string;
  packageId: string;
}

/** The bundle version whose Daml models this module was checked against. */
export const DA_REGISTRY_BUNDLE_VERSION = '0.14.4';

/** Every package of the 0.14.4 bundle, pinned by content-hash id. */
export const DA_REGISTRY_PACKAGES: readonly DaRegistryPackageRequirement[] = [
  {
    name: 'utility-registry-app-v0',
    version: '0.9.2',
    packageId: '1eddd268bdd50d6e262722bea799c9455da032b3f94489e589975151b274b8c0',
  },
  {
    name: 'utility-registry-v0',
    version: '0.8.2',
    packageId: '8c654487d9f5fb195fbcdd7b44cd8e365b1ea39c15ae62ce6c7a48343f1210dd',
  },
  {
    name: 'utility-registry-holding-v0',
    version: '0.3.2',
    packageId: '415a1ec96a9e2839453e9aa1c5c71b6511c008c79511cb6f873e0b7393fe3b92',
  },
  {
    name: 'utility-credential-v0',
    version: '0.1.2',
    packageId: '044be226f82e81609111569fb7253421cdb86b2bf0ecab781f46a58003e69574',
  },
];

/** Package ids of the 0.14.4 bundle, for `packageIdSelectionPreference` on command submissions. */
export const DA_REGISTRY_PACKAGE_IDS: readonly string[] = DA_REGISTRY_PACKAGES.map((p) => p.packageId);
