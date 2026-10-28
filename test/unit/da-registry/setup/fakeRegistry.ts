/**
 * An in-memory simulator of the ledger and of DA's Registry API, implementing the `DaRegistryLedger` and
 * `DaRegistryApi` ports the setup steps use. It is a helper module, not a test.
 *
 * - The ACS holds contracts in package-id form (`<packageId>:<Module>:<Entity>`), as the JSON Ledger API returns them,
 *   and answers package-name filters (`#<package-name>:<Module>:<Entity>`), as the steps query them.
 * - Visibility is by stakeholder: the registrar sees the registry contracts, holdings, credentials and mint offers; a
 *   receiver sees its own transfer preapproval.
 * - `submit` applies exactly the commands the steps build, atomically, checking the submitter's authority, and throws on
 *   anything else. Every submission is recorded, including ones that fail.
 *
 * Template ids, choice names and context keys are spelled out here rather than imported from the SDK's `da-registry`
 * module, so a typo there makes the simulator reject the command instead of agreeing with it.
 */
import {
  type DaRegistryApi,
  type DaRegistryFactoryWithContext,
  type DaRegistryInstrumentId,
  type DaRegistryLedger,
  type DaRegistrySetupConfig,
  type DaRegistryTransferFactoryWithContext,
} from '../../../../src/da-registry';
import {
  type ActiveContract,
  type CreatedContract,
  type DisclosedContract,
  type LedgerCommand,
  type LedgerSubmission,
  type PreferredPackage,
  type SubmittedTransaction,
} from '../../../../src/utils/ledger';
import { Amount } from './amount';

export const PACKAGE_IDS = {
  'utility-registry-app-v0': '1eddd268bdd50d6e262722bea799c9455da032b3f94489e589975151b274b8c0',
  'utility-registry-v0': '8c654487d9f5fb195fbcdd7b44cd8e365b1ea39c15ae62ce6c7a48343f1210dd',
  'utility-registry-holding-v0': '415a1ec96a9e2839453e9aa1c5c71b6511c008c79511cb6f873e0b7393fe3b92',
  'utility-credential-v0': '044be226f82e81609111569fb7253421cdb86b2bf0ecab781f46a58003e69574',
} as const;

type PackageName = keyof typeof PACKAGE_IDS;

const TEMPLATE_NAMES = {
  providerServiceRequest: [
    'utility-registry-app-v0',
    'Utility.Registry.App.V0.Service.Provider:ProviderServiceRequest',
  ],
  providerService: ['utility-registry-app-v0', 'Utility.Registry.App.V0.Service.Provider:ProviderService'],
  rejectedProviderServiceRequest: [
    'utility-registry-app-v0',
    'Utility.Registry.App.V0.Service.Provider:RejectedProviderServiceRequest',
  ],
  providerConfiguration: [
    'utility-registry-app-v0',
    'Utility.Registry.App.V0.Configuration.Provider:ProviderConfiguration',
  ],
  registrarServiceRequest: [
    'utility-registry-app-v0',
    'Utility.Registry.App.V0.Service.Registrar:RegistrarServiceRequest',
  ],
  registrarService: ['utility-registry-app-v0', 'Utility.Registry.App.V0.Service.Registrar:RegistrarService'],
  rejectedRegistrarServiceRequest: [
    'utility-registry-app-v0',
    'Utility.Registry.App.V0.Service.Registrar:RejectedRegistrarServiceRequest',
  ],
  allocationFactory: ['utility-registry-app-v0', 'Utility.Registry.App.V0.Service.AllocationFactory:AllocationFactory'],
  transferPreapproval: [
    'utility-registry-app-v0',
    'Utility.Registry.App.V0.Model.TransferPreapproval:TransferPreapproval',
  ],
  instrumentConfiguration: [
    'utility-registry-v0',
    'Utility.Registry.V0.Configuration.Instrument:InstrumentConfiguration',
  ],
  transferRule: ['utility-registry-v0', 'Utility.Registry.V0.Rule.Transfer:TransferRule'],
  credential: ['utility-credential-v0', 'Utility.Credential.V0.Credential:Credential'],
  holding: ['utility-registry-holding-v0', 'Utility.Registry.Holding.V0.Holding:Holding'],
  mintOffer: ['utility-registry-app-v0', 'Utility.Registry.App.V0.Model.Mint:MintOffer'],
} as const satisfies Record<string, readonly [PackageName, string]>;

export type SimTemplate = keyof typeof TEMPLATE_NAMES;

const TRANSFER_FACTORY_INTERFACE =
  '#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferFactory';
const INSTRUMENT_CONFIGURATION_KEY = 'utility.digitalasset.com/instrument-configuration';
const ISSUER_CREDENTIALS_KEY = 'utility.digitalasset.com/issuer-credentials';
const REGISTRAR_INTERNAL_SCHEME = 'RegistrarInternalScheme';

export const SUPPORTED_APIS_WITH_V2 = {
  'splice-api-token-metadata-v1': 1,
  'splice-api-token-holding-v1': 1,
  'splice-api-token-transfer-instruction-v1': 1,
  'splice-api-token-allocation-v1': 1,
  'splice-api-token-transfer-instruction-v2': 1,
};

/** `#utility-registry-app-v0:Mod:Ent`, the form the steps query and submit with. */
export function packageNameTemplateId(key: SimTemplate): string {
  const [pkg, name] = TEMPLATE_NAMES[key];
  return `#${pkg}:${name}`;
}

