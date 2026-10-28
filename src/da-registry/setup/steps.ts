/**
 * The ordered setup steps for an instrument on Digital Asset's Registry, issued by one party in both of DA's roles,
 * provider and registrar.
 *
 * Each step reads the ledger as the registrar (or as the party it acts for) and compares it with the declared state.
 * Steps never cache contract ids between runs, so a network reset or a manual change is picked up on the next `plan`.
 */
import { type LedgerCommand, type LedgerSubmission, type ActiveContract } from '../../utils/ledger';
import { type TokenStandardV1Transfer } from '../../utils/token-standard';
import { DA_REGISTRY_CONTEXT_KEYS, mintChoiceContext } from '../choice-context';
import {
  acceptMintOffer,
  acceptRegistrarServiceRequest,
  archiveAndCreateInstrumentConfiguration,
  archiveAndCreateProviderConfiguration,
  archiveDaRegistryContract,
  archiveInstrumentConfiguration,
  cancelMintOffer,
  createAllocationFactory,
  createCredential,
  createInstrumentConfiguration,
  createProviderConfiguration,
  createTransferPreapproval,
  createTransferRule,
  deleteRejectedRegistrarServiceRequest,
  issuerHeldCredential,
  offerMint,
  requestAndAcceptRegistrarService,
  requestProviderService,
  transferViaFactory,
  type InstrumentConfigurationPayload,
} from '../commands';
import { type DaRegistryTransferFactoryWithContext } from '../api-client';
import {
  credentialRequirement,
  partySetMembers,
  readClaimTuple,
  readOptionalBool,
  readRequirements,
  sameRequirements,
  type ClaimSpec,
} from '../readers';
import { DA_REGISTRY_TEMPLATES, isDaRegistryTemplate, type DaRegistryTemplateKey } from '../templates';
import { formatDecimal, parseDecimal, sumDecimals, type ScaledDecimal } from './decimal';
import {
  DaRegistrySetupDependencyError,
  type DaRegistrySetupAction,
  type DaRegistrySetupConfig,
  type DaRegistrySetupContext,
  type DaRegistrySetupStep,
  type DaRegistrySetupStepAssessment,
} from './types';

/** The registrar's view of the registry contracts the steps read, loaded fresh for every assessment. */
interface RegistryState {
  byTemplate: (key: DaRegistryTemplateKey) => ActiveContract[];
}

const REGISTRY_TEMPLATE_KEYS: DaRegistryTemplateKey[] = [
  'providerServiceRequest',
  'providerService',
  'rejectedProviderServiceRequest',
  'providerConfiguration',
  'registrarServiceRequest',
  'registrarService',
  'rejectedRegistrarServiceRequest',
  'allocationFactory',
  'transferRule',
  'instrumentConfiguration',
  'credential',
  // The registrar signs every holding, so its view is the whole register.
  'holding',
  'mintOffer',
];

/** Mint offers the setup creates carry this prefix in `reference`; it never touches anyone else's. */
export const DA_REGISTRY_SETUP_MINT_REFERENCE_PREFIX = 'da-registry-setup';

/**
 * Every read of DA's templates first checks what it depends on, so the reading step is blocked on the earlier step
 * instead of printing commands for a state it cannot see:
 *
 * - Reads keep only contracts on the pinned synchronizer, so with a stale pin the registrar's contracts would look absent
 *   and every step would plan to recreate them; until the registrar is connected to it, the step is blocked on
 *   ledger-access.
 * - The ledger rejects a template filter for a package it does not have; until the pinned packages are on the registrar's
 *   node, the step is blocked on da-packages.
 */
async function requireReadableRegistry(ctx: DaRegistrySetupContext): Promise<void> {
  const { registrar, ledger } = ctx.config;
  const connected = await ctx.ledger.connectedSynchronizerIds(registrar.party);
  if (!connected.includes(ledger.synchronizerId)) {
    throw new DaRegistrySetupDependencyError(
      'ledger-access',
      `the registrar is not connected to ${ledger.synchronizerId}`
    );
  }
  const onNode = await ctx.ledger.listPackageIds();
  const missing = ctx.config.da.packages.required.filter((p) => !onNode.includes(p.packageId));
  if (missing.length > 0) {
    throw new DaRegistrySetupDependencyError(
      'da-packages',
      `missing on the registrar's node: ${missing.map((p) => p.name).join(', ')}`
    );
  }
}

/**
 * The registrar's view of the registry. Holdings are the whole register, which grows with every holder, so only the
 * steps that count them (supply, deliveries) read them; for the others `byTemplate('holding')` is empty.
 */
async function loadRegistryState(
  ctx: DaRegistrySetupContext,
  { holdings = false }: { holdings?: boolean } = {}
): Promise<RegistryState> {
  await requireReadableRegistry(ctx);
  const keys = REGISTRY_TEMPLATE_KEYS.filter((k) => holdings || k !== 'holding');
  const contracts = await ctx.ledger.activeContracts(
    [ctx.config.registrar.party],
    keys.map((k) => DA_REGISTRY_TEMPLATES[k])
  );
  return { byTemplate: (key) => contracts.filter((c) => isDaRegistryTemplate(c, key)) };
}

function field(contract: ActiveContract, name: string): unknown {
  return contract.createArgument[name];
}

