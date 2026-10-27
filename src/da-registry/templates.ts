/**
 * Template ids of Digital Asset's Registry (DAR bundle 0.14.4, see {@link DA_REGISTRY_BUNDLE_VERSION}).
 *
 * Names come from DA's published Daml models; DA's terms make the source confidential, so nothing here copies it.
 *
 * Templates use the package-name form (`#<package-name>:<Module>:<Entity>`), so a filter also matches contracts created
 * under older versions of a package and each participant picks the version both sides vet.
 */
import { type ActiveContract } from '../utils/ledger';

export const DA_REGISTRY_TEMPLATES = {
  providerServiceRequest: '#utility-registry-app-v0:Utility.Registry.App.V0.Service.Provider:ProviderServiceRequest',
  providerService: '#utility-registry-app-v0:Utility.Registry.App.V0.Service.Provider:ProviderService',
  rejectedProviderServiceRequest:
    '#utility-registry-app-v0:Utility.Registry.App.V0.Service.Provider:RejectedProviderServiceRequest',
  providerConfiguration:
    '#utility-registry-app-v0:Utility.Registry.App.V0.Configuration.Provider:ProviderConfiguration',
  registrarServiceRequest: '#utility-registry-app-v0:Utility.Registry.App.V0.Service.Registrar:RegistrarServiceRequest',
  registrarService: '#utility-registry-app-v0:Utility.Registry.App.V0.Service.Registrar:RegistrarService',
  rejectedRegistrarServiceRequest:
    '#utility-registry-app-v0:Utility.Registry.App.V0.Service.Registrar:RejectedRegistrarServiceRequest',
  allocationFactory: '#utility-registry-app-v0:Utility.Registry.App.V0.Service.AllocationFactory:AllocationFactory',
  transferPreapproval: '#utility-registry-app-v0:Utility.Registry.App.V0.Model.TransferPreapproval:TransferPreapproval',
  instrumentConfiguration: '#utility-registry-v0:Utility.Registry.V0.Configuration.Instrument:InstrumentConfiguration',
  transferRule: '#utility-registry-v0:Utility.Registry.V0.Rule.Transfer:TransferRule',
  credential: '#utility-credential-v0:Utility.Credential.V0.Credential:Credential',
  holding: '#utility-registry-holding-v0:Utility.Registry.Holding.V0.Holding:Holding',
  // The `utility-registry-v0` `Holding.Mint` templates of the same name are legacy and disabled; use these.
  mintOffer: '#utility-registry-app-v0:Utility.Registry.App.V0.Model.Mint:MintOffer',
} as const;

export type DaRegistryTemplateKey = keyof typeof DA_REGISTRY_TEMPLATES;

/** `#pkg:Mod:Ent` → `:Mod:Ent`, to match a contract read back in package-id form against any package version. */
function qualifiedNameSuffix(template: string): string {
  return template.slice(template.indexOf(':'));
}

/**
 * Whether a contract read from the ledger (package-id form) is an instance of a DA Registry template, regardless of the
 * package version it was created under.
 */
export function isDaRegistryTemplate(
  contract: Pick<ActiveContract, 'templateId'>,
  key: DaRegistryTemplateKey
): boolean {
  return contract.templateId.endsWith(qualifiedNameSuffix(DA_REGISTRY_TEMPLATES[key]));
}
