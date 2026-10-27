/**
 * Typed Ledger API command builders for Digital Asset's Registry: provider and registrar onboarding, instrument
 * configuration, credentials, transfer preapprovals, minting and transfers.
 *
 * Names and argument shapes come from DA's published Daml models (bundle 0.14.4, see {@link DA_REGISTRY_PACKAGES}); DA's
 * terms make the source confidential, so nothing here copies it.
 */
import { type LedgerCommand } from '../utils/ledger';
import { buildTokenStandardV1TransferCommand, type TokenStandardV1Transfer } from '../utils/token-standard';
import { daRegistryExtraArgs } from './choice-context';
import { DA_REGISTRY_TEMPLATES, type DaRegistryTemplateKey } from './templates';
import { type ClaimSpec, type PartyCredentialRequirement, partySet } from './readers';

// ── Provider onboarding ─────────────────────────────────────────────────────────────────────────────────────────────

export function requestProviderService(operator: string, provider: string): LedgerCommand {
  return {
    CreateCommand: {
      templateId: DA_REGISTRY_TEMPLATES.providerServiceRequest,
      createArguments: { operator, provider },
    },
  };
}

export function createProviderConfiguration(providerServiceCid: string): LedgerCommand {
  return {
    ExerciseCommand: {
      templateId: DA_REGISTRY_TEMPLATES.providerService,
      contractId: providerServiceCid,
      choice: 'ProviderService_CreateProviderConfiguration',
      // No credential is needed to request a registrar seat; this provider serves only itself.
      choiceArgument: { registrarRequirements: [], holderRequirements: [] },
    },
  };
}

export function archiveAndCreateProviderConfiguration(providerServiceCid: string, cid: string): LedgerCommand {
  return {
    ExerciseCommand: {
      templateId: DA_REGISTRY_TEMPLATES.providerService,
      contractId: providerServiceCid,
      choice: 'ProviderService_ArchiveAndCreateProviderConfiguration',
      choiceArgument: { cid, payload: { registrarRequirements: [], holderRequirements: [] } },
    },
  };
}

// ── Registrar onboarding ────────────────────────────────────────────────────────────────────────────────────────────

/** Creates the registrar request and accepts it as provider in one transaction, when one party holds both roles. */
export function requestAndAcceptRegistrarService(
  operator: string,
  registrarAndProvider: string,
  providerConfigurationCid: string
): LedgerCommand {
  return {
    CreateAndExerciseCommand: {
      templateId: DA_REGISTRY_TEMPLATES.registrarServiceRequest,
      createArguments: {
        operator,
        provider: registrarAndProvider,
        registrar: registrarAndProvider,
        createTransferRule: true,
        createAllocationFactory: true,
      },
      choice: 'RegistrarServiceRequest_Accept',
      choiceArgument: { providerConfigurationCid, credentialCids: [] },
    },
  };
}

export function acceptRegistrarServiceRequest(requestCid: string, providerConfigurationCid: string): LedgerCommand {
  return {
    ExerciseCommand: {
      templateId: DA_REGISTRY_TEMPLATES.registrarServiceRequest,
      contractId: requestCid,
      choice: 'RegistrarServiceRequest_Accept',
      choiceArgument: { providerConfigurationCid, credentialCids: [] },
    },
  };
}

export function deleteRejectedRegistrarServiceRequest(cid: string): LedgerCommand {
  return {
    ExerciseCommand: {
      templateId: DA_REGISTRY_TEMPLATES.rejectedRegistrarServiceRequest,
      contractId: cid,
      choice: 'RejectedRegistrarServiceRequest_Delete',
      choiceArgument: {},
    },
  };
}

export function createTransferRule(registrarServiceCid: string): LedgerCommand {
  return {
    ExerciseCommand: {
      templateId: DA_REGISTRY_TEMPLATES.registrarService,
      contractId: registrarServiceCid,
      choice: 'RegistrarService_CreateTransferRule',
      choiceArgument: {},
    },
  };
}

export function createAllocationFactory(registrarServiceCid: string): LedgerCommand {
  return {
    ExerciseCommand: {
      templateId: DA_REGISTRY_TEMPLATES.registrarService,
      contractId: registrarServiceCid,
      choice: 'RegistrarService_CreateAllocationFactory',
      choiceArgument: {},
    },
  };
}

// ── Instrument configuration ────────────────────────────────────────────────────────────────────────────────────────

export interface InstrumentConfigurationPayload {
  instrumentId: string;
  /**
   * Additional `InstrumentIdentifier` records for the instrument, in DA's Daml JSON encoding (an identifier carries at
   * least `id` and `scheme`; `DA_REGISTRAR_INTERNAL_SCHEME` is the scheme for registrar-defined instruments). Empty
   * when the instrument has a single identifier.
   */
  additionalIdentifiers: Array<Record<string, unknown>>;
  issuerRequirements: PartyCredentialRequirement[];
  holderRequirements: PartyCredentialRequirement[];
  useBlockList: boolean;
}

export function createInstrumentConfiguration(
  registrarServiceCid: string,
  payload: InstrumentConfigurationPayload
): LedgerCommand {
  return {
    ExerciseCommand: {
      templateId: DA_REGISTRY_TEMPLATES.registrarService,
      contractId: registrarServiceCid,
      choice: 'RegistrarService_CreateInstrumentConfiguration',
      choiceArgument: { ...payload },
    },
  };
}