/** `1eddd268…:Mod:Ent`, the form the ledger and DA's API return. */
export function packageIdTemplateId(key: SimTemplate): string {
  const [pkg, name] = TEMPLATE_NAMES[key];
  return `${PACKAGE_IDS[pkg]}:${name}`;
}

function templateKeyOf(templateId: string): SimTemplate | undefined {
  return (Object.keys(TEMPLATE_NAMES) as SimTemplate[]).find((key) => packageNameTemplateId(key) === templateId);
}

/** `create Credential`, `ProviderService.ProviderService_CreateProviderConfiguration`, … for compact assertions. */
export function commandLabel(command: LedgerCommand): string {
  const entity = (templateId: string): string => templateId.split(':').pop() ?? templateId;
  if ('CreateCommand' in command) return `create ${entity(command.CreateCommand.templateId)}`;
  if ('CreateAndExerciseCommand' in command) {
    const c = command.CreateAndExerciseCommand;
    return `createAndExercise ${entity(c.templateId)}.${c.choice}`;
  }
  return `${entity(command.ExerciseCommand.templateId)}.${command.ExerciseCommand.choice}`;
}

export function submissionLabels(submissions: LedgerSubmission[]): string[] {
  return submissions.flatMap((s) => s.commands.map(commandLabel));
}

type Args = Record<string, unknown>;

interface SimContract {
  key: SimTemplate;
  contractId: string;
  createArgument: Args;
  stakeholders: string[];
  createdEventBlob: string;
}

interface Requirement {
  issuer: string;
  requiredClaims: Array<{ _1: string; _2: string }>;
}

interface CredentialClaim {
  subject: string;
  property: string;
  value: string;
}

