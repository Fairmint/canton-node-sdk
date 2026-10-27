/**
 * Choice contexts for Digital Asset's Registry.
 *
 * The registry's transfer rule, factories and credentials are not visible to every submitter, so a transaction supplies
 * the contracts it references as a choice context (`extraArgs.context.values`) plus disclosed contracts fetched from
 * DA's off-ledger API (see `api-client.ts`).
 */

/** Keys of a DA Registry choice context (`extraArgs.context.values`). */
export const DA_REGISTRY_CONTEXT_KEYS = {
  instrumentConfiguration: 'utility.digitalasset.com/instrument-configuration',
  issuerCredentials: 'utility.digitalasset.com/issuer-credentials',
} as const;

/** Splice `ExtraArgs` with an empty `meta`. */
export function daRegistryExtraArgs(context: { values: Record<string, unknown> }): Record<string, unknown> {
  return { context, meta: { values: {} } };
}

/**
 * The context a registrar-side mint needs, built from the registrar's own contracts: the registrar signs the
 * configuration and its issuer-held credentials, so no disclosure or DA lookup is needed.
 */
export function mintChoiceContext(
  instrumentConfigurationCid: string,
  credentialCids: string[]
): { values: Record<string, unknown> } {
  return {
    values: {
      [DA_REGISTRY_CONTEXT_KEYS.instrumentConfiguration]: { tag: 'AV_ContractId', value: instrumentConfigurationCid },
      [DA_REGISTRY_CONTEXT_KEYS.issuerCredentials]: {
        tag: 'AV_List',
        value: credentialCids.map((cid) => ({ tag: 'AV_ContractId', value: cid })),
      },
    },
  };
}