export function archiveAndCreateInstrumentConfiguration(
  registrarServiceCid: string,
  cid: string,
  payload: InstrumentConfigurationPayload
): LedgerCommand {
  return {
    ExerciseCommand: {
      templateId: DA_REGISTRY_TEMPLATES.registrarService,
      contractId: registrarServiceCid,
      choice: 'RegistrarService_ArchiveAndCreateInstrumentConfiguration',
      choiceArgument: { cid, payload },
    },
  };
}

export function archiveInstrumentConfiguration(registrarServiceCid: string, cid: string): LedgerCommand {
  return {
    ExerciseCommand: {
      templateId: DA_REGISTRY_TEMPLATES.registrarService,
      contractId: registrarServiceCid,
      choice: 'RegistrarService_ArchiveInstrumentConfiguration',
      choiceArgument: { cid },
    },
  };
}

// ── Transfer preapprovals ───────────────────────────────────────────────────────────────────────────────────────────

export function createTransferPreapproval(
  operator: string,
  receiver: string,
  instrumentAdmin: string,
  instrumentIds: string[]
): LedgerCommand {
  return {
    CreateCommand: {
      templateId: DA_REGISTRY_TEMPLATES.transferPreapproval,
      createArguments: {
        operator,
        receiver,
        instrumentAdmin,
        instrumentAllowances: instrumentIds.map((id) => ({ id })),
      },
    },
  };
}

// ── Credentials ───────────────────────────────────────────────────────────────────────────────────────────────────

export interface CredentialPayload {
  issuer: string;
  holder: string;
  id: string;
  description: string;
  validFrom: null;
  validUntil: string;
  claims: Array<{ subject: string; property: string; value: string }>;
  observers: ReturnType<typeof partySet>;
}

/**
 * An issuer-held credential: issuer and holder are both the registrar and the allowlisted party appears only as the
 * claims' subject, so it signs nothing. DA's operator observes it so DA's API can disclose it in choice contexts.
 */
export function issuerHeldCredential(params: {
  registrar: string;
  operator: string;
  subject: string;
  claims: ClaimSpec[];
  id: string;
  description: string;
  validUntil: string;
}): CredentialPayload {
  return {
    issuer: params.registrar,
    holder: params.registrar,
    id: params.id,
    description: params.description,
    // Unset: a not-yet-valid credential anywhere in a transaction's supplied set aborts it.
    validFrom: null,
    validUntil: params.validUntil,
    claims: params.claims.map((c) => ({ subject: params.subject, property: c.property, value: c.value })),
    observers: partySet([params.operator]),
  };
}

export function createCredential(payload: CredentialPayload): LedgerCommand {
  return { CreateCommand: { templateId: DA_REGISTRY_TEMPLATES.credential, createArguments: { ...payload } } };
}

/** The `Archive` choice every DA Registry template carries. */
export function archiveDaRegistryContract(templateKey: DaRegistryTemplateKey, contractId: string): LedgerCommand {
  return {
    ExerciseCommand: {
      templateId: DA_REGISTRY_TEMPLATES[templateKey],
      contractId,
      choice: 'Archive',
      choiceArgument: {},
    },
  };
}

// ── Minting ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface MintPayload {
  instrumentId: { admin: string; id: string };
  amount: string;
  holder: string;
  reference: string;
  requestedAt: string;
  executeBefore: string;
  meta: { values: Record<string, string> };
}

export function offerMint(
  allocationFactoryCid: string,
  admin: string,
  mint: MintPayload,
  context: { values: Record<string, unknown> }
): LedgerCommand {
  return {
    ExerciseCommand: {
      templateId: DA_REGISTRY_TEMPLATES.allocationFactory,
      contractId: allocationFactoryCid,
      choice: 'AllocationFactory_OfferMint',
      choiceArgument: { expectedAdmin: admin, mint, extraArgs: daRegistryExtraArgs(context) },
    },
  };
}

export function cancelMintOffer(mintOfferCid: string): LedgerCommand {
  return {
    ExerciseCommand: {
      templateId: DA_REGISTRY_TEMPLATES.mintOffer,
      contractId: mintOfferCid,
      choice: 'MintOffer_Cancel',
      choiceArgument: { extraArgs: null },
    },
  };
}

export function acceptMintOffer(mintOfferCid: string, context: { values: Record<string, unknown> }): LedgerCommand {
  return {
    ExerciseCommand: {
      templateId: DA_REGISTRY_TEMPLATES.mintOffer,
      contractId: mintOfferCid,
      choice: 'MintOffer_Accept',
      choiceArgument: { extraArgs: daRegistryExtraArgs(context) },
    },
  };
}

// ── Transfers ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A transfer through the registry's transfer factory (the Token Standard V1 `TransferFactory_Transfer` choice). The
 * factory contract id and its choice context come from DA's API (`transferFactory`); the builder itself is the
 * token-standard one, so the payload is validated the same way as any other Token Standard transfer.
 */
export function transferViaFactory(
  factoryCid: string,
  admin: string,
  transfer: TokenStandardV1Transfer,
  context: { values: Record<string, unknown> }
): LedgerCommand {
  return buildTokenStandardV1TransferCommand({
    transferFactoryContractId: factoryCid,
    expectedAdmin: admin,
    transfer,
    extraArgs: { context, meta: { values: {} } },
  });
}