interface Tx {
  submission: LedgerSubmission;
  created: CreatedContract[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function fail(message: string): never {
  throw new Error(`fake ledger: ${message}`);
}

function isRecord(value: unknown): value is Args {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, what: string): Args {
  return isRecord(value) ? value : fail(`${what} must be a record, got ${JSON.stringify(value)}`);
}

function str(value: unknown, what: string): string {
  return typeof value === 'string' && value !== '' ? value : fail(`${what} must be a non-empty string`);
}

function time(value: unknown, what: string): number {
  const ms = Date.parse(str(value, what));
  return Number.isNaN(ms) ? fail(`${what} is not a timestamp`) : ms;
}

function positiveAmount(value: unknown, what: string): Amount {
  let amount: Amount;
  try {
    amount = Amount.of(str(value, what));
  } catch {
    return fail(`${what} must be a positive decimal`);
  }
  return amount.isPositive() ? amount : fail(`${what} must be a positive decimal`);
}

function setMembers(value: unknown, what: string): string[] {
  const { map } = record(value, what);
  if (!Array.isArray(map)) fail(`${what} must be a DA.Set ({ map: [[party, {}]] })`);
  return map.map((entry, i) => {
    if (!Array.isArray(entry) || entry.length !== 2 || !isRecord(entry[1]))
      fail(`${what}.map[${i}] must be [party, {}]`);
    return str(entry[0], `${what}.map[${i}][0]`);
  });
}

/** The JSON Ledger API encodes a Daml `(Text, Text)` as `{ _1, _2 }` and rejects any other field. */
function requirements(value: unknown, what: string): Requirement[] {
  if (!Array.isArray(value)) fail(`${what} must be a list`);
  return value.map((entry, i) => {
    const r = record(entry, `${what}[${i}]`);
    const claims = r['requiredClaims'];
    if (!Array.isArray(claims)) fail(`${what}[${i}].requiredClaims must be a list`);
    return {
      issuer: str(r['issuer'], `${what}[${i}].issuer`),
      requiredClaims: claims.map((claim, j) => {
        const tuple = record(claim, `${what}[${i}].requiredClaims[${j}]`);
        const keys = Object.keys(tuple).sort().join(',');
        if (keys !== '_1,_2')
          fail(`${what}[${i}].requiredClaims[${j}] must be a (Text, Text) tuple {_1,_2}, got {${keys}}`);
        return { _1: str(tuple['_1'], 'tuple._1'), _2: str(tuple['_2'], 'tuple._2') };
      }),
    };
  });
}

function extraArgsValues(value: unknown, what: string): Args {
  const extra = record(value, what);
  record(record(extra['meta'], `${what}.meta`)['values'], `${what}.meta.values`);
  return record(record(extra['context'], `${what}.context`)['values'], `${what}.context.values`);
}

function stakeholdersOf(key: SimTemplate, arg: Args): string[] {
  const parties: unknown[] = ['operator', 'provider', 'registrar', 'issuer', 'holder', 'owner', 'receiver'].map(
    (name) => arg[name]
  );
  if (key === 'credential') parties.push(...setMembers(arg['observers'], 'observers'));
  if (key === 'mintOffer') {
    const mint = arg['mint'] as { holder?: unknown; instrumentId?: { admin?: unknown } } | undefined;
    parties.push(mint?.holder, mint?.instrumentId?.admin);
  }
  if (isRecord(arg['request']))
    parties.push(arg['request']['operator'], arg['request']['provider'], arg['request']['registrar']);
  return [...new Set(parties.filter((p): p is string => typeof p === 'string'))];
}

export interface FakeRegistryOptions {
  operator: string;
  synchronizerId: string;
  now: () => Date;
  /** Parties the ledger user holds CanActAs for. */
  actAs: string[];
  /** What preferred-packages resolves (both nodes vet these). */
  vetted: PreferredPackage[];
}

export class FakeRegistry {
  /** Every submission, in order, including ones the simulator rejected. */
  readonly submissions: LedgerSubmission[] = [];
  readonly uploadedDars: Array<{ bytes: Buffer; synchronizerId: string }> = [];
  readonly daCalls: Array<{ method: keyof DaRegistryApi; args: unknown[] }> = [];

  readonly userId = 'setup-user';
  actAsRights: Set<string>;
  connectedSynchronizers: string[];
  /** What preferred-packages resolves for both nodes. */
  vettedPackages: PreferredPackage[];
  /** Package ids uploaded to the registrar's node (listPackageIds). */
  packagesOnNode: string[];
  /** Whether the ledger user holds ParticipantAdmin; the SDK port reports it, and the setup never needs it. */
  participantAdmin = true;
  /** What DA's API reports as its operator. */
  daOperator: string;
  supportedApis: Record<string, number> = { ...SUPPORTED_APIS_WITH_V2 };
  /** DA has not indexed the registry yet: metadata and mint-offer lookups 404 (null). */
  daLagging = false;
  /** Only the mint-offer lookup 404s (null), e.g. DA has not indexed the allocation factory. */
  mintOfferLagging = false;
  /** Thrown by DA's transfer-factory endpoint when set. */
  transferFactoryError?: Error;

  readonly ledger: DaRegistryLedger;
  readonly da: DaRegistryApi;

  private acs = new Map<string, SimContract>();
  private nextContract = 1;
  private nextUpdate = 1;

  constructor(private readonly options: FakeRegistryOptions) {
    this.actAsRights = new Set(options.actAs);
    this.connectedSynchronizers = [options.synchronizerId];
    this.vettedPackages = options.vetted.map((p) => ({ ...p }));
    this.packagesOnNode = options.vetted.map((p) => p.packageId);
    this.daOperator = options.operator;
    this.ledger = this.createLedger();
    this.da = this.createDa();
  }

  /** A registry for `config`'s network: DA's operator, every package vetted, CanActAs for every configured party. */
  static forConfig(config: DaRegistrySetupConfig, now: () => Date): FakeRegistry {
    return new FakeRegistry({
      operator: config.da.operatorParty,
      synchronizerId: config.ledger.synchronizerId,
      now,
      actAs: [config.registrar.party, ...config.preapprovals.map((p) => p.party)],
      vetted: config.da.packages.required.map((p) => ({
        packageName: p.name,
        packageId: p.packageId,
        packageVersion: p.version,
      })),
    });
  }

  // ── Test controls ───────────────────────────────────────────────────────────────────────────────────────────────

  /** DA's operator accepts every pending provider request addressed to it (automatic on DevNet). */
  acceptProviderRequests(): number {
    let accepted = 0;
    for (const request of this.active('providerServiceRequest')) {
      if (request.createArgument['operator'] !== this.daOperator) continue;
      this.acs.delete(request.contractId);
      this.createContract('providerService', {
        operator: request.createArgument['operator'],
        provider: request.createArgument['provider'],
      });
      accepted++;
    }
    return accepted;
  }

  rejectProviderRequests(reason: string): void {
    for (const request of this.active('providerServiceRequest')) {
      this.acs.delete(request.contractId);
      this.createContract('rejectedProviderServiceRequest', {
        operator: request.createArgument['operator'],
        request: clone(request.createArgument),
        reason,
      });
    }
  }

  /** Puts a contract on the ledger directly, as someone else (or an earlier run) would have. */
  seed(key: SimTemplate, createArgument: Args): string {
    return this.createContract(key, clone(createArgument));
  }

  archive(contractId: string): void {
    if (!this.acs.delete(contractId)) fail(`seeded archive of unknown ${contractId}`);
  }

  contracts(key: SimTemplate): Array<{ contractId: string; createArgument: Args }> {
    return this.active(key).map((c) => ({ contractId: c.contractId, createArgument: clone(c.createArgument) }));
  }

  /** Total holdings of `owner` in the registrar's instrument (any owner when omitted). */
  balance(owner?: string): Amount {
    return this.active('holding')
      .filter((h) => owner === undefined || h.createArgument['owner'] === owner)
      .reduce((total, h) => total.plus(String(h.createArgument['amount'])), Amount.ZERO);
  }

  // ── Ledger port ─────────────────────────────────────────────────────────────────────────────────────────────────

  private createLedger(): DaRegistryLedger {
    return {
      activeContracts: async (parties, templateIds) => {
        if (parties.length === 0) fail('activeContracts needs at least one party');
        const keys = templateIds.map((id) => templateKeyOf(id) ?? fail(`unknown template filter ${id}`));
        // Like the JSON Ledger API, reject a package-name filter for a package this node does not have.
        const unknown = keys.filter((key) => !this.packagesOnNode.includes(PACKAGE_IDS[TEMPLATE_NAMES[key][0]]));
        if (unknown.length > 0) {
          throw new Error(
            `PACKAGE_NAMES_NOT_FOUND: ${[...new Set(unknown.map((k) => TEMPLATE_NAMES[k][0]))].join(', ')}`
          );
        }
        return [...this.acs.values()]
          .filter((c) => keys.includes(c.key) && c.stakeholders.some((s) => parties.includes(s)))
          .map((c): ActiveContract => ({
            contractId: c.contractId,
            templateId: packageIdTemplateId(c.key),
            createArgument: clone(c.createArgument),
            synchronizerId: this.options.synchronizerId,
          }));
      },
      submit: async (submission) => this.submit(submission),
      checkActAs: async (parties) => ({
        userId: this.userId,
        missing: parties.filter((p) => !this.actAsRights.has(p)),
        participantAdmin: this.participantAdmin,
      }),
      listPackageIds: async () => [...this.packagesOnNode],
      connectedSynchronizerIds: async () => [...this.connectedSynchronizers],
      preferredPackages: async (_parties, packageNames) =>
        this.vettedPackages.filter((p) => packageNames.includes(p.packageName)).map((p) => ({ ...p })),
      uploadDar: async (dar, synchronizerId) => {
        this.uploadedDars.push({ bytes: dar, synchronizerId });
      },
    };
  }

  private submit(submission: LedgerSubmission): SubmittedTransaction {
    this.submissions.push(clone(submission));
    if (submission.actAs.length === 0) fail('actAs is empty');
    if (!submission.commandIdPrefix) fail('commandIdPrefix is empty');
    if (submission.actAs.some((p) => !this.actAsRights.has(p)))
      fail(`user lacks CanActAs for ${submission.actAs.join(', ')}`);
    for (const d of submission.disclosedContracts ?? []) {
      for (const f of ['templateId', 'contractId', 'createdEventBlob', 'synchronizerId'] as const)
        str(d[f], `disclosed ${f}`);
      const contract = this.acs.get(d.contractId);
      if (contract?.createdEventBlob !== d.createdEventBlob) fail(`disclosed ${d.contractId} is not active`);
    }
    const snapshot = new Map(this.acs);
    const tx: Tx = { submission, created: [] };
    try {
      for (const command of submission.commands) this.apply(command, tx);
    } catch (error) {
      this.acs = snapshot;
      throw error;
    }
    return { updateId: `update-${this.nextUpdate++}`, created: tx.created };
  }

  private apply(command: LedgerCommand, tx: Tx): void {
    if ('CreateCommand' in command) {
      this.create(
        command.CreateCommand.templateId,
        record(command.CreateCommand.createArguments, 'createArguments'),
        tx
      );
    } else if ('CreateAndExerciseCommand' in command) {
      const { templateId, createArguments, choice, choiceArgument } = command.CreateAndExerciseCommand;
      if (templateKeyOf(templateId) !== 'registrarServiceRequest' || choice !== 'RegistrarServiceRequest_Accept') {
        fail(`unsupported CreateAndExerciseCommand ${templateId} ${choice}`);
      }
      this.acceptRegistrarRequest(record(createArguments, 'createArguments'), record(choiceArgument, 'choice'), tx);
    } else if ('ExerciseCommand' in command) {
      this.exercise(command.ExerciseCommand, tx);
    } else {
      fail(`unknown command ${JSON.stringify(command)}`);
    }
  }

  private create(templateId: string, args: Args, tx: Tx): void {
    const key = templateKeyOf(templateId);
    if (key === 'providerServiceRequest') {
      str(args['operator'], 'operator');
      this.requireActAs(tx, str(args['provider'], 'provider'));
    } else if (key === 'credential') {
      this.requireActAs(tx, str(args['issuer'], 'issuer'));
      str(args['holder'], 'holder');
      str(args['id'], 'id');
      str(args['description'], 'description');
      if (args['validFrom'] !== null) time(args['validFrom'], 'validFrom');
      if (args['validUntil'] !== null) time(args['validUntil'], 'validUntil');
      const { claims } = args;
      if (!Array.isArray(claims) || claims.length === 0) fail('credential claims must be a non-empty list');
      claims.forEach((c, i) => {
        const claim = record(c, `claims[${i}]`);
        for (const f of ['subject', 'property', 'value']) str(claim[f], `claims[${i}].${f}`);
      });
      setMembers(args['observers'], 'observers');
    } else if (key === 'transferPreapproval') {
      this.requireActAs(tx, str(args['receiver'], 'receiver'));
      str(args['operator'], 'operator');
      str(args['instrumentAdmin'], 'instrumentAdmin');
      const { instrumentAllowances: allowances } = args;
      if (!Array.isArray(allowances)) fail('instrumentAllowances must be a list');
      allowances.forEach((a, i) => str(record(a, `allowance[${i}]`)['id'], `allowance[${i}].id`));
    } else {
      fail(`CreateCommand ${templateId} is not something the setup creates`);
    }
    this.createContract(key, clone(args), tx);
  }

  private exercise(
    command: { templateId: string; contractId: string; choice: string; choiceArgument: Args },
    tx: Tx
  ): void {
    const { templateId, contractId, choice } = command;
    const arg = record(command.choiceArgument, `${choice} argument`);
    const contract = this.acs.get(contractId) ?? fail(`contract ${contractId} is not active (CONTRACT_NOT_FOUND)`);
    if (templateId === TRANSFER_FACTORY_INTERFACE) {
      if (choice !== 'TransferFactory_Transfer') fail(`unknown TransferFactory choice ${choice}`);
      this.transfer(contract, arg, tx);
      return;
    }
    const key = templateKeyOf(templateId) ?? fail(`unknown template ${templateId}`);
    if (key !== contract.key) fail(`${contractId} is a ${contract.key}, not ${templateId}`);
    const c = contract.createArgument;

    switch (`${key}.${choice}`) {
      case 'providerService.ProviderService_CreateProviderConfiguration':
        this.requireActAs(tx, c['provider']);
        this.createProviderConfiguration(contract, arg, tx);
        return;
      case 'providerService.ProviderService_ArchiveAndCreateProviderConfiguration':
        this.requireActAs(tx, c['provider']);
        this.consume(str(arg['cid'], 'cid'), 'providerConfiguration');
        this.createProviderConfiguration(contract, record(arg['payload'], 'payload'), tx);
        return;
      case 'registrarServiceRequest.RegistrarServiceRequest_Accept':
        this.consume(contractId, 'registrarServiceRequest');
        this.acceptRegistrarRequest(c, arg, tx);
        return;
      case 'rejectedRegistrarServiceRequest.RejectedRegistrarServiceRequest_Delete':
        this.requireActAs(tx, (c['request'] as Args | undefined)?.['registrar']);
        this.consume(contractId, key);
        return;
      case 'registrarService.RegistrarService_CreateTransferRule':
        this.requireActAs(tx, c['registrar']);
        this.createContract('transferRule', this.serviceParties(c), tx);
        return;
      case 'registrarService.RegistrarService_CreateAllocationFactory':
        this.requireActAs(tx, c['registrar']);
        this.createContract('allocationFactory', this.serviceParties(c), tx);
        return;
      case 'registrarService.RegistrarService_CreateInstrumentConfiguration':
        this.requireActAs(tx, c['registrar']);
        this.createInstrumentConfiguration(contract, arg, tx);
        return;
      case 'registrarService.RegistrarService_ArchiveAndCreateInstrumentConfiguration':
        this.requireActAs(tx, c['registrar']);
        this.consume(str(arg['cid'], 'cid'), 'instrumentConfiguration');
        this.createInstrumentConfiguration(contract, record(arg['payload'], 'payload'), tx);
        return;
      case 'registrarService.RegistrarService_ArchiveInstrumentConfiguration':
        this.requireActAs(tx, c['registrar']);
        this.consume(str(arg['cid'], 'cid'), 'instrumentConfiguration');
        return;
      case 'allocationFactory.AllocationFactory_OfferMint':
        this.offerMint(contract, arg, tx);
        return;
      case 'mintOffer.MintOffer_Accept':
        this.acceptMintOffer(contract, arg, tx);
        return;
      case 'mintOffer.MintOffer_Cancel': {
        const mint = record(c['mint'], 'mint');
        this.requireActAs(tx, record(mint['instrumentId'], 'mint.instrumentId')['admin']);
        this.consume(contractId, key);
        return;
      }
      default:
        if (choice !== 'Archive') fail(`unknown choice ${choice} on ${key}`);
        if (Object.keys(arg).length > 0) fail('Archive takes an empty argument');
        if (!contract.stakeholders.some((p) => p !== c['operator'] && tx.submission.actAs.includes(p))) {
          fail(`${tx.submission.actAs.join(', ')} cannot archive ${contractId}`);
        }
        this.consume(contractId, key);
    }
  }

  // ── Choice effects ──────────────────────────────────────────────────────────────────────────────────────────────

  private serviceParties(c: Args): Args {
    return { operator: c['operator'], provider: c['provider'], registrar: c['registrar'] };
  }

  private createProviderConfiguration(service: SimContract, payload: Args, tx: Tx): void {
    this.createContract(
      'providerConfiguration',
      {
        operator: service.createArgument['operator'],
        provider: service.createArgument['provider'],
        registrarRequirements: requirements(payload['registrarRequirements'], 'registrarRequirements'),
        holderRequirements: requirements(payload['holderRequirements'], 'holderRequirements'),
      },
      tx
    );
  }

  private acceptRegistrarRequest(request: Args, arg: Args, tx: Tx): void {
    const operator = str(request['operator'], 'operator');
    const provider = str(request['provider'], 'provider');
    const registrar = str(request['registrar'], 'registrar');
    this.requireActAs(tx, provider);
    this.requireActAs(tx, registrar);
    const configuration = this.activeOf(
      str(arg['providerConfigurationCid'], 'providerConfigurationCid'),
      'providerConfiguration'
    );
    if (
      configuration.createArgument['provider'] !== provider ||
      configuration.createArgument['operator'] !== operator
    ) {
      fail('the provider configuration belongs to another provider or operator');
    }
    if (!Array.isArray(arg['credentialCids'])) fail('credentialCids must be a list');
    const parties = { operator, provider, registrar };
    this.createContract('registrarService', parties, tx);
    if (request['createTransferRule'] === true) this.createContract('transferRule', { ...parties }, tx);
    if (request['createAllocationFactory'] === true) this.createContract('allocationFactory', { ...parties }, tx);
  }

  private createInstrumentConfiguration(service: SimContract, payload: Args, tx: Tx): void {
    const registrar = str(service.createArgument['registrar'], 'registrar');
    const instrumentId = str(payload['instrumentId'], 'instrumentId');
    if (!Array.isArray(payload['additionalIdentifiers'])) fail('additionalIdentifiers must be a list');
    if (typeof payload['useBlockList'] !== 'boolean') fail('useBlockList must be a Bool');
    if (this.instrumentConfigurations(registrar, instrumentId).length > 0) {
      fail(`an instrument configuration for ${instrumentId} already exists`);
    }
    this.createContract(
      'instrumentConfiguration',
      {
        ...this.serviceParties(service.createArgument),
        defaultIdentifier: { source: registrar, id: instrumentId, scheme: REGISTRAR_INTERNAL_SCHEME },
        additionalIdentifiers: clone(payload['additionalIdentifiers']),
        issuerRequirements: requirements(payload['issuerRequirements'], 'issuerRequirements'),
        holderRequirements: requirements(payload['holderRequirements'], 'holderRequirements'),
        checkBlockList: payload['useBlockList'],
      },
      tx
    );
  }

  private offerMint(factory: SimContract, arg: Args, tx: Tx): void {
    const registrar = str(factory.createArgument['registrar'], 'registrar');
    this.requireActAs(tx, registrar);
    if (arg['expectedAdmin'] !== registrar) fail('expectedAdmin is not the factory registrar');
    const mint = record(arg['mint'], 'mint');
    const instrument = record(mint['instrumentId'], 'mint.instrumentId');
    if (instrument['admin'] !== registrar) fail('mint.instrumentId.admin is not the registrar');
    const instrumentId = str(instrument['id'], 'mint.instrumentId.id');
    positiveAmount(mint['amount'], 'mint.amount');
    const holder = str(mint['holder'], 'mint.holder');
    str(mint['reference'], 'mint.reference');
    record(record(mint['meta'], 'mint.meta')['values'], 'mint.meta.values');
    const now = this.options.now().getTime();
    if (time(mint['requestedAt'], 'mint.requestedAt') > now) fail('mint.requestedAt must not be in the future');
    if (time(mint['executeBefore'], 'mint.executeBefore') <= now) fail('mint.executeBefore has passed');
    this.checkIssuerRequirements(extraArgsValues(arg['extraArgs'], 'extraArgs'), holder, registrar, instrumentId);
    this.createContract(
      'mintOffer',
      { operator: factory.createArgument['operator'], provider: factory.createArgument['provider'], mint: clone(mint) },
      tx
    );
  }

  private acceptMintOffer(offer: SimContract, arg: Args, tx: Tx): void {
    const mint = record(offer.createArgument['mint'], 'mint');
    const instrument = record(mint['instrumentId'], 'mint.instrumentId');
    const admin = str(instrument['admin'], 'admin');
    const holder = str(mint['holder'], 'holder');
    this.requireActAs(tx, holder);
    if (time(mint['executeBefore'], 'mint.executeBefore') <= this.options.now().getTime())
      fail('the mint offer expired');
    this.checkIssuerRequirements(
      extraArgsValues(arg['extraArgs'], 'extraArgs'),
      holder,
      admin,
      str(instrument['id'], 'id')
    );
    this.consume(offer.contractId, 'mintOffer');
    this.createHolding(
      offer.createArgument,
      holder,
      admin,
      str(instrument['id'], 'id'),
      Amount.of(String(mint['amount'])),
      tx
    );
  }

  private transfer(preapproval: SimContract, arg: Args, tx: Tx): void {
    if (preapproval.key !== 'transferPreapproval')
      fail('TransferFactory_Transfer is only simulated on a TransferPreapproval');
    const p = preapproval.createArgument;
    const transfer = record(arg['transfer'], 'transfer');
    const sender = str(transfer['sender'], 'sender');
    const receiver = str(transfer['receiver'], 'receiver');
    this.requireActAs(tx, sender);
    const visible = preapproval.stakeholders.some((s) => tx.submission.actAs.includes(s));
    const disclosed = (tx.submission.disclosedContracts ?? []).some((d) => d.contractId === preapproval.contractId);
    if (!visible && !disclosed) fail(`the receiver's preapproval ${preapproval.contractId} was not disclosed`);
    if (arg['expectedAdmin'] !== p['instrumentAdmin']) fail('expectedAdmin is not the preapproval instrumentAdmin');
    if (receiver !== p['receiver']) fail('the preapproval belongs to another receiver');
    const instrument = record(transfer['instrumentId'], 'transfer.instrumentId');
    const admin = str(instrument['admin'], 'instrumentId.admin');
    const id = str(instrument['id'], 'instrumentId.id');
    if (admin !== p['instrumentAdmin']) fail('the instrument admin differs from the preapproval');
    const allowances = p['instrumentAllowances'] as Array<{ id: string }>;
    if (allowances.length > 0 && !allowances.some((a) => a.id === id)) fail(`the preapproval does not allow ${id}`);
    const now = this.options.now().getTime();
    if (time(transfer['requestedAt'], 'requestedAt') > now) fail('requestedAt must not be in the future');
    if (time(transfer['executeBefore'], 'executeBefore') <= now) fail('executeBefore has passed');
    const amount = positiveAmount(transfer['amount'], 'transfer.amount');
    extraArgsValues(arg['extraArgs'], 'extraArgs');

    const inputCids = transfer['inputHoldingCids'];
    if (!Array.isArray(inputCids) || inputCids.length === 0) fail('inputHoldingCids must be a non-empty list');
    if (new Set(inputCids).size !== inputCids.length) fail('inputHoldingCids lists a holding twice');
    const inputs = inputCids.map((cid) => this.activeOf(str(cid, 'input'), 'holding'));
    for (const h of inputs) {
      const a = h.createArgument;
      if (a['owner'] !== sender) fail(`input ${h.contractId} is not owned by the sender`);
      if (a['lock'] != null) fail(`input ${h.contractId} is locked`);
      if (a['registrar'] !== admin || (a['instrument'] as Args)['id'] !== id)
        fail(`input ${h.contractId} is another instrument`);
    }
    const total = inputs.reduce((sum, h) => sum.plus(String(h.createArgument['amount'])), Amount.ZERO);
    if (total.lt(amount)) fail(`inputs hold ${total.toFixed()}, short of ${amount.toFixed()}`);

    const configurations = this.instrumentConfigurations(admin, id);
    if (configurations.length !== 1) fail(`expected one instrument configuration for ${id}`);
    for (const party of [sender, receiver]) {
      for (const req of (configurations[0]?.createArgument['holderRequirements'] ?? []) as Requirement[]) {
        const ok = this.active('credential').some((c) => this.credentialSatisfies(c, req, party));
        if (!ok) fail(`${party} lacks the holder requirement ${JSON.stringify(req.requiredClaims)}`);
      }
    }

    for (const h of inputs) this.consume(h.contractId, 'holding');
    const template = inputs[0]?.createArgument ?? fail('no inputs');
    this.createHolding(template, receiver, admin, id, amount, tx);
    if (total.gt(amount)) this.createHolding(template, sender, admin, id, total.minus(amount), tx);
  }

  private createHolding(source: Args, owner: string, admin: string, id: string, amount: Amount, tx: Tx): void {
    this.createContract(
      'holding',
      {
        operator: source['operator'],
        provider: source['provider'],
        registrar: admin,
        owner,
        instrument: { source: admin, id, scheme: REGISTRAR_INTERNAL_SCHEME },
        label: '',
        amount: amount.toFixed(10),
        lock: null,
      },
      tx
    );
  }

  private checkIssuerRequirements(values: Args, holder: string, registrar: string, instrumentId: string): void {
    const configurationRef = values[INSTRUMENT_CONFIGURATION_KEY] as { tag?: unknown; value?: unknown } | undefined;
    if (configurationRef?.tag !== 'AV_ContractId') fail('the choice context lacks the instrument configuration');
    const configuration = this.activeOf(str(configurationRef.value, 'configuration cid'), 'instrumentConfiguration');
    const identifier = configuration.createArgument['defaultIdentifier'] as Args;
    if (configuration.createArgument['registrar'] !== registrar || identifier['id'] !== instrumentId) {
      fail('the context names another instrument configuration');
    }
    const credentialsRef = values[ISSUER_CREDENTIALS_KEY] as { tag?: unknown; value?: unknown } | undefined;
    if (credentialsRef?.tag !== 'AV_List' || !Array.isArray(credentialsRef.value)) {
      fail('the choice context lacks the issuer credentials');
    }
    const credentials = credentialsRef.value.map((ref: { tag?: unknown; value?: unknown }) => {
      if (ref.tag !== 'AV_ContractId') fail('issuer credentials must be AV_ContractId values');
      return this.activeOf(str(ref.value, 'credential cid'), 'credential');
    });
    for (const req of configuration.createArgument['issuerRequirements'] as Requirement[]) {
      if (!credentials.some((c) => this.credentialSatisfies(c, req, holder))) {
        fail(`${holder} lacks the issuer requirement ${JSON.stringify(req.requiredClaims)}`);
      }
    }
  }

  private credentialSatisfies(credential: SimContract, req: Requirement, subject: string): boolean {
    const c = credential.createArgument;
    const now = this.options.now().getTime();
    const claims = c['claims'] as CredentialClaim[];
    return (
      c['issuer'] === req.issuer &&
      (c['validFrom'] === null || Date.parse(c['validFrom'] as string) <= now) &&
      (c['validUntil'] === null || Date.parse(c['validUntil'] as string) > now) &&
      req.requiredClaims.every((t) =>
        claims.some((claim) => claim.subject === subject && claim.property === t._1 && claim.value === t._2)
      )
    );
  }

  // ── ACS helpers ─────────────────────────────────────────────────────────────────────────────────────────────────

  private createContract(key: SimTemplate, createArgument: Args, tx?: Tx): string {
    const contractId = `00${String(this.nextContract++).padStart(4, '0')}-${key}`;
    this.acs.set(contractId, {
      key,
      contractId,
      createArgument,
      stakeholders: stakeholdersOf(key, createArgument),
      createdEventBlob: `CgMyLjES${'A'.repeat(120)}${contractId}`,
    });
    tx?.created.push({ contractId, templateId: packageIdTemplateId(key) });
    return contractId;
  }

  private consume(contractId: string, key: SimTemplate): void {
    this.activeOf(contractId, key);
    this.acs.delete(contractId);
  }

  private activeOf(contractId: string, key: SimTemplate): SimContract {
    const contract = this.acs.get(contractId) ?? fail(`contract ${contractId} is not active (CONTRACT_NOT_FOUND)`);
    return contract.key === key ? contract : fail(`${contractId} is a ${contract.key}, expected ${key}`);
  }

  private active(key: SimTemplate): SimContract[] {
    return [...this.acs.values()].filter((c) => c.key === key);
  }

  private instrumentConfigurations(registrar: string, instrumentId: string): SimContract[] {
    return this.active('instrumentConfiguration').filter(
      (c) =>
        c.createArgument['registrar'] === registrar &&
        (c.createArgument['defaultIdentifier'] as Args | undefined)?.['id'] === instrumentId
    );
  }

  private requireActAs(tx: Tx, party: unknown): void {
    if (typeof party !== 'string' || !tx.submission.actAs.includes(party)) {
      fail(`the submission must act as ${String(party)} (actAs: ${tx.submission.actAs.join(', ')})`);
    }
  }

  private disclosed(contract: SimContract): DisclosedContract {
    return {
      templateId: packageIdTemplateId(contract.key),
      contractId: contract.contractId,
      createdEventBlob: contract.createdEventBlob,
      synchronizerId: this.options.synchronizerId,
    };
  }

  // ── DA API port ─────────────────────────────────────────────────────────────────────────────────────────────────

  private createDa(): DaRegistryApi {
    const note = (method: keyof DaRegistryApi, args: unknown[]): void => {
      this.daCalls.push({ method, args: clone(args) });
    };
    return {
      operatorParty: async () => {
        note('operatorParty', []);
        return this.daOperator;
      },
      registryInfo: async (registrar) => {
        note('registryInfo', [registrar]);
        const known = this.active('registrarService').some((s) => s.createArgument['registrar'] === registrar);
        return known && !this.daLagging ? { adminId: registrar, supportedApis: { ...this.supportedApis } } : null;
      },
      instrumentMetadata: async (registrar, instrumentId) => {
        note('instrumentMetadata', [registrar, instrumentId]);
        if (this.daLagging || this.instrumentConfigurations(registrar, instrumentId).length === 0) return null;
        return { id: instrumentId, name: instrumentId, symbol: instrumentId, totalSupply: this.balance().toFixed(10) };
      },
      mintOfferFactory: async (holder, instrumentId) => this.mintOfferFactory(holder, instrumentId),
      transferFactory: async (admin, transfer) => this.transferFactory(admin, transfer),
    };
  }

  /** `null` stands for DA's 404 while it has not indexed the registrar's factory or the instrument. */
  private mintOfferFactory(holder: string, instrumentId: DaRegistryInstrumentId): DaRegistryFactoryWithContext | null {
    this.daCalls.push({ method: 'mintOfferFactory', args: clone([holder, instrumentId]) });
    const factory = this.active('allocationFactory').find((f) => f.createArgument['registrar'] === instrumentId.admin);
    const [configuration] = this.instrumentConfigurations(instrumentId.admin, instrumentId.id);
    if (this.daLagging || this.mintOfferLagging || !factory || !configuration) return null;
    const now = this.options.now().getTime();
    const credentials = this.active('credential').filter((c) => {
      const a = c.createArgument;
      return (
        a['issuer'] === instrumentId.admin &&
        (a['claims'] as CredentialClaim[]).some((claim) => claim.subject === holder) &&
        (a['validFrom'] === null || Date.parse(a['validFrom'] as string) <= now) &&
        (a['validUntil'] === null || Date.parse(a['validUntil'] as string) > now)
      );
    });
    return {
      factoryId: factory.contractId,
      choiceContext: {
        choiceContextData: {
          values: {
            [INSTRUMENT_CONFIGURATION_KEY]: { tag: 'AV_ContractId', value: configuration.contractId },
            [ISSUER_CREDENTIALS_KEY]: {
              tag: 'AV_List',
              value: credentials.map((c) => ({ tag: 'AV_ContractId', value: c.contractId })),
            },
          },
        },
        disclosedContracts: [this.disclosed(factory)],
      },
    };
  }

  private transferFactory(
    admin: string,
    transfer: Parameters<DaRegistryApi['transferFactory']>[1]
  ): DaRegistryTransferFactoryWithContext {
    this.daCalls.push({ method: 'transferFactory', args: clone([admin, transfer]) });
    if (this.transferFactoryError) throw this.transferFactoryError;
    const url = `POST https://api.utilities.digitalasset-dev.com/api/token-standard/v0/registrars/${admin}`;
    for (const cid of (transfer.inputHoldingCids as string[] | undefined) ?? []) {
      if (!this.acs.has(cid)) throw new Error(`${url} failed: 404 {"error":"Holding ${cid} not found"}`);
    }
    const preapproval = this.active('transferPreapproval').find(
      (c) =>
        c.createArgument['receiver'] === transfer.receiver &&
        c.createArgument['instrumentAdmin'] === admin &&
        c.createArgument['operator'] === this.daOperator
    );
    if (preapproval) {
      return {
        factoryId: preapproval.contractId,
        transferKind: 'direct',
        choiceContext: { choiceContextData: { values: {} }, disclosedContracts: [this.disclosed(preapproval)] },
      };
    }
    const rule = this.active('transferRule').find((r) => r.createArgument['registrar'] === admin);
    return {
      factoryId: rule?.contractId ?? 'no-transfer-rule',
      transferKind: 'offer',
      choiceContext: { choiceContextData: { values: {} }, disclosedContracts: rule ? [this.disclosed(rule)] : [] },
    };
  }
}