function cids(contracts: ActiveContract[]): string {
  return contracts.map((c) => c.contractId).join(', ');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function submission(
  ctx: DaRegistrySetupContext,
  stepId: string,
  actAs: string,
  commands: LedgerCommand[]
): LedgerSubmission {
  return { commandIdPrefix: `da-registry-${ctx.config.network}-${stepId}`, actAs: [actAs], commands };
}

function blocked(summary: string, notes: string[] = []): DaRegistrySetupStepAssessment {
  return { status: 'blocked', summary, notes };
}

/** Blocked only until an earlier step is done. */
function needs(stepId: string, detail?: string): DaRegistrySetupStepAssessment {
  return { status: 'blocked', summary: `needs ${stepId}${detail ? `: ${detail}` : ''}`, dependency: true };
}

/** The contracts the registrar is party to as both provider and registrar, under the configured DA operator. */
function ownedByRegistrar(
  ctx: DaRegistrySetupContext,
  contracts: ActiveContract[],
  roles: Array<'provider' | 'registrar'>
): ActiveContract[] {
  const { party: registrar } = ctx.config.registrar;
  return contracts.filter(
    (c) => field(c, 'operator') === ctx.config.da.operatorParty && roles.every((role) => field(c, role) === registrar)
  );
}

// ── 1. Ledger access ────────────────────────────────────────────────────────────────────────────────────────────────

function ledgerAccessStep(ctx: DaRegistrySetupContext): DaRegistrySetupStep {
  const { config } = ctx;
  const ledgerUser = config.ledger.name ? `the ${config.ledger.name} ledger user` : 'the ledger user';
  return {
    id: 'ledger-access',
    title: 'The ledger user can act as the registrar on the configured synchronizer, under the configured DA operator',
    why: [
      `The registrar (${config.registrar.party}) signs every registry contract; ${ledgerUser}`,
      'must hold CanActAs for it and for every preapproval receiver in the config. DA publishes its operator',
      'party per network; a network reset changes it, and every contract names it.',
    ].join('\n'),
    async assess() {
      const actAsParties = [...new Set([config.registrar.party, ...config.preapprovals.map((p) => p.party)])];
      const [{ userId, missing }, connections, operator] = await Promise.all([
        ctx.ledger.checkActAs(actAsParties),
        Promise.all(actAsParties.map(async (party) => ctx.ledger.connectedSynchronizerIds(party))),
        ctx.da.operatorParty(),
      ]);
      const notes: string[] = [];
      if (missing.length > 0) notes.push(`user ${userId} lacks CanActAs for: ${missing.join(', ')}`);
      actAsParties.forEach((party, i) => {
        const connected = connections[i] ?? [];
        if (!connected.includes(config.ledger.synchronizerId)) {
          notes.push(
            `${party} is not connected to ${config.ledger.synchronizerId} (connected: ${connected.join(', ')})`
          );
        }
      });
      if (operator !== config.da.operatorParty) {
        notes.push(`DA's API reports operator ${operator}, but the config pins ${config.da.operatorParty}`);
      }
      const evidence = {
        ledgerUser: userId,
        synchronizer: config.ledger.synchronizerId,
        daOperator: operator,
      };
      if (notes.length > 0) return { status: 'blocked', summary: 'fix access or the config first', evidence, notes };
      return { status: 'done', summary: 'access, synchronizer and DA operator match the config', evidence };
    },
  };
}

// ── 2. DA packages ──────────────────────────────────────────────────────────────────────────────────────────────────

function packagesStep(ctx: DaRegistrySetupContext): DaRegistrySetupStep {
  const { config } = ctx;
  const { packages } = config.da;
  const pins = packages.required.map((p) => `${p.name} ${p.version}`).join(', ');
  return {
    id: 'da-packages',
    title: "DA's registry packages are on the registrar's node and vetted by the registrar's node and DA's",
    why: [
      `Every registry transaction needs DA's packages vetted by both confirming nodes. The config pins ${pins}.`,
      'Queued swaps (Token Standard V2) need the 0.14 bundle. The node operator uploads and vets DA’s packages;',
      'this setup only checks them and never uploads a DAR.',
    ].join('\n'),
    async assess() {
      const onNode = await ctx.ledger.listPackageIds();
      const evidence: Record<string, string> = {};
      const missing = packages.required.filter((p) => !onNode.includes(p.packageId));
      for (const req of packages.required) {
        evidence[req.name] =
          `${req.version} ${onNode.includes(req.packageId) ? 'on the registrar’s node' : 'missing on the registrar’s node'}`;
      }

      if (missing.length > 0) {
        return {
          ...blocked('packages missing on the registrar’s node; ask the node operator to upload DA’s bundle', [
            `missing: ${missing.map((p) => `${p.name} ${p.version} (${p.packageId.slice(0, 12)}…)`).join(', ')}`,
          ]),
          evidence,
        };
      }

      // On the registrar's node; now both nodes must vet exactly the pinned ids, which every submission prefers.
      let resolved: Array<{ packageName: string; packageId: string; packageVersion: string }>;
      try {
        resolved = await ctx.ledger.preferredPackages(
          [config.registrar.party, config.da.operatorParty],
          packages.required.map((p) => p.name),
          config.ledger.synchronizerId
        );
      } catch (error) {
        return {
          ...blocked('the registrar’s node and DA’s do not both vet the packages', [errorMessage(error)]),
          evidence,
        };
      }
      const mismatches = packages.required.filter(
        (req) => resolved.find((r) => r.packageName === req.name)?.packageId !== req.packageId
      );
      for (const req of packages.required) {
        const got = resolved.find((r) => r.packageName === req.name);
        if (got) evidence[req.name] = `${got.packageVersion} vetted by both (${got.packageId.slice(0, 12)}…)`;
      }
      if (mismatches.length > 0) {
        return {
          ...blocked('the packages both nodes vet differ from the config’s pins', [
            ...mismatches.map((req) => {
              const got = resolved.find((r) => r.packageName === req.name);
              return `${req.name}: both vet ${got ? `${got.packageVersion} (${got.packageId.slice(0, 12)}…)` : 'nothing'}, config pins ${req.version}`;
            }),
            'if DA’s node lacks the pinned version, ask DA; if both vet another bundle, upgrade @fairmint/canton-node-sdk to a release whose command builders target it, then update the pins in the config',
          ]),
          evidence,
        };
      }
      return { status: 'done', summary: 'the pinned packages are vetted by both nodes', evidence };
    },
  };
}

// ── 3. Provider service ─────────────────────────────────────────────────────────────────────────────────────────────

function providerServiceStep(ctx: DaRegistrySetupContext): DaRegistrySetupStep {
  const { config } = ctx;
  const registrar = config.registrar.party;
  const operator = config.da.operatorParty;
  return {
    id: 'provider-service',
    title: 'The registrar is a DA provider',
    why: [
      'DA licenses providers to run a registry; a registrar needs a provider. The registrar requests the service and',
      'DA’s operator accepts it: automatically on DevNet, after checking the commercial agreement and reward sharing',
      'on TestNet and MainNet.',
    ].join('\n'),
    awaitMs: config.da.providerApprovalTimeoutMinutes * 60_000,
    async assess() {
      const state = await loadRegistryState(ctx);
      const services = ownedByRegistrar(ctx, state.byTemplate('providerService'), ['provider']);
      if (services.length > 0) {
        return { status: 'done', summary: 'provider service exists', evidence: { providerService: cids(services) } };
      }
      const requests = ownedByRegistrar(ctx, state.byTemplate('providerServiceRequest'), ['provider']);
      if (requests.length > 0) {
        return {
          status: 'waiting',
          summary: 'waiting for DA’s operator to accept the provider request',
          evidence: { providerServiceRequest: cids(requests) },
        };
      }
      const rejected = state.byTemplate('rejectedProviderServiceRequest').filter((c) => {
        const request = field(c, 'request') as { provider?: string; operator?: string } | undefined;
        return request?.provider === registrar && request.operator === operator;
      });
      if (rejected.length > 0) {
        // The rejection is co-signed by DA's operator, so the registrar cannot clear it; a person takes it up with DA.
        const reasons = rejected.map((c) => String(field(c, 'reason')));
        return blocked('DA rejected the provider request', [
          `reason: ${reasons.join(' | ')}`,
          `cid: ${cids(rejected)}`,
        ]);
      }
      return {
        status: 'pending',
        summary: 'no provider service or request',
        actions: [
          {
            description: 'request the provider service from DA’s operator',
            submission: submission(ctx, 'provider-service', registrar, [requestProviderService(operator, registrar)]),
          },
        ],
      };
    },
  };
}

// ── 4. Provider configuration ───────────────────────────────────────────────────────────────────────────────────────

/** A provider configuration that lets the registrar accept its own registrar request with no credential. */
function hasNoRequirements(c: ActiveContract): boolean {
  return (
    readRequirements(field(c, 'registrarRequirements')).length === 0 &&
    readRequirements(field(c, 'holderRequirements')).length === 0
  );
}

function providerConfigurationStep(ctx: DaRegistrySetupContext): DaRegistrySetupStep {
  const registrar = ctx.config.registrar.party;
  return {
    id: 'provider-configuration',
    title: 'The registrar’s provider configuration requires no registrar credential',
    why: 'Accepting a registrar reads the provider configuration. The registrar serves only itself, so the lists are empty.',
    async assess() {
      const state = await loadRegistryState(ctx);
      const [service] = ownedByRegistrar(ctx, state.byTemplate('providerService'), ['provider']);
      if (!service) return needs('provider-service');
      const configs = ownedByRegistrar(ctx, state.byTemplate('providerConfiguration'), ['provider']);
      const matching = configs.filter(hasNoRequirements);
      if (matching.length > 0) {
        return { status: 'done', summary: 'configuration exists', evidence: { providerConfiguration: cids(matching) } };
      }
      const [current] = configs;
      const command = current
        ? archiveAndCreateProviderConfiguration(service.contractId, current.contractId)
        : createProviderConfiguration(service.contractId);
      return {
        status: 'pending',
        summary: current ? 'configuration has requirements; replace it' : 'no configuration',
        actions: [
          {
            description: current ? 'replace the provider configuration' : 'create the provider configuration',
            submission: submission(ctx, 'provider-configuration', registrar, [command]),
          },
        ],
      };
    },
  };
}

// ── 5. Registrar service ────────────────────────────────────────────────────────────────────────────────────────────

function registrarServiceStep(ctx: DaRegistrySetupContext): DaRegistrySetupStep {
  const { config } = ctx;
  const registrar = config.registrar.party;
  return {
    id: 'registrar-service',
    title: 'The registrar holds its own registrar service, with a transfer rule and an allocation factory',
    why: [
      'The registrar defines instruments, mints, burns and issues credentials. Accepting the request also creates',
      'the transfer rule every transfer runs through and the allocation factory mints and allocations use. The',
      'registrar requests and accepts in one transaction, as registrar and as provider.',
    ].join('\n'),
    async assess() {
      const state = await loadRegistryState(ctx);
      const providerConfig = ownedByRegistrar(ctx, state.byTemplate('providerConfiguration'), ['provider']).find(
        hasNoRequirements
      );
      const services = ownedByRegistrar(ctx, state.byTemplate('registrarService'), ['provider', 'registrar']);
      const rules = ownedByRegistrar(ctx, state.byTemplate('transferRule'), ['provider', 'registrar']);
      const factories = ownedByRegistrar(ctx, state.byTemplate('allocationFactory'), ['provider', 'registrar']);
      const [service] = services;

      if (service) {
        const evidence = {
          registrarService: cids(services),
          transferRule: rules.length > 0 ? cids(rules) : 'missing',
          allocationFactory: factories.length > 0 ? cids(factories) : 'missing',
        };
        const commands: LedgerCommand[] = [];
        if (rules.length === 0) commands.push(createTransferRule(service.contractId));
        if (factories.length === 0) commands.push(createAllocationFactory(service.contractId));
        if (commands.length === 0) return { status: 'done', summary: 'registrar service is complete', evidence };
        return {
          status: 'pending',
          summary: 'registrar service lacks its rule or factory',
          evidence,
          actions: [
            {
              description: 'create the missing transfer rule / allocation factory',
              submission: submission(ctx, 'registrar-service', registrar, commands),
            },
          ],
        };
      }

      if (!providerConfig) return needs('provider-configuration');
      const commands: LedgerCommand[] = [];
      for (const rejected of state.byTemplate('rejectedRegistrarServiceRequest')) {
        // A rejected request keeps the original request's fields under `request`; only its provider may delete it.
        const request = field(rejected, 'request') as
          { registrar?: string; provider?: string; operator?: string } | undefined;
        if (
          request?.registrar === registrar &&
          request.provider === registrar &&
          request.operator === config.da.operatorParty
        ) {
          commands.push(deleteRejectedRegistrarServiceRequest(rejected.contractId));
        }
      }
      const [pending] = ownedByRegistrar(ctx, state.byTemplate('registrarServiceRequest'), ['provider', 'registrar']);
      commands.push(
        pending
          ? acceptRegistrarServiceRequest(pending.contractId, providerConfig.contractId)
          : requestAndAcceptRegistrarService(config.da.operatorParty, registrar, providerConfig.contractId)
      );
      return {
        status: 'pending',
        summary: pending ? 'registrar request is pending; accept it' : 'no registrar service',
        actions: [
          {
            description: 'request the registrar service and accept it as provider',
            submission: submission(ctx, 'registrar-service', registrar, commands),
          },
        ],
      };
    },
  };
}

// ── 6. Instrument configuration ─────────────────────────────────────────────────────────────────────────────────────

/** The instrument configuration the declared state requires: the registrar's two claims, and the blocklist setting. */
export function desiredDaRegistryInstrumentConfiguration(
  config: DaRegistrySetupConfig
): InstrumentConfigurationPayload {
  const registrar = config.registrar.party;
  return {
    instrumentId: config.instrument.id,
    additionalIdentifiers: [],
    // Checked on the receiver of a mint and the holder of a burn.
    issuerRequirements: [credentialRequirement(registrar, config.instrument.claims.redemption)],
    // Checked on sender and receiver of every transfer, allocation and settlement.
    holderRequirements: [credentialRequirement(registrar, config.instrument.claims.transfer)],
    useBlockList: config.instrument.useBlockList,
  };
}

function instrumentMatches(contract: ActiveContract, payload: InstrumentConfigurationPayload): boolean {
  const blockList = readOptionalBool(field(contract, 'checkBlockList'));
  const additional = field(contract, 'additionalIdentifiers');
  return (
    sameRequirements(
      readRequirements(field(contract, 'issuerRequirements')),
      readRequirements(payload.issuerRequirements)
    ) &&
    sameRequirements(
      readRequirements(field(contract, 'holderRequirements')),
      readRequirements(payload.holderRequirements)
    ) &&
    (payload.useBlockList ? blockList === true : blockList !== true) &&
    (!Array.isArray(additional) || additional.length === 0)
  );
}

function instrumentConfigurations(ctx: DaRegistrySetupContext, state: RegistryState): ActiveContract[] {
  return ownedByRegistrar(ctx, state.byTemplate('instrumentConfiguration'), ['provider', 'registrar']).filter(
    (c) => (field(c, 'defaultIdentifier') as { id?: string } | undefined)?.id === ctx.config.instrument.id
  );
}

function instrumentStep(ctx: DaRegistrySetupContext): DaRegistrySetupStep {
  const { config } = ctx;
  const registrar = config.registrar.party;
  const { transfer, redemption } = config.instrument.claims;
  return {
    id: 'instrument-configuration',
    title: config.instrument.halted
      ? `The ${config.instrument.id} instrument is halted: no configuration exists`
      : `The ${config.instrument.id} instrument requires the registrar's credentials`,
    why: [
      `Holders need the transfer claim (${transfer.property}=${transfer.value}) to send or receive, and the`,
      `redemption claim (${redemption.property}=${redemption.value}) to receive a mint or burn, so a`,
      'redemption-only credential freezes trading but keeps redemption open. Blocklist:',
      `${config.instrument.useBlockList ? 'on' : 'off'}. Exactly one configuration may exist per instrument. While the`,
      'instrument is halted, none may exist, so nothing mints, burns, transfers or settles.',
    ].join('\n'),
    async assess() {
      const state = await loadRegistryState(ctx);
      const [service] = ownedByRegistrar(ctx, state.byTemplate('registrarService'), ['provider', 'registrar']);
      if (!service) return needs('registrar-service');
      const payload = desiredDaRegistryInstrumentConfiguration(config);
      const existing = instrumentConfigurations(ctx, state);
      if (config.instrument.halted) {
        if (existing.length === 0) return { status: 'done', summary: 'halted: no configuration' };
        return {
          status: 'pending',
          summary: 'halted: archive the configuration',
          evidence: { instrumentConfiguration: cids(existing) },
          actions: [
            {
              description: 'archive the instrument configuration (halted)',
              submission: submission(
                ctx,
                'instrument-configuration',
                registrar,
                existing.map((c) => archiveInstrumentConfiguration(service.contractId, c.contractId))
              ),
            },
          ],
        };
      }
      const matching = existing.filter((c) => instrumentMatches(c, payload));
      const [firstMatching] = matching;
      const [firstExisting] = existing;
      if (existing.length === 1 && matching.length === 1) {
        return {
          status: 'done',
          summary: 'configuration matches',
          evidence: { instrumentConfiguration: cids(matching) },
        };
      }
      const commands: LedgerCommand[] = [];
      let summary: string;
      if (!firstExisting) {
        summary = 'no configuration';
        commands.push(createInstrumentConfiguration(service.contractId, payload));
      } else {
        if (existing.some((c) => !instrumentMatches(c, payload)) && config.network !== 'devnet') {
          // Every holder's credential carries the old claims, so rewriting the requirements freezes them all at once.
          // That holds for any differing live configuration, even beside a matching one; only identical duplicates
          // are archived.
          return {
            ...blocked('the live configuration differs from the config; change it by hand, not by apply', [
              'rewriting the requirements freezes every holder whose credential carries the old claims',
              're-issue credentials with the new claims first, then rewrite the configuration deliberately',
            ]),
            evidence: { instrumentConfiguration: cids(existing) },
          };
        }
        // Keep one: a matching one if any, else replace the first. Archive the rest first, so one exists at a time.
        const keep = firstMatching ?? firstExisting;
        for (const extra of existing.filter((c) => c !== keep)) {
          commands.push(archiveInstrumentConfiguration(service.contractId, extra.contractId));
        }
        if (!firstMatching) {
          commands.push(archiveAndCreateInstrumentConfiguration(service.contractId, keep.contractId, payload));
        }
        summary = firstMatching
          ? `${existing.length} configurations; archive the extras`
          : 'configuration differs from the config';
      }
      return {
        status: 'pending',
        summary,
        evidence: existing.length > 0 ? { instrumentConfiguration: cids(existing) } : {},
        actions: [
          {
            description: 'converge the instrument configuration',
            submission: submission(ctx, 'instrument-configuration', registrar, commands),
          },
        ],
      };
    },
  };
}

// ── 7. Credentials (the allowlist) ──────────────────────────────────────────────────────────────────────────────────

interface CredentialView {
  contract: ActiveContract;
  subjects: string[];
  claims: Array<ClaimSpec & { subject: string }>;
  observers: string[];
  validFrom: string | null;
  validUntil: string | null;
}

function readCredential(contract: ActiveContract): CredentialView {
  const rawClaims = field(contract, 'claims');
  const claims = (Array.isArray(rawClaims) ? (rawClaims as unknown[]) : []).map((c) => {
    const claim = c as Record<string, unknown>;
    return { subject: String(claim['subject']), ...readClaimTuple(claim) };
  });
  const optionalTime = (value: unknown): string | null => (typeof value === 'string' ? value : null);
  return {
    contract,
    subjects: [...new Set(claims.map((c) => c.subject))],
    claims,
    observers: partySetMembers(field(contract, 'observers')),
    validFrom: optionalTime(field(contract, 'validFrom')),
    validUntil: optionalTime(field(contract, 'validUntil')),
  };
}

/** A claim's identity: structured, so no property or value text can make two different claims look alike. */
function claimKey(c: ClaimSpec): string {
  return JSON.stringify([c.property, c.value]);
}

/** A claim as operators read it. */
function claimLabel(c: ClaimSpec): string {
  return `${c.property}=${c.value}`;
}

/** A claim set's identity, independent of order. */
function claimSetKey(claims: readonly ClaimSpec[]): string {
  return JSON.stringify(claims.map(claimKey).sort());
}

function credentialsStep(ctx: DaRegistrySetupContext): DaRegistrySetupStep {
  const { config } = ctx;
  const registrar = config.registrar.party;
  return {
    id: 'credentials',
    title: `The ${config.instrument.id} allowlist matches the config`,
    why: [
      'One issuer-held credential per approved party: the registrar issues and holds it and names the party only in',
      'its claims, so the party signs nothing. DA’s operator observes it so DA’s API can disclose it in each choice',
      'context. Credentials are immutable, so every change archives and recreates, atomically per party. No personal',
      'data: every party to a transfer sees the credentials used in it.',
    ].join('\n'),
    async assess() {
      const validUntilMs = Date.parse(config.credentials.validUntil);
      const renewBy = ctx.now().getTime() + config.credentials.renewWithinDays * 86_400_000;
      if (validUntilMs <= renewBy) {
        return blocked(`credentials.validUntil ${config.credentials.validUntil} is within the renewal window`, [
          `set a validUntil after ${new Date(renewBy).toISOString()} in ${config.source ?? 'the config'}`,
        ]);
      }
      const state = await loadRegistryState(ctx);
      const managed = instrumentCredentials(ctx, state);
      const notes: string[] = [];
      const issuedViaApp = state
        .byTemplate('credential')
        .map(readCredential)
        .filter((v) => field(v.contract, 'issuer') === registrar && field(v.contract, 'holder') !== registrar);
      if (issuedViaApp.length > 0) {
        notes.push(`${issuedViaApp.length} registrar-issued credential(s) held by others are not managed here`);
      }

      const toArchive = new Set<string>();
      const actions: DaRegistrySetupAction[] = [];
      const evidence: Record<string, string> = {};
      const entries = new Map(config.credentials.parties.map((entry) => [entry.party, entry]));
      const instrumentClaimKeys = new Set(Object.values(config.instrument.claims).map(claimKey));
      const handled = new Set<string>();

      const desiredClaims = (party: string): ClaimSpec[] =>
        (entries.get(party)?.claims ?? []).map((kind) => config.instrument.claims[kind]);
      const label = (party: string): string => entries.get(party)?.label ?? party;
      // A credential the registrar issued but its subject holds satisfies the requirements too (the check is issuer and
      // claims, not holder), so one granting a claim the config withholds would leave that party allowed. A person
      // revokes it.
      const grantedElsewhere: string[] = [];
      const nowMs = ctx.now().getTime();
      // An expired credential grants nothing, so it cannot keep a removed party allowed.
      for (const view of issuedViaApp.filter((v) => v.validUntil === null || Date.parse(v.validUntil) > nowMs)) {
        for (const claim of view.claims.filter((c) => instrumentClaimKeys.has(claimKey(c)))) {
          const listedClaims = entries.has(claim.subject) ? desiredClaims(claim.subject).map(claimKey) : null;
          const withheld = listedClaims ? !listedClaims.includes(claimKey(claim)) : config.credentials.pruneUnlisted;
          if (withheld)
            grantedElsewhere.push(`${view.contract.contractId} gives ${claim.subject} ${claimLabel(claim)}`);
        }
      }
      if (grantedElsewhere.length > 0) {
        return blocked('a credential its holder holds grants a claim the config withholds', [
          ...grantedElsewhere,
          'revoke it with Credential_Revoke (actor: the registrar), or give the party that claim in the config',
        ]);
      }

      /**
       * Archiving a credential with other instruments' claims would revoke those too; a person splits it. On a
       * credential this setup issued (it carries the config's id), a claim whose value is this instrument's id is ours
       * even under an old property name, so renaming a claim retires the old credentials. Any other claim is not ours,
       * even if its value matches one of this instrument's claims (`true`, say).
       */
      const outOfScope = (view: CredentialView): ClaimSpec[] =>
        view.claims.filter(
          (c) =>
            !instrumentClaimKeys.has(claimKey(c)) &&
            !(field(view.contract, 'id') === config.credentials.id && c.value === config.instrument.id)
        );

      for (const entry of config.credentials.parties) {
        if (handled.has(entry.party)) continue;
        const desired = desiredClaims(entry.party);
        const desiredLabels = desired.map(claimLabel).sort();
        const existing = managed.filter((v) => v.subjects.includes(entry.party));
        const [current] = existing;
        const ok =
          current !== undefined &&
          existing.length === 1 &&
          current.subjects.length === 1 &&
          claimSetKey(current.claims) === claimSetKey(desired) &&
          field(current.contract, 'id') === config.credentials.id &&
          field(current.contract, 'description') === config.credentials.description &&
          current.observers.length === 1 &&
          current.observers[0] === config.da.operatorParty &&
          current.validFrom === null &&
          current.validUntil !== null &&
          Date.parse(current.validUntil) === validUntilMs;
        if (ok) {
          handled.add(entry.party);
          evidence[entry.label] = `${desiredLabels.join(' + ')} (${current.contract.contractId.slice(0, 16)}…)`;
          continue;
        }

        // Credentials shared between parties are replaced together: every credential naming any party in the group,
        // and every party those credentials name, in one transaction, so no party is left without one part-way.
        const group = new Set([entry.party]);
        const affected = new Map<string, CredentialView>();
        for (let grew = true; grew;) {
          grew = false;
          for (const view of managed) {
            if (affected.has(view.contract.contractId) || !view.subjects.some((subject) => group.has(subject))) {
              continue;
            }
            affected.set(view.contract.contractId, view);
            grew = true;
            for (const subject of view.subjects) group.add(subject);
          }
        }
        for (const view of affected.values()) {
          const foreign = outOfScope(view);
          if (foreign.length > 0) {
            return blocked(`${entry.label}'s credential also carries claims for other instruments`, [
              `credential ${view.contract.contractId} carries ${foreign.map(claimLabel).join(', ')}`,
              'split it by hand so this instrument’s claims stand alone',
            ]);
          }
        }
        const unlistedInGroup = [...group].filter((party) => !entries.has(party));
        if (unlistedInGroup.length > 0 && !config.credentials.pruneUnlisted) {
          // Archiving would silently freeze parties this config does not manage.
          return blocked(`${entry.label}'s credential also names unlisted parties`, [
            `shared credential(s) ${[...affected.keys()].join(', ')} name ${unlistedInGroup.join(', ')}`,
            'list those parties too, or revoke the shared credential by hand',
          ]);
        }

        const commands: LedgerCommand[] = [];
        for (const cid of affected.keys()) {
          toArchive.add(cid);
          commands.push(archiveDaRegistryContract('credential', cid));
        }
        const recreated = [...group].filter((party) => entries.has(party));
        for (const party of recreated) {
          handled.add(party);
          commands.push(
            createCredential(
              issuerHeldCredential({
                registrar,
                operator: config.da.operatorParty,
                subject: party,
                claims: desiredClaims(party),
                id: config.credentials.id,
                description: config.credentials.description,
                validUntil: config.credentials.validUntil,
              })
            )
          );
          evidence[label(party)] = affected.size === 0 ? 'missing' : 'differs from the config';
        }
        const who = recreated.map(label).join(', ');
        actions.push({
          description:
            affected.size === 0
              ? `issue the credential for ${who} (${desiredLabels.join(' + ')})`
              : `replace the credential(s) for ${who}${unlistedInGroup.length > 0 ? `, revoking unlisted ${unlistedInGroup.join(', ')}` : ''}`,
          submission: submission(ctx, 'credentials', registrar, commands),
        });
      }

      const unlisted = managed.filter(
        (v) => !toArchive.has(v.contract.contractId) && v.subjects.some((subject) => !entries.has(subject))
      );
      if (config.credentials.pruneUnlisted) {
        for (const view of unlisted) {
          const foreign = outOfScope(view);
          if (foreign.length > 0) {
            return blocked('an unlisted party’s credential also carries claims for other instruments', [
              `credential ${view.contract.contractId} carries ${foreign.map(claimLabel).join(', ')}`,
              'split it by hand so this instrument’s claims stand alone',
            ]);
          }
          toArchive.add(view.contract.contractId);
          actions.push({
            description: `revoke the credential naming unlisted ${view.subjects.join(', ')}`,
            submission: submission(ctx, 'credentials', registrar, [
              archiveDaRegistryContract('credential', view.contract.contractId),
            ]),
          });
        }
      } else if (unlisted.length > 0) {
        notes.push(`${unlisted.length} credential(s) name parties this config does not list; left in place`);
      }

      if (actions.length === 0) {
        return { status: 'done', summary: `${config.credentials.parties.length} credentials match`, evidence, notes };
      }
      return { status: 'pending', summary: `${actions.length} credential change(s)`, evidence, notes, actions };
    },
  };
}

// ── 8. Transfer preapprovals ────────────────────────────────────────────────────────────────────────────────────────

function preapprovalsStep(ctx: DaRegistrySetupContext): DaRegistrySetupStep {
  const { config } = ctx;
  const registrar = config.registrar.party;
  return {
    id: 'transfer-preapprovals',
    title: `Receivers we act for preapprove ${config.instrument.id}`,
    why: [
      'A transfer preapproval is a standing contract, created by the receiver, that accepts the instrument in',
      'advance, so a transfer lands in one step. The registrar’s is how withdrawals arrive; listed holders’ are how',
      'deliveries arrive. Only the receiver can create one, so receivers we do not act for create their own.',
    ].join('\n'),
    async assess() {
      await requireReadableRegistry(ctx);
      const actions: DaRegistrySetupAction[] = [];
      const evidence: Record<string, string> = {};
      for (const receiver of config.preapprovals) {
        const found = (
          await ctx.ledger.activeContracts([receiver.party], [DA_REGISTRY_TEMPLATES.transferPreapproval])
        ).filter((c) => {
          const allowances = field(c, 'instrumentAllowances');
          return (
            isDaRegistryTemplate(c, 'transferPreapproval') &&
            field(c, 'receiver') === receiver.party &&
            field(c, 'operator') === config.da.operatorParty &&
            field(c, 'instrumentAdmin') === registrar &&
            Array.isArray(allowances) &&
            (allowances.length === 0 ||
              allowances.some((a) => (a as { id?: string } | null)?.id === config.instrument.id))
          );
        });
        const [preapproval] = found;
        if (preapproval) {
          evidence[receiver.label] = `${preapproval.contractId.slice(0, 16)}…`;
          continue;
        }
        evidence[receiver.label] = 'missing';
        actions.push({
          description: `create the ${config.instrument.id} preapproval for ${receiver.label}`,
          submission: submission(ctx, 'transfer-preapprovals', receiver.party, [
            createTransferPreapproval(config.da.operatorParty, receiver.party, registrar, [config.instrument.id]),
          ]),
        });
      }
      if (actions.length === 0) return { status: 'done', summary: 'every listed receiver has one', evidence };
      return { status: 'pending', summary: `${actions.length} preapproval(s) missing`, evidence, actions };
    },
  };
}

// ── Shared reads for the token steps ────────────────────────────────────────────────────────────────────────────────

/** The one instrument configuration that matches the config, if the instrument step is done. */
function currentInstrumentConfiguration(ctx: DaRegistrySetupContext, state: RegistryState): ActiveContract | undefined {
  const payload = desiredDaRegistryInstrumentConfiguration(ctx.config);
  const existing = instrumentConfigurations(ctx, state);
  const [only] = existing;
  return existing.length === 1 && only && instrumentMatches(only, payload) ? only : undefined;
}

/**
 * Registrar-issued, registrar-held credentials for this instrument: those carrying one of its claims, and those
 * carrying the config's credential id, so a change to the claim names still retires the credentials issued under the
 * old ones.
 */
function instrumentCredentials(ctx: DaRegistrySetupContext, state: RegistryState): CredentialView[] {
  const registrar = ctx.config.registrar.party;
  const instrumentClaims = new Set(Object.values(ctx.config.instrument.claims).map(claimKey));
  return state
    .byTemplate('credential')
    .map(readCredential)
    .filter(
      (v) =>
        field(v.contract, 'issuer') === registrar &&
        field(v.contract, 'holder') === registrar &&
        (v.claims.some((c) => instrumentClaims.has(claimKey(c))) ||
          field(v.contract, 'id') === ctx.config.credentials.id)
    );
}

/** A credential that currently gives `party` the claim, or undefined. */
function credentialWithClaim(
  ctx: DaRegistrySetupContext,
  state: RegistryState,
  party: string,
  claim: ClaimSpec
): CredentialView | undefined {
  const now = ctx.now().getTime();
  return instrumentCredentials(ctx, state).find(
    (v) =>
      v.claims.some((c) => c.subject === party && claimKey(c) === claimKey(claim)) &&
      (v.validFrom === null || Date.parse(v.validFrom) <= now) &&
      (v.validUntil === null || Date.parse(v.validUntil) > now)
  );
}

interface HoldingView {
  contractId: string;
  owner: string;
  amount: ScaledDecimal;
  locked: boolean;
  /** `""` is the owner's basic account, the only one a preapproved transfer may land in. */
  label: string;
}

function instrumentHoldings(ctx: DaRegistrySetupContext, state: RegistryState): HoldingView[] {
  const registrar = ctx.config.registrar.party;
  return state
    .byTemplate('holding')
    .filter(
      (c) =>
        field(c, 'registrar') === registrar &&
        (field(c, 'instrument') as { id?: string } | undefined)?.id === ctx.config.instrument.id
    )
    .map((c) => {
      const label = field(c, 'label');
      return {
        contractId: c.contractId,
        owner: String(field(c, 'owner')),
        amount: parseDecimal(String(field(c, 'amount'))),
        locked: field(c, 'lock') != null,
        label: typeof label === 'string' ? label : '',
      };
    });
}

function sum(holdings: HoldingView[]): ScaledDecimal {
  return sumDecimals(holdings.map((h) => h.amount));
}

function isoOffset(ctx: DaRegistrySetupContext, offsetMs: number): string {
  return new Date(ctx.now().getTime() + offsetMs).toISOString();
}

// ── 9. Supply ───────────────────────────────────────────────────────────────────────────────────────────────────────

function supplyStep(ctx: DaRegistrySetupContext): DaRegistrySetupStep {
  const { config } = ctx;
  const registrar = config.registrar.party;
  const instrumentId = { admin: registrar, id: config.instrument.id };
  const target = config.supply ? parseDecimal(config.supply.total) : null;
  return {
    id: 'supply',
    title:
      target === null
        ? `${config.instrument.id} supply is not managed by this config`
        : `${config.instrument.id} supply is ${formatDecimal(target)}, minted to the registrar`,
    why: [
      'Test supply: the registrar mints to itself, then delivers it through holders’ preapprovals, so holders sign',
      'nothing for a deposit. Minting is an offer from the registrar as registrar, accepted by the registrar as',
      'holder: DA’s documented path, which checks the registrar’s redemption claim. Supply counts every holding,',
      'locked ones included, and apply mints back up to the total after test burns. The step never burns and touches',
      `only mint offers whose reference starts with "${DA_REGISTRY_SETUP_MINT_REFERENCE_PREFIX}". Where real mints`,
      'follow an off-ledger process, leave supply unset.',
    ].join('\n'),
    async assess() {
      const state = await loadRegistryState(ctx, { holdings: true });
      const supply = sum(instrumentHoldings(ctx, state));
      if (target === null) {
        return { status: 'done', summary: 'not managed here', evidence: { supply: formatDecimal(supply) } };
      }
      if (config.instrument.halted) {
        return { status: 'done', summary: 'instrument halted: no mints', evidence: { supply: formatDecimal(supply) } };
      }
      const configuration = currentInstrumentConfiguration(ctx, state);
      if (!configuration) return needs('instrument-configuration');
      const [factory] = ownedByRegistrar(ctx, state.byTemplate('allocationFactory'), ['provider', 'registrar']);
      if (!factory) return needs('registrar-service');
      const registrarCredential = credentialWithClaim(ctx, state, registrar, config.instrument.claims.redemption);
      if (!registrarCredential) return needs('credentials', 'the registrar has no valid redemption claim');

      const evidence = { supply: formatDecimal(supply), target: formatDecimal(target) };
      const context = mintChoiceContext(configuration.contractId, [registrarCredential.contract.contractId]);

      const [offer] = state.byTemplate('mintOffer').filter((c) => {
        const mint = field(c, 'mint') as
          { holder?: string; reference?: string; instrumentId?: { admin?: string; id?: string } } | undefined;
        return (
          mint?.holder === registrar &&
          mint.instrumentId?.admin === registrar &&
          mint.instrumentId.id === config.instrument.id &&
          typeof mint.reference === 'string' &&
          mint.reference.startsWith(DA_REGISTRY_SETUP_MINT_REFERENCE_PREFIX)
        );
      });
      if (offer) {
        // Finish (or clear) an offer a previous run left behind before offering more.
        const mint = field(offer, 'mint') as { amount: string; executeBefore: string };
        const expired = Date.parse(mint.executeBefore) <= ctx.now().getTime();
        const overshoots = supply + parseDecimal(mint.amount) > target;
        const cancel = expired || overshoots;
        return {
          status: 'pending',
          summary: cancel
            ? `cancel mint offer for ${mint.amount} (${expired ? 'expired' : 'would exceed the target'})`
            : `accept the outstanding mint offer for ${mint.amount}`,
          evidence: { ...evidence, mintOffer: offer.contractId },
          actions: [
            {
              description: cancel ? 'cancel the mint offer' : 'accept the mint offer as holder',
              submission: submission(ctx, 'supply', registrar, [
                cancel ? cancelMintOffer(offer.contractId) : acceptMintOffer(offer.contractId, context),
              ]),
            },
          ],
        };
      }

      if (supply === target) return { status: 'done', summary: `supply is ${formatDecimal(supply)}`, evidence };
      if (supply > target) {
        return {
          status: 'blocked',
          summary: `supply ${formatDecimal(supply)} exceeds the configured ${formatDecimal(target)}`,
          evidence,
          notes: ['reduce supply by redemption (burn), or raise supply.total in the config'],
        };
      }
      const amount = formatDecimal(target - supply);
      return {
        status: 'pending',
        summary: `mint ${amount} to the registrar`,
        evidence,
        actions: [
          {
            description: `offer a mint of ${amount} ${config.instrument.id} to the registrar (accepted next round)`,
            submission: submission(ctx, 'supply', registrar, [
              offerMint(
                factory.contractId,
                registrar,
                {
                  instrumentId,
                  amount,
                  holder: registrar,
                  reference: `${DA_REGISTRY_SETUP_MINT_REFERENCE_PREFIX} ${config.network}: supply to ${formatDecimal(target)}`,
                  // The factory requires requestedAt in the past by ledger time.
                  requestedAt: isoOffset(ctx, -60_000),
                  executeBefore: isoOffset(ctx, 72 * 3_600_000),
                  meta: { values: {} },
                },
                context
              ),
            ]),
          },
        ],
      };
    },
  };
}

// ── 10. DA's API serves the registry ────────────────────────────────────────────────────────────────────────────────

function display(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return value == null ? 'n/a' : JSON.stringify(value);
}

function daApiStep(ctx: DaRegistrySetupContext): DaRegistrySetupStep {
  const { config } = ctx;
  const registrar = config.registrar.party;
  return {
    id: 'da-api',
    title: `DA's API serves the registrar's registry, ${config.instrument.id} and every listed credential`,
    why: [
      'Wallets and venues fetch each transaction’s choice context from DA’s API, which finds only contracts DA’s',
      'operator observes. This read-only check asks for a mint-offer context per redemption-claim party and expects',
      'that party’s credential back, which confirms DA’s API resolves the registrar’s issuer-held credentials.',
    ].join('\n'),
    awaitMs: 3 * 60_000,
    async assess() {
      if (config.instrument.halted) return { status: 'done', summary: 'instrument halted: DA’s API not checked' };
      const state = await loadRegistryState(ctx);
      const configuration = currentInstrumentConfiguration(ctx, state);
      if (!configuration) return needs('instrument-configuration');
      const activeFactories = new Set(
        ownedByRegistrar(ctx, state.byTemplate('allocationFactory'), ['provider', 'registrar']).map((c) => c.contractId)
      );
      const [info, instrument] = await Promise.all([
        ctx.da.registryInfo(registrar),
        ctx.da.instrumentMetadata(registrar, config.instrument.id),
      ]);
      const evidence: Record<string, string> = {};
      const lagging: string[] = [];
      const notes: string[] = [];
      if (!info) lagging.push('DA does not know the registrar yet');
      else {
        const { supportedApis } = info;
        const apis = Object.keys(
          typeof supportedApis === 'object' && supportedApis !== null ? supportedApis : {}
        ).sort();
        evidence['supportedApis'] = apis.join(', ');
        if (!apis.includes('splice-api-token-transfer-instruction-v2')) {
          notes.push(
            'Token Standard V2 is not served: DA’s API does not list splice-api-token-transfer-instruction-v2 for the registrar; ask the node operator and DA whether the V2 packages are vetted'
          );
        }
      }
      if (!instrument) lagging.push(`DA does not know ${config.instrument.id} yet`);
      else evidence['totalSupply'] = display(instrument['totalSupply']);

      const transferOnly = config.credentials.parties.filter((p) => !p.claims.includes('redemption'));
      if (transferOnly.length > 0) {
        // DA serves transfer credentials only in a transfer or allocation context, which needs real holdings.
        notes.push(
          `not checked here (transfer claim only; checked when they first transact): ${transferOnly.map((p) => p.label).join(', ')}`
        );
      }
      if (lagging.length === 0) {
        for (const entry of config.credentials.parties.filter((p) => p.claims.includes('redemption'))) {
          const credential = credentialWithClaim(ctx, state, entry.party, config.instrument.claims.redemption);
          if (!credential) return needs('credentials', `${entry.label} has no valid redemption claim`);
          const offer = await ctx.da.mintOfferFactory(entry.party, { admin: registrar, id: config.instrument.id });
          if (!offer) {
            lagging.push(`${entry.label}: DA has not indexed the allocation factory or instrument yet`);
            continue;
          }
          // After registrar-service recreates an archived factory, DA can still serve the old one for a while.
          if (!activeFactories.has(offer.factoryId)) {
            lagging.push(`${entry.label}: DA serves allocation factory ${offer.factoryId}, which is not active`);
            continue;
          }
          // A context naming an archived configuration fails every transaction built on it, e.g. after a
          // useBlockList change replaced the configuration but not the credentials.
          const { values } = offer.choiceContext.choiceContextData;
          const servedConfiguration = (
            values[DA_REGISTRY_CONTEXT_KEYS.instrumentConfiguration] as { value?: string } | undefined
          )?.value;
          if (servedConfiguration !== configuration.contractId) {
            lagging.push(
              `${entry.label}: DA serves instrument configuration ${String(servedConfiguration)}, not ${configuration.contractId}`
            );
            continue;
          }
          const served = values[DA_REGISTRY_CONTEXT_KEYS.issuerCredentials] as
            { value?: Array<{ value?: string }> } | undefined;
          const servedCids = (served?.value ?? []).map((v) => v.value);
          if (servedCids.includes(credential.contract.contractId)) evidence[entry.label] = 'credential served';
          else {
            lagging.push(`${entry.label}: DA serves [${servedCids.join(', ')}], not ${credential.contract.contractId}`);
          }
        }
      }

      if (lagging.length > 0) {
        return {
          status: 'waiting',
          summary: 'DA’s API does not serve everything yet',
          evidence,
          notes: [...lagging, ...notes],
        };
      }
      return { status: 'done', summary: 'DA serves the registry, instrument and credentials', evidence, notes };
    },
  };
}

// ── 11. Deliveries ──────────────────────────────────────────────────────────────────────────────────────────────────

function deliveriesStep(ctx: DaRegistrySetupContext): DaRegistrySetupStep {
  const { config } = ctx;
  const registrar = config.registrar.party;
  return {
    id: 'deliveries',
    title: `Listed holders hold at least their ${config.instrument.id} seed balance`,
    why: [
      'Test deliveries: the registrar tops each listed holder up from its own holdings through the holder’s',
      'preapproval, the production deposit flow, with no holder signature. A holder that trades or redeems its',
      'seed is topped up again on the next apply. DA’s transfer-factory endpoint picks the factory; only a `direct`',
      'answer (the receiver’s preapproval) is submitted, never a two-step offer that would lock the registrar’s',
      'holding. One delivery per round, because each spends the change of the one before.',
    ].join('\n'),
    awaitMs: 3 * 60_000,
    async assess() {
      if (config.deliveries.length === 0) return { status: 'done', summary: 'no deliveries configured' };
      if (config.instrument.halted) return { status: 'done', summary: 'instrument halted: no deliveries' };
      const state = await loadRegistryState(ctx, { holdings: true });
      if (!currentInstrumentConfiguration(ctx, state)) return needs('instrument-configuration');
      const holdings = instrumentHoldings(ctx, state);
      // The registrar spends only its basic account (label ""), where every setup mint lands.
      const spendable = holdings
        .filter((h) => h.owner === registrar && !h.locked && h.label === '')
        .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
      const evidence: Record<string, string> = {};
      const managedReceivers = new Set(config.preapprovals.map((p) => p.party));
      const indexing: string[] = [];
      const holderActions: string[] = [];
      let next: DaRegistrySetupAction | undefined;
      let remaining = 0;

      for (const target of config.deliveries) {
        const balance = sum(holdings.filter((h) => h.owner === target.party));
        evidence[target.label] = `${formatDecimal(balance)} / ${target.minBalance}`;
        const deficit = parseDecimal(target.minBalance) - balance;
        if (deficit <= 0n) continue;
        if (next) {
          remaining++;
          continue;
        }
        const inputs: HoldingView[] = [];
        let selected = 0n;
        for (const h of spendable) {
          if (selected >= deficit) break;
          inputs.push(h);
          selected += h.amount;
        }
        if (selected < deficit) {
          return blocked(
            `the registrar holds ${formatDecimal(sum(spendable))} spendable, short of ${formatDecimal(deficit)} for ${target.label}`,
            ['raise supply.total or lower minBalance in the config']
          );
        }
        const transfer: TokenStandardV1Transfer = {
          sender: registrar,
          receiver: target.party,
          amount: formatDecimal(deficit),
          instrumentId: { admin: registrar, id: config.instrument.id },
          requestedAt: isoOffset(ctx, -60_000),
          executeBefore: isoOffset(ctx, 3_600_000),
          inputHoldingCids: inputs.map((h) => h.contractId),
          meta: {
            values: { 'splice.lfdecentralizedtrust.org/reason': `${DA_REGISTRY_SETUP_MINT_REFERENCE_PREFIX} delivery` },
          },
        };
        let factory: DaRegistryTransferFactoryWithContext;
        try {
          factory = await ctx.da.transferFactory(registrar, { ...transfer });
        } catch (error) {
          const message = errorMessage(error);
          if (/not found|archived/i.test(message)) {
            indexing.push(
              `${target.label}: DA has not indexed the registrar's holdings or instrument yet (${message})`
            );
            continue;
          }
          throw error;
        }
        const { factoryId } = factory;
        const factoryIsPreapproval = factory.choiceContext.disclosedContracts.some(
          (d) => d.contractId === factoryId && isDaRegistryTemplate(d, 'transferPreapproval')
        );
        if (factory.transferKind !== 'direct' || !factoryIsPreapproval) {
          // A preapproval the transfer-preapprovals step just created may not be indexed by DA yet; any other receiver
          // has to create its own.
          if (managedReceivers.has(target.party)) {
            indexing.push(`${target.label}: DA does not serve its ${config.instrument.id} preapproval yet`);
          } else {
            holderActions.push(
              `${target.label}: no ${config.instrument.id} preapproval (DA offers '${factory.transferKind}'); the holder must create one`
            );
          }
          continue;
        }
        next = {
          description: `deliver ${formatDecimal(deficit)} ${config.instrument.id} to ${target.label} through its preapproval`,
          submission: {
            ...submission(ctx, 'deliveries', registrar, [
              transferViaFactory(factoryId, registrar, transfer, factory.choiceContext.choiceContextData),
            ]),
            disclosedContracts: factory.choiceContext.disclosedContracts,
          },
        };
      }

      const notes = [
        ...indexing,
        ...holderActions,
        ...(remaining > 0 ? [`${remaining} more deliver(ies) follow in later rounds`] : []),
      ];
      if (next) return { status: 'pending', summary: 'deliveries outstanding', evidence, notes, actions: [next] };
      if (indexing.length > 0 || holderActions.length > 0) {
        // Polling helps only while DA's indexer catches up; a missing preapproval waits on the holder.
        return {
          status: 'waiting',
          summary: 'deliveries wait on holders or DA',
          evidence,
          notes,
          poll: indexing.length > 0,
        };
      }
      return { status: 'done', summary: 'every listed holder has its seed balance', evidence };
    },
  };
}

/**
 * The ordered steps that converge a ledger to `ctx.config`: ledger access, DA packages, provider service and
 * configuration, registrar service, instrument configuration, credentials (the allowlist), transfer preapprovals, test
 * supply, DA's API, and test deliveries. Run them with {@link runDaRegistrySetupSteps}.
 */
export function buildDaRegistrySetupSteps(ctx: DaRegistrySetupContext): DaRegistrySetupStep[] {
  return [
    ledgerAccessStep(ctx),
    packagesStep(ctx),
    providerServiceStep(ctx),
    providerConfigurationStep(ctx),
    registrarServiceStep(ctx),
    instrumentStep(ctx),
    credentialsStep(ctx),
    preapprovalsStep(ctx),
    supplyStep(ctx),
    daApiStep(ctx),
    deliveriesStep(ctx),
  ];
}
