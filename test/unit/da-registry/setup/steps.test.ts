import {
  buildDaRegistrySetupSteps,
  DA_REGISTRY_SETUP_MINT_REFERENCE_PREFIX,
  desiredDaRegistryInstrumentConfiguration,
  runDaRegistrySetupSteps,
  type DaRegistrySetupConfig,
  type DaRegistrySetupContext,
  type DaRegistrySetupRunMode,
  type DaRegistrySetupRunResult,
  type DaRegistrySetupStep,
  type DaRegistrySetupStepAssessment,
  type DaRegistrySetupStepResult,
} from '../../../../src/da-registry';
import { type LedgerCommand, type LedgerSubmission } from '../../../../src/utils/ledger';
import { FakeRegistry, PACKAGE_IDS, packageIdTemplateId, submissionLabels } from './fakeRegistry';
import {
  CONFIG_SOURCE,
  DAY_MS,
  DEVNET_CONFIG,
  DEVNET_SYNCHRONIZER,
  HOLDER_A,
  HOLDER_B,
  HOUR_MS,
  MAINNET_CONFIG,
  NOW,
  OPERATOR,
  REGISTRAR,
  REGISTRAR_LABEL,
  clock,
  configVariant,
  isoAt,
  nth,
  withoutParty,
} from './fixtures';

type ExerciseCommand = Extract<LedgerCommand, { ExerciseCommand: unknown }>;

const devnet = configVariant(DEVNET_CONFIG);
const mainnet = configVariant(MAINNET_CONFIG);

const STEP_IDS = [
  'ledger-access',
  'da-packages',
  'provider-service',
  'provider-configuration',
  'registrar-service',
  'instrument-configuration',
  'credentials',
  'transfer-preapprovals',
  'supply',
  'da-api',
  'deliveries',
];

const T = {
  providerServiceRequest: '#utility-registry-app-v0:Utility.Registry.App.V0.Service.Provider:ProviderServiceRequest',
  providerService: '#utility-registry-app-v0:Utility.Registry.App.V0.Service.Provider:ProviderService',
  registrarService: '#utility-registry-app-v0:Utility.Registry.App.V0.Service.Registrar:RegistrarService',
  registrarServiceRequest: '#utility-registry-app-v0:Utility.Registry.App.V0.Service.Registrar:RegistrarServiceRequest',
  credential: '#utility-credential-v0:Utility.Credential.V0.Credential:Credential',
  mintOffer: '#utility-registry-app-v0:Utility.Registry.App.V0.Model.Mint:MintOffer',
  transferFactory: '#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferFactory',
};

/** The steps against one simulated ledger, with the runner's clock and sleep injected. */
class Harness {
  readonly logs: string[] = [];
  readonly sleeps: number[] = [];
  /** Called on every runner sleep, after the provider auto-accept. */
  onSleep?: () => void;
  private runnerNow = 0;

  constructor(
    readonly fake: FakeRegistry,
    readonly config: DaRegistrySetupConfig,
    private readonly autoAcceptProvider: boolean
  ) {}

  ctx(config = this.config): DaRegistrySetupContext {
    return { config, ledger: this.fake.ledger, da: this.fake.da, now: clock, log: (line) => this.logs.push(line) };
  }

  step(id: string, config = this.config): DaRegistrySetupStep {
    const step = buildDaRegistrySetupSteps(this.ctx(config)).find((s) => s.id === id);
    if (!step) throw new Error(`no step ${id}`);
    return step;
  }

  async assess(id: string, config = this.config): Promise<DaRegistrySetupStepAssessment> {
    return this.step(id, config).assess();
  }

  async run(mode: DaRegistrySetupRunMode, config = this.config): Promise<DaRegistrySetupRunResult> {
    return runDaRegistrySetupSteps(buildDaRegistrySetupSteps(this.ctx(config)), mode, {
      submit: async (submission) => this.fake.ledger.submit(submission),
      log: (line) => this.logs.push(line),
      sleep: async (ms) => {
        this.sleeps.push(ms);
        this.runnerNow += ms;
        // DA's operator accepts provider requests on its own on DevNet; here, while the runner polls.
        if (this.autoAcceptProvider) this.fake.acceptProviderRequests();
        this.onSleep?.();
      },
      now: () => this.runnerNow,
    });
  }

  /** Submissions made after the first `mark`. */
  since(mark: number): LedgerSubmission[] {
    return this.fake.submissions.slice(mark);
  }
}

function harness(config = devnet, { autoAcceptProvider = true } = {}): Harness {
  return new Harness(FakeRegistry.forConfig(config, clock), config, autoAcceptProvider);
}

async function converged(config = devnet): Promise<Harness> {
  const h = harness(config);
  const result = await h.run('apply');
  expect(result.outcome).toBe('done');
  return h;
}

/** MainNet's provider request waits for DA by hand, so accept it between two applies. */
async function convergedMainnet(): Promise<Harness> {
  const h = harness(mainnet, { autoAcceptProvider: false });
  expect((await h.run('apply')).outcome).toBe('waiting');
  h.fake.acceptProviderRequests();
  expect((await h.run('apply')).outcome).toBe('done');
  return h;
}

function stepResult(result: DaRegistrySetupRunResult, id: string): DaRegistrySetupStepResult {
  const step = result.steps.find((s) => s.id === id);
  if (!step) throw new Error(`${id} did not run`);
  return step;
}

function exercise(submission: LedgerSubmission | undefined, index = 0): ExerciseCommand['ExerciseCommand'] {
  const command = submission?.commands[index];
  if (!command || !('ExerciseCommand' in command)) throw new Error(`command ${index} is not an exercise`);
  return command.ExerciseCommand;
}

function onlySubmission(assessment: DaRegistrySetupStepAssessment): LedgerSubmission {
  expect(assessment.actions).toHaveLength(1);
  const submission = assessment.actions?.[0]?.submission;
  if (!submission) throw new Error('the action has no submission');
  return submission;
}

interface SimContractView {
  contractId: string;
  createArgument: Record<string, unknown>;
}

function credentialsOf(h: Harness, party: string): SimContractView[] {
  return h.fake
    .contracts('credential')
    .filter((c) => (c.createArgument['claims'] as Array<{ subject: string }>).some((claim) => claim.subject === party));
}

function mintOfferArgs(
  amount: string,
  requestedAt: string,
  executeBefore: string,
  reference?: string
): Record<string, unknown> {
  return {
    operator: OPERATOR,
    provider: REGISTRAR,
    mint: {
      instrumentId: { admin: REGISTRAR, id: 'DEMO' },
      amount,
      holder: REGISTRAR,
      reference: reference ?? `${DA_REGISTRY_SETUP_MINT_REFERENCE_PREFIX} devnet: left by an earlier run`,
      requestedAt,
      executeBefore,
      meta: { values: {} },
    },
  };
}

describe('plan on an empty ledger', () => {
  it('shows provider-service pending, the steps built on it blocked as dependencies, and submits nothing', async () => {
    const h = harness();

    const result = await h.run('plan');

    expect(result.steps.map((s) => [s.id, s.status])).toEqual([
      ['ledger-access', 'done'],
      ['da-packages', 'done'],
      ['provider-service', 'pending'],
      ['provider-configuration', 'blocked'],
      ['registrar-service', 'blocked'],
      ['instrument-configuration', 'blocked'],
      // The allowlist and the preapprovals read nothing earlier steps create, so plan already lists their commands.
      ['credentials', 'pending'],
      ['transfer-preapprovals', 'pending'],
      ['supply', 'blocked'],
      ['da-api', 'blocked'],
      ['deliveries', 'blocked'],
    ]);
    const blockedSteps = result.steps.filter((s) => s.status === 'blocked');
    expect(Object.fromEntries(blockedSteps.map((s) => [s.id, s.summary]))).toEqual({
      'provider-configuration': 'needs provider-service',
      'registrar-service': 'needs provider-configuration',
      'instrument-configuration': 'needs registrar-service',
      supply: 'needs instrument-configuration',
      'da-api': 'needs instrument-configuration',
      deliveries: 'needs instrument-configuration',
    });
    expect(blockedSteps.every((s) => s.dependency)).toBe(true);
    expect(result.needsAttention).toBe(false);
    expect(result.outcome).toBe('pending');
    expect(h.fake.submissions).toEqual([]);
    expect(h.fake.uploadedDars).toEqual([]);
    expect(h.sleeps).toEqual([]);
    expect(h.fake.contracts('providerServiceRequest')).toEqual([]);
    expect(h.logs.join('\n')).toContain(`"templateId": "${T.providerServiceRequest}"`);
  });

  it('plans the exact ProviderServiceRequest create command', async () => {
    const h = harness();

    const assessment = await h.assess('provider-service');

    expect(assessment.status).toBe('pending');
    expect(onlySubmission(assessment)).toEqual({
      commandIdPrefix: 'da-registry-devnet-provider-service',
      actAs: [REGISTRAR],
      commands: [
        {
          CreateCommand: {
            templateId: T.providerServiceRequest,
            createArguments: { operator: OPERATOR, provider: REGISTRAR },
          },
        },
      ],
    });
  });
});

describe('apply from an empty ledger', () => {
  it('converges every step, polling while DA accepts the provider request', async () => {
    const h = harness();

    const result = await h.run('apply');

    expect(result.outcome).toBe('done');
    expect(result.needsAttention).toBe(false);
    expect(result.steps.map((s) => [s.id, s.status])).toEqual(STEP_IDS.map((id) => [id, 'done']));
    expect(h.sleeps).toEqual([10_000]);
    expect(submissionLabels(h.fake.submissions)).toEqual([
      'create ProviderServiceRequest',
      'ProviderService.ProviderService_CreateProviderConfiguration',
      'createAndExercise RegistrarServiceRequest.RegistrarServiceRequest_Accept',
      'RegistrarService.RegistrarService_CreateInstrumentConfiguration',
      'create Credential',
      'create Credential',
      'create Credential',
      'create TransferPreapproval',
      'create TransferPreapproval',
      'create TransferPreapproval',
      'AllocationFactory.AllocationFactory_OfferMint',
      'MintOffer.MintOffer_Accept',
      'TransferFactory.TransferFactory_Transfer',
      'TransferFactory.TransferFactory_Transfer',
    ]);
    expect(h.fake.submissions.every((s) => s.commands.length === 1)).toBe(true);
    expect(h.fake.submissions.every((s) => s.commandIdPrefix.startsWith('da-registry-devnet-'))).toBe(true);
    expect(h.fake.contracts('registrarService')).toHaveLength(1);
    expect(h.fake.contracts('transferRule')).toHaveLength(1);
    expect(h.fake.contracts('allocationFactory')).toHaveLength(1);
    expect(h.fake.contracts('mintOffer')).toEqual([]);
  });

  it('is idempotent: a second apply submits nothing and plan reports done', async () => {
    const h = await converged();
    const mark = h.fake.submissions.length;

    const again = await h.run('apply');
    const plan = await h.run('plan');

    expect(again.outcome).toBe('done');
    expect(plan.outcome).toBe('done');
    expect(plan.needsAttention).toBe(false);
    expect(plan.steps.map((s) => [s.id, s.status])).toEqual(STEP_IDS.map((id) => [id, 'done']));
    expect(h.since(mark)).toEqual([]);
    expect(h.sleeps).toEqual([10_000]);
  });

  it('mints the configured total to the registrar and tops every delivery target up to its minBalance', async () => {
    const h = await converged();

    expect(h.fake.balance().toFixed()).toBe(devnet.supply?.total);
    for (const target of devnet.deliveries) {
      expect(h.fake.balance(target.party).toFixed()).toBe(target.minBalance);
    }
    expect(h.fake.balance(REGISTRAR).toFixed()).toBe('980000');
    for (const holding of h.fake.contracts('holding')) {
      expect(holding.createArgument).toEqual(
        expect.objectContaining({
          registrar: REGISTRAR,
          label: '',
          lock: null,
          instrument: expect.objectContaining({ id: 'DEMO' }),
        })
      );
    }
    expect((await h.assess('supply')).evidence).toEqual({ supply: '1000000', target: '1000000' });
  });

  it('issues one issuer-held credential per listed party, with its claims, observed by DA’s operator', async () => {
    const h = await converged();

    expect(h.fake.contracts('credential')).toHaveLength(devnet.credentials.parties.length);
    for (const entry of devnet.credentials.parties) {
      const credentials = credentialsOf(h, entry.party);
      expect(credentials).toHaveLength(1);
      expect(nth(credentials, 0).createArgument).toEqual({
        issuer: REGISTRAR,
        holder: REGISTRAR,
        id: 'DEMO allowlist',
        description: 'Approved by the registrar to hold DEMO',
        validFrom: null,
        validUntil: '2027-04-30T00:00:00Z',
        claims: [
          { subject: entry.party, property: 'canTransfer', value: 'DEMO' },
          { subject: entry.party, property: 'canRedeem', value: 'DEMO' },
        ],
        observers: { map: [[OPERATOR, {}]] },
      });
    }
  });

  it('configures DEMO with the registrar’s claims as (Text, Text) {_1,_2} tuples', async () => {
    const h = await converged();

    const configurations = h.fake.contracts('instrumentConfiguration');
    expect(configurations).toHaveLength(1);
    expect(nth(configurations, 0).createArgument).toEqual({
      operator: OPERATOR,
      provider: REGISTRAR,
      registrar: REGISTRAR,
      defaultIdentifier: { source: REGISTRAR, id: 'DEMO', scheme: 'RegistrarInternalScheme' },
      additionalIdentifiers: [],
      issuerRequirements: [{ issuer: REGISTRAR, requiredClaims: [{ _1: 'canRedeem', _2: 'DEMO' }] }],
      holderRequirements: [{ issuer: REGISTRAR, requiredClaims: [{ _1: 'canTransfer', _2: 'DEMO' }] }],
      checkBlockList: false,
    });
  });

  it('offers the mint with a context of the registrar’s own configuration and credential, then accepts it as holder', async () => {
    const h = await converged();
    const configuration = nth(h.fake.contracts('instrumentConfiguration'), 0);
    const registrarCredential = nth(credentialsOf(h, REGISTRAR), 0);
    const context = {
      values: {
        'utility.digitalasset.com/instrument-configuration': { tag: 'AV_ContractId', value: configuration.contractId },
        'utility.digitalasset.com/issuer-credentials': {
          tag: 'AV_List',
          value: [{ tag: 'AV_ContractId', value: registrarCredential.contractId }],
        },
      },
    };
    const supply = h.fake.submissions.filter((s) => s.commandIdPrefix === 'da-registry-devnet-supply');

    expect(supply.map((s) => s.actAs)).toEqual([[REGISTRAR], [REGISTRAR]]);
    expect(exercise(supply[0]).choiceArgument).toEqual({
      expectedAdmin: REGISTRAR,
      mint: {
        instrumentId: { admin: REGISTRAR, id: 'DEMO' },
        amount: '1000000',
        holder: REGISTRAR,
        reference: 'da-registry-setup devnet: supply to 1000000',
        requestedAt: isoAt(-60_000),
        executeBefore: isoAt(72 * HOUR_MS),
        meta: { values: {} },
      },
      extraArgs: { context, meta: { values: {} } },
    });
    expect(exercise(supply[1])).toEqual(
      expect.objectContaining({
        templateId: T.mintOffer,
        choice: 'MintOffer_Accept',
        choiceArgument: { extraArgs: { context, meta: { values: {} } } },
      })
    );
  });

  it('creates each preapproval as its receiver, and delivers through it with the preapproval disclosed', async () => {
    const h = await converged();

    const preapprovals = h.fake.submissions.filter(
      (s) => s.commandIdPrefix === 'da-registry-devnet-transfer-preapprovals'
    );
    expect(preapprovals.map((s) => s.actAs)).toEqual([[REGISTRAR], [HOLDER_A], [HOLDER_B]]);
    expect(h.fake.contracts('transferPreapproval').map((c) => c.createArgument)).toEqual(
      [REGISTRAR, HOLDER_A, HOLDER_B].map((receiver) => ({
        operator: OPERATOR,
        receiver,
        instrumentAdmin: REGISTRAR,
        instrumentAllowances: [{ id: 'DEMO' }],
      }))
    );

    const deliveries = h.fake.submissions.filter((s) => s.commandIdPrefix === 'da-registry-devnet-deliveries');
    expect(deliveries).toHaveLength(2);
    const inputs: unknown[] = [];
    for (const [i, receiver] of [HOLDER_A, HOLDER_B].entries()) {
      const preapproval = h.fake
        .contracts('transferPreapproval')
        .find((c) => c.createArgument['receiver'] === receiver);
      const transfer = exercise(deliveries[i]);
      expect(nth(deliveries, i).actAs).toEqual([REGISTRAR]);
      expect(transfer.templateId).toBe(T.transferFactory);
      expect(transfer.contractId).toBe(preapproval?.contractId);
      expect(nth(deliveries, i).disclosedContracts).toEqual([
        expect.objectContaining({
          contractId: preapproval?.contractId,
          templateId: packageIdTemplateId('transferPreapproval'),
        }),
      ]);
      expect(nth(deliveries, i).disclosedContracts?.[0]?.templateId).toMatch(
        new RegExp(`^${PACKAGE_IDS['utility-registry-app-v0']}:`)
      );
      expect(transfer.choiceArgument).toEqual({
        expectedAdmin: REGISTRAR,
        transfer: {
          sender: REGISTRAR,
          receiver,
          amount: '10000',
          instrumentId: { admin: REGISTRAR, id: 'DEMO' },
          requestedAt: isoAt(-60_000),
          executeBefore: isoAt(HOUR_MS),
          inputHoldingCids: [expect.any(String)],
          meta: { values: { 'splice.lfdecentralizedtrust.org/reason': 'da-registry-setup delivery' } },
        },
        extraArgs: { context: { values: {} }, meta: { values: {} } },
      });
      inputs.push((transfer.choiceArgument['transfer'] as { inputHoldingCids: string[] }).inputHoldingCids[0]);
    }
    // The second delivery spends the change of the first.
    expect(inputs[1]).not.toBe(inputs[0]);
  });

  it('tops a holder up again after it spent its seed', async () => {
    const h = await converged();
    const holding = nth(
      h.fake.contracts('holding').filter((c) => c.createArgument['owner'] === HOLDER_A),
      0
    );
    h.fake.archive(holding.contractId);
    h.fake.seed('holding', { ...holding.createArgument, amount: '4000.0000000000' });
    // Supply is now 6000 short, so apply mints it back before delivering 6000 to A.
    const mark = h.fake.submissions.length;

    expect((await h.run('apply')).outcome).toBe('done');

    expect(submissionLabels(h.since(mark))).toEqual([
      'AllocationFactory.AllocationFactory_OfferMint',
      'MintOffer.MintOffer_Accept',
      'TransferFactory.TransferFactory_Transfer',
    ]);
    expect(h.fake.balance(HOLDER_A).toFixed()).toBe('10000');
    expect(h.fake.balance().toFixed()).toBe('1000000');
  });
});

describe('allowlist drift', () => {
  it('replaces a credential whose claims changed with an archive and a create in one submission', async () => {
    const h = await converged();
    const before = nth(credentialsOf(h, HOLDER_B), 0);
    // A delivery is a transfer, so B must leave deliveries before losing the transfer claim.
    const redemptionOnly = configVariant(DEVNET_CONFIG, (raw) => {
      nth(raw.credentials.parties, 2).claims = ['redemption'];
      raw.deliveries = raw.deliveries.filter((d) => d.party !== HOLDER_B);
    });
    const mark = h.fake.submissions.length;

    const result = await h.run('apply', redemptionOnly);

    expect(result.outcome).toBe('done');
    const submissions = h.since(mark);
    expect(submissions).toHaveLength(1);
    expect(nth(submissions, 0).commandIdPrefix).toBe('da-registry-devnet-credentials');
    expect(nth(submissions, 0).actAs).toEqual([REGISTRAR]);
    expect(nth(submissions, 0).commands).toEqual([
      {
        ExerciseCommand: {
          templateId: T.credential,
          contractId: before.contractId,
          choice: 'Archive',
          choiceArgument: {},
        },
      },
      {
        CreateCommand: {
          templateId: T.credential,
          createArguments: {
            ...before.createArgument,
            claims: [{ subject: HOLDER_B, property: 'canRedeem', value: 'DEMO' }],
          },
        },
      },
    ]);
    const after = credentialsOf(h, HOLDER_B);
    expect(after).toHaveLength(1);
    expect(nth(after, 0).contractId).not.toBe(before.contractId);
    expect(nth(after, 0).createArgument['claims']).toEqual([
      { subject: HOLDER_B, property: 'canRedeem', value: 'DEMO' },
    ]);
  });

  it('renews every credential when validUntil moves later', async () => {
    const h = await converged();
    const renewed = configVariant(DEVNET_CONFIG, (raw) => (raw.credentials.validUntil = '2027-10-31T00:00:00Z'));
    const mark = h.fake.submissions.length;

    const result = await h.run('apply', renewed);

    expect(result.outcome).toBe('done');
    expect(h.since(mark).map((s) => submissionLabels([s]))).toEqual([
      ['Credential.Archive', 'create Credential'],
      ['Credential.Archive', 'create Credential'],
      ['Credential.Archive', 'create Credential'],
    ]);
    expect(h.fake.contracts('credential').map((c) => c.createArgument['validUntil'])).toEqual([
      '2027-10-31T00:00:00Z',
      '2027-10-31T00:00:00Z',
      '2027-10-31T00:00:00Z',
    ]);
  });

  it.each<[string, (arg: Record<string, unknown>) => Record<string, unknown>]>([
    [
      'an extra observer',
      (arg) => ({
        ...arg,
        observers: {
          map: [
            [OPERATOR, {}],
            [HOLDER_A, {}],
          ],
        },
      }),
    ],
    ['no DA operator observer', (arg) => ({ ...arg, observers: { map: [[HOLDER_A, {}]] } })],
    ['another id', (arg) => ({ ...arg, id: 'old allowlist' })],
    ['another description', (arg) => ({ ...arg, description: 'Approved by someone else' })],
    ['a validFrom', (arg) => ({ ...arg, validFrom: isoAt(-DAY_MS) })],
  ])('replaces a credential with %s', async (_what, mutate) => {
    const h = await converged();
    const original = nth(credentialsOf(h, HOLDER_A), 0);
    h.fake.archive(original.contractId);
    const drifted = h.fake.seed('credential', mutate(original.createArgument));

    const assessment = await h.assess('credentials');

    expect(assessment.status).toBe('pending');
    expect(assessment.evidence?.['Test holder A']).toBe('differs from the config');
    expect(onlySubmission(assessment).commands).toEqual([
      { ExerciseCommand: { templateId: T.credential, contractId: drifted, choice: 'Archive', choiceArgument: {} } },
      { CreateCommand: { templateId: T.credential, createArguments: original.createArgument } },
    ]);
  });

  it('revokes the credential of a party removed from the config when pruneUnlisted is on', async () => {
    const h = await converged();
    const credential = nth(credentialsOf(h, HOLDER_B), 0);
    const without = configVariant(DEVNET_CONFIG, (raw) => withoutParty(raw, HOLDER_B));
    expect(without.credentials.pruneUnlisted).toBe(true);
    const mark = h.fake.submissions.length;

    const result = await h.run('apply', without);

    expect(result.outcome).toBe('done');
    expect(h.since(mark)).toEqual([
      {
        commandIdPrefix: 'da-registry-devnet-credentials',
        actAs: [REGISTRAR],
        commands: [
          {
            ExerciseCommand: {
              templateId: T.credential,
              contractId: credential.contractId,
              choice: 'Archive',
              choiceArgument: {},
            },
          },
        ],
      },
    ]);
    expect(credentialsOf(h, HOLDER_B)).toEqual([]);
    expect(credentialsOf(h, HOLDER_A)).toHaveLength(1);
  });

  it('leaves an unlisted party’s credential in place, with a count note, when pruneUnlisted is off', async () => {
    const h = await converged();
    const without = configVariant(DEVNET_CONFIG, (raw) => {
      withoutParty(raw, HOLDER_B);
      raw.credentials.pruneUnlisted = false;
    });
    const mark = h.fake.submissions.length;

    const result = await h.run('apply', without);

    expect(result.outcome).toBe('done');
    expect(h.since(mark)).toEqual([]);
    expect(stepResult(result, 'credentials')).toEqual(
      expect.objectContaining({
        status: 'done',
        notes: ['1 credential(s) name parties this config does not list; left in place'],
      })
    );
    expect(credentialsOf(h, HOLDER_B)).toHaveLength(1);
  });

  it('blocks rather than archive a listed party’s credential that also names an unlisted party, when not pruning', async () => {
    const h = await converged();
    const without = configVariant(DEVNET_CONFIG, (raw) => {
      withoutParty(raw, HOLDER_B);
      raw.credentials.pruneUnlisted = false;
    });
    const original = nth(credentialsOf(h, HOLDER_A), 0);
    const holderBCredential = nth(credentialsOf(h, HOLDER_B), 0);
    h.fake.archive(original.contractId);
    const shared = h.fake.seed('credential', {
      ...original.createArgument,
      claims: [
        { subject: HOLDER_A, property: 'canTransfer', value: 'DEMO' },
        { subject: HOLDER_B, property: 'canTransfer', value: 'DEMO' },
      ],
    });
    const mark = h.fake.submissions.length;

    const assessment = await h.assess('credentials', without);
    const result = await h.run('apply', without);

    expect(assessment).toEqual({
      status: 'blocked',
      summary: "Test holder A's credential also names unlisted parties",
      notes: [
        // The group takes in every credential naming its parties, so HOLDER_B's own credential too.
        `shared credential(s) ${shared}, ${holderBCredential.contractId} name ${HOLDER_B}`,
        'list those parties too, or revoke the shared credential by hand',
      ],
    });
    expect(result.outcome).toBe('blocked');
    expect(result.needsAttention).toBe(true);
    expect(h.since(mark)).toEqual([]);
  });

  it('replaces a credential shared by two listed parties in one submission, recreating both', async () => {
    const h = await converged();
    const a = nth(credentialsOf(h, HOLDER_A), 0);
    const b = nth(credentialsOf(h, HOLDER_B), 0);
    h.fake.archive(a.contractId);
    h.fake.archive(b.contractId);
    const shared = h.fake.seed('credential', {
      ...a.createArgument,
      claims: [
        { subject: HOLDER_A, property: 'canTransfer', value: 'DEMO' },
        { subject: HOLDER_A, property: 'canRedeem', value: 'DEMO' },
        { subject: HOLDER_B, property: 'canTransfer', value: 'DEMO' },
        { subject: HOLDER_B, property: 'canRedeem', value: 'DEMO' },
      ],
    });

    const assessment = await h.assess('credentials');
    const submission = onlySubmission(assessment);
    const mark = h.fake.submissions.length;
    const result = await h.run('apply');

    expect(submission.commands).toHaveLength(3);
    expect(exercise(submission, 0)).toEqual(expect.objectContaining({ contractId: shared, choice: 'Archive' }));
    expect(h.since(mark)).toHaveLength(1);
    expect(result.outcome).toBe('done');
    for (const party of [HOLDER_A, HOLDER_B]) {
      const all = credentialsOf(h, party);
      expect(all).toHaveLength(1);
      expect(
        new Set((nth(all, 0).createArgument['claims'] as Array<{ subject: string }>).map((c) => c.subject))
      ).toEqual(new Set([party]));
    }
  });

  it('blocks rather than drop another instrument’s claims carried on a listed party’s credential', async () => {
    const h = await converged();
    const original = nth(credentialsOf(h, HOLDER_A), 0);
    h.fake.archive(original.contractId);
    // Issued outside this setup (another id), so its other claims are not this setup's to drop.
    const mixed = h.fake.seed('credential', {
      ...original.createArgument,
      id: 'another allowlist',
      claims: [
        ...(original.createArgument['claims'] as unknown[]),
        { subject: HOLDER_A, property: 'canTransfer', value: 'OTHER' },
      ],
    });
    const mark = h.fake.submissions.length;

    const assessment = await h.assess('credentials');
    await h.run('apply');

    expect(assessment).toEqual({
      status: 'blocked',
      summary: "Test holder A's credential also carries claims for other instruments",
      notes: [
        `credential ${mixed} carries canTransfer=OTHER`,
        'split it by hand so this instrument’s claims stand alone',
      ],
    });
    expect(h.since(mark)).toEqual([]);
  });

  it('blocks rather than prune an unlisted party’s credential that carries another instrument’s claims', async () => {
    const h = await converged();
    const without = configVariant(DEVNET_CONFIG, (raw) => {
      withoutParty(raw, HOLDER_B);
    });
    const original = nth(credentialsOf(h, HOLDER_B), 0);
    h.fake.archive(original.contractId);
    const mixed = h.fake.seed('credential', {
      ...original.createArgument,
      id: 'another allowlist',
      claims: [
        ...(original.createArgument['claims'] as unknown[]),
        { subject: HOLDER_B, property: 'canRedeem', value: 'OTHER' },
      ],
    });

    const assessment = await h.assess('credentials', without);

    expect(assessment).toEqual({
      status: 'blocked',
      summary: 'an unlisted party’s credential also carries claims for other instruments',
      notes: [
        `credential ${mixed} carries canRedeem=OTHER`,
        'split it by hand so this instrument’s claims stand alone',
      ],
    });
  });

  it('retires the credentials issued under old claim names when both claims are renamed', async () => {
    const h = await converged();
    const renamed = configVariant(DEVNET_CONFIG, (raw) => {
      raw.instrument.claims.transfer.property = 'mayTransfer';
      raw.instrument.claims.redemption.property = 'mayRedeem';
    });

    const result = await h.run('apply', renamed);

    expect(stepResult(result, 'credentials').status).toBe('done');
    const properties = h.fake
      .contracts('credential')
      .flatMap((c) => (c.createArgument['claims'] as Array<{ property: string }>).map((claim) => claim.property));
    expect(new Set(properties)).toEqual(new Set(['mayTransfer', 'mayRedeem']));
    for (const party of [REGISTRAR, HOLDER_A, HOLDER_B]) expect(credentialsOf(h, party)).toHaveLength(1);
  });

  it('blocks when a credential its holder holds still grants a claim the config withdraws', async () => {
    const h = await converged();
    const original = nth(credentialsOf(h, HOLDER_B), 0);
    const heldByB = h.fake.seed('credential', {
      ...original.createArgument,
      holder: HOLDER_B,
      claims: [{ subject: HOLDER_B, property: 'canTransfer', value: 'DEMO' }],
    });
    const redemptionOnly = configVariant(DEVNET_CONFIG, (raw) => {
      const holderB = raw.credentials.parties.find((p) => p.party === HOLDER_B);
      if (holderB) holderB.claims = ['redemption'];
      raw.deliveries = raw.deliveries.filter((d) => d.party !== HOLDER_B);
    });
    const mark = h.fake.submissions.length;

    const assessment = await h.assess('credentials', redemptionOnly);
    await h.run('apply', redemptionOnly);

    expect(assessment).toEqual({
      status: 'blocked',
      summary: 'a credential its holder holds grants a claim the config withholds',
      notes: [
        `${heldByB} gives ${HOLDER_B} canTransfer=DEMO`,
        'revoke it with Credential_Revoke (actor: the registrar), or give the party that claim in the config',
      ],
    });
    expect(h.since(mark)).toEqual([]);
  });

  it('ignores an expired holder-held credential when a party is downgraded', async () => {
    const h = await converged();
    const original = nth(credentialsOf(h, HOLDER_B), 0);
    h.fake.seed('credential', {
      ...original.createArgument,
      holder: HOLDER_B,
      validUntil: isoAt(-DAY_MS),
      claims: [{ subject: HOLDER_B, property: 'canTransfer', value: 'DEMO' }],
    });
    const redemptionOnly = configVariant(DEVNET_CONFIG, (raw) => {
      const holderB = raw.credentials.parties.find((p) => p.party === HOLDER_B);
      if (holderB) holderB.claims = ['redemption'];
      raw.deliveries = raw.deliveries.filter((d) => d.party !== HOLDER_B);
    });

    const assessment = await h.assess('credentials', redemptionOnly);

    expect(assessment.status).toBe('pending');
  });

  it('blocks on a credential carrying the setup’s id that also holds another instrument’s claim', async () => {
    const h = await converged();
    const original = nth(credentialsOf(h, HOLDER_A), 0);
    h.fake.archive(original.contractId);
    const mixed = h.fake.seed('credential', {
      ...original.createArgument,
      claims: [
        ...(original.createArgument['claims'] as unknown[]),
        { subject: HOLDER_A, property: 'canTransfer', value: 'OTHER' },
      ],
    });

    const assessment = await h.assess('credentials');

    expect(assessment).toEqual({
      status: 'blocked',
      summary: "Test holder A's credential also carries claims for other instruments",
      notes: [
        `credential ${mixed} carries canTransfer=OTHER`,
        'split it by hand so this instrument’s claims stand alone',
      ],
    });
  });

  it('blocks on a credential carrying the setup’s id whose extra claim shares only a value with this instrument’s', async () => {
    // Claims whose value does not name the instrument (`true`): another instrument's claim with the same value is not ours.
    const valued = configVariant(devnet, (raw) => {
      raw.instrument.claims.transfer = { property: 'DEMO.canTransfer', value: 'true' };
      raw.instrument.claims.redemption = { property: 'DEMO.canRedeem', value: 'true' };
    });
    const h = await converged(valued);
    const original = nth(credentialsOf(h, HOLDER_A), 0);
    h.fake.archive(original.contractId);
    const mixed = h.fake.seed('credential', {
      ...original.createArgument,
      claims: [
        ...(original.createArgument['claims'] as unknown[]),
        { subject: HOLDER_A, property: 'OTHER.canTransfer', value: 'true' },
      ],
    });

    const assessment = await h.assess('credentials');

    expect(assessment).toEqual({
      status: 'blocked',
      summary: "Test holder A's credential also carries claims for other instruments",
      notes: [
        `credential ${mixed} carries OTHER.canTransfer=true`,
        'split it by hand so this instrument’s claims stand alone',
      ],
    });
  });

  it('blocks on a holder-held credential of an unlisted party only when pruning', async () => {
    const h = await converged();
    const original = nth(credentialsOf(h, HOLDER_B), 0);
    h.fake.seed('credential', { ...original.createArgument, holder: HOLDER_B });
    const pruning = configVariant(DEVNET_CONFIG, (raw) => withoutParty(raw, HOLDER_B));
    const keeping = configVariant(DEVNET_CONFIG, (raw) => {
      withoutParty(raw, HOLDER_B);
      raw.credentials.pruneUnlisted = false;
    });

    expect((await h.assess('credentials', pruning)).status).toBe('blocked');
    expect((await h.assess('credentials', keeping)).status).toBe('done');
  });

  it('notes, but leaves alone, registrar-issued credentials that other parties hold', async () => {
    const h = await converged();
    const original = nth(credentialsOf(h, HOLDER_A), 0);
    h.fake.seed('credential', { ...original.createArgument, holder: HOLDER_A });

    const assessment = await h.assess('credentials');

    expect(assessment.status).toBe('done');
    expect(assessment.notes).toEqual(['1 registrar-issued credential(s) held by others are not managed here']);
  });
});

describe('instrument configuration convergence', () => {
  async function convergedWithServiceCid(
    h?: Harness
  ): Promise<{ h: Harness; serviceCid: string; original: SimContractView }> {
    const ready = h ?? (await converged());
    const service = nth(ready.fake.contracts('registrarService'), 0);
    const original = nth(ready.fake.contracts('instrumentConfiguration'), 0);
    return { h: ready, serviceCid: service.contractId, original };
  }

  it('archives a second matching configuration and keeps the first', async () => {
    const { h, serviceCid, original } = await convergedWithServiceCid();
    const extra = h.fake.seed('instrumentConfiguration', original.createArgument);

    const assessment = await h.assess('instrument-configuration');

    expect(assessment.status).toBe('pending');
    expect(assessment.summary).toBe('2 configurations; archive the extras');
    expect(onlySubmission(assessment).commands).toEqual([
      {
        ExerciseCommand: {
          templateId: T.registrarService,
          contractId: serviceCid,
          choice: 'RegistrarService_ArchiveInstrumentConfiguration',
          choiceArgument: { cid: extra },
        },
      },
    ]);
    // With two configurations the token steps cannot tell which one is current.
    expect((await h.assess('supply')).summary).toBe('needs instrument-configuration');

    const result = await h.run('apply');

    expect(result.outcome).toBe('done');
    expect(h.fake.contracts('instrumentConfiguration').map((c) => c.contractId)).toEqual([original.contractId]);
  });

  it.each<[string, (arg: Record<string, unknown>) => Record<string, unknown>]>([
    [
      'holder requirement',
      (arg) => ({
        ...arg,
        holderRequirements: [{ issuer: REGISTRAR, requiredClaims: [{ _1: 'canTransfer', _2: 'OTHER' }] }],
      }),
    ],
    [
      'issuer requirement issuer',
      (arg) => ({
        ...arg,
        issuerRequirements: [{ issuer: OPERATOR, requiredClaims: [{ _1: 'canRedeem', _2: 'DEMO' }] }],
      }),
    ],
    ['blocklist flag', (arg) => ({ ...arg, checkBlockList: true })],
    [
      'additional identifiers',
      (arg) => ({ ...arg, additionalIdentifiers: [{ source: 'ISIN', id: 'US0000000001', scheme: 'ISIN' }] }),
    ],
  ])('replaces a configuration whose %s differs with ArchiveAndCreate', async (_what, mutate) => {
    const { h, serviceCid, original } = await convergedWithServiceCid();
    h.fake.archive(original.contractId);
    const mismatched = h.fake.seed('instrumentConfiguration', mutate(original.createArgument));

    const assessment = await h.assess('instrument-configuration');

    expect(assessment.status).toBe('pending');
    expect(assessment.summary).toBe('configuration differs from the config');
    expect(onlySubmission(assessment).commands).toEqual([
      {
        ExerciseCommand: {
          templateId: T.registrarService,
          contractId: serviceCid,
          choice: 'RegistrarService_ArchiveAndCreateInstrumentConfiguration',
          choiceArgument: { cid: mismatched, payload: desiredDaRegistryInstrumentConfiguration(devnet) },
        },
      },
    ]);

    const result = await h.run('apply');

    expect(result.outcome).toBe('done');
    const configurations = h.fake.contracts('instrumentConfiguration');
    expect(configurations).toHaveLength(1);
    expect(nth(configurations, 0).contractId).not.toBe(mismatched);
    expect(nth(configurations, 0).createArgument).toEqual(original.createArgument);
  });

  it('archives the extras before replacing the first when none matches, in one submission', async () => {
    const { h, serviceCid, original } = await convergedWithServiceCid();
    h.fake.archive(original.contractId);
    const first = h.fake.seed('instrumentConfiguration', { ...original.createArgument, checkBlockList: true });
    const second = h.fake.seed('instrumentConfiguration', { ...original.createArgument, checkBlockList: true });

    const assessment = await h.assess('instrument-configuration');

    // The simulator, like DA, allows one configuration per instrument, so the extras must go first.
    expect(onlySubmission(assessment).commands).toEqual([
      {
        ExerciseCommand: {
          templateId: T.registrarService,
          contractId: serviceCid,
          choice: 'RegistrarService_ArchiveInstrumentConfiguration',
          choiceArgument: { cid: second },
        },
      },
      {
        ExerciseCommand: {
          templateId: T.registrarService,
          contractId: serviceCid,
          choice: 'RegistrarService_ArchiveAndCreateInstrumentConfiguration',
          choiceArgument: { cid: first, payload: desiredDaRegistryInstrumentConfiguration(devnet) },
        },
      },
    ]);
    expect((await h.run('apply')).outcome).toBe('done');
    expect(h.fake.contracts('instrumentConfiguration')).toHaveLength(1);
  });

  it('treats an unset (null) checkBlockList as the blocklist being off', async () => {
    const { h, original } = await convergedWithServiceCid();
    h.fake.archive(original.contractId);
    h.fake.seed('instrumentConfiguration', { ...original.createArgument, checkBlockList: null });

    expect((await h.assess('instrument-configuration')).status).toBe('done');
  });

  it('on MainNet blocks on a differing live configuration instead of rewriting it', async () => {
    const { h, original } = await convergedWithServiceCid(await convergedMainnet());
    h.fake.archive(original.contractId);
    h.fake.seed('instrumentConfiguration', { ...original.createArgument, checkBlockList: true });
    const mark = h.fake.submissions.length;

    const assessment = await h.assess('instrument-configuration');
    const result = await h.run('apply');

    expect(assessment.status).toBe('blocked');
    expect(assessment.dependency).toBeUndefined();
    expect(assessment.summary).toBe('the live configuration differs from the config; change it by hand, not by apply');
    expect(result.outcome).toBe('blocked');
    expect(result.needsAttention).toBe(true);
    expect(h.since(mark)).toEqual([]);
  });

  it('on TestNet, as on MainNet, blocks on a differing live configuration instead of rewriting it', async () => {
    const { h, original } = await convergedWithServiceCid(await convergedMainnet());
    h.fake.archive(original.contractId);
    h.fake.seed('instrumentConfiguration', { ...original.createArgument, checkBlockList: true });
    const testnet = configVariant(MAINNET_CONFIG, (raw) => {
      raw.network = 'testnet';
    });

    const assessment = await h.assess('instrument-configuration', testnet);

    expect(assessment.status).toBe('blocked');
    expect(assessment.summary).toBe('the live configuration differs from the config; change it by hand, not by apply');
    expect(assessment.actions).toBeUndefined();
  });

  it('on MainNet still archives a second matching configuration', async () => {
    const { h, original } = await convergedWithServiceCid(await convergedMainnet());
    h.fake.seed('instrumentConfiguration', original.createArgument);

    expect(submissionLabels([onlySubmission(await h.assess('instrument-configuration'))])).toEqual([
      'RegistrarService.RegistrarService_ArchiveInstrumentConfiguration',
    ]);
  });
});

describe('supply', () => {
  it('cancels an expired setup mint offer left by an earlier run', async () => {
    const h = await converged();
    const offer = h.fake.seed('mintOffer', mintOfferArgs('5', isoAt(-2 * HOUR_MS), isoAt(-HOUR_MS)));

    const assessment = await h.assess('supply');

    expect(assessment.status).toBe('pending');
    expect(assessment.summary).toBe('cancel mint offer for 5 (expired)');
    expect(onlySubmission(assessment).commands).toEqual([
      {
        ExerciseCommand: {
          templateId: T.mintOffer,
          contractId: offer,
          choice: 'MintOffer_Cancel',
          choiceArgument: { extraArgs: null },
        },
      },
    ]);

    const mark = h.fake.submissions.length;
    expect((await h.run('apply')).outcome).toBe('done');
    expect(submissionLabels(h.since(mark))).toEqual(['MintOffer.MintOffer_Cancel']);
    expect(h.fake.contracts('mintOffer')).toEqual([]);
    expect(h.fake.balance().toFixed()).toBe('1000000');
  });

  it('cancels two expired setup offers in successive rounds without tripping the repeat-write guard', async () => {
    const h = await converged();
    h.fake.seed('mintOffer', mintOfferArgs('5', isoAt(-2 * HOUR_MS), isoAt(-HOUR_MS)));
    h.fake.seed('mintOffer', mintOfferArgs('7', isoAt(-2 * HOUR_MS), isoAt(-HOUR_MS)));

    const mark = h.fake.submissions.length;
    const result = await h.run('apply');

    expect(result.outcome).toBe('done');
    expect(submissionLabels(h.since(mark))).toEqual(['MintOffer.MintOffer_Cancel', 'MintOffer.MintOffer_Cancel']);
    expect(h.fake.contracts('mintOffer')).toEqual([]);
  });

  it('cancels a valid setup offer that would take supply above the total', async () => {
    const h = await converged();
    h.fake.seed('mintOffer', mintOfferArgs('5', isoAt(-HOUR_MS), isoAt(HOUR_MS)));

    const assessment = await h.assess('supply');

    expect(assessment.summary).toBe('cancel mint offer for 5 (would exceed the target)');
    expect(exercise(onlySubmission(assessment)).choice).toBe('MintOffer_Cancel');
  });

  it('leaves alone a mint offer this setup did not create', async () => {
    const h = await converged();
    const foreign = h.fake.seed(
      'mintOffer',
      mintOfferArgs('5', isoAt(-HOUR_MS), isoAt(-1_000), 'deposit: off-ledger confirmation 42')
    );

    const assessment = await h.assess('supply');

    expect(assessment.status).toBe('done');
    expect((await h.run('apply')).outcome).toBe('done');
    expect(h.fake.contracts('mintOffer').map((c) => c.contractId)).toEqual([foreign]);
  });

  it('accepts an outstanding valid setup offer instead of offering a new mint', async () => {
    const h = await converged();
    const raised = configVariant(DEVNET_CONFIG, (raw) => (raw.supply = { total: '1000500' }));
    const offer = h.fake.seed('mintOffer', mintOfferArgs('500', isoAt(-HOUR_MS), isoAt(HOUR_MS)));

    const assessment = await h.assess('supply', raised);

    expect(assessment.summary).toBe('accept the outstanding mint offer for 500');
    expect(exercise(onlySubmission(assessment))).toEqual(
      expect.objectContaining({ contractId: offer, choice: 'MintOffer_Accept' })
    );

    const mark = h.fake.submissions.length;
    expect((await h.run('apply', raised)).outcome).toBe('done');
    expect(submissionLabels(h.since(mark))).toEqual(['MintOffer.MintOffer_Accept']);
    expect(h.fake.balance().toFixed()).toBe('1000500');
    expect(h.fake.balance(REGISTRAR).toFixed()).toBe('980500');
  });

  it('offers and accepts only the shortfall when the total is raised', async () => {
    const h = await converged();
    const raised = configVariant(DEVNET_CONFIG, (raw) => (raw.supply = { total: '1000500' }));
    const mark = h.fake.submissions.length;

    expect((await h.run('apply', raised)).outcome).toBe('done');

    const submissions = h.since(mark);
    expect(submissionLabels(submissions)).toEqual([
      'AllocationFactory.AllocationFactory_OfferMint',
      'MintOffer.MintOffer_Accept',
    ]);
    expect(exercise(submissions[0]).choiceArgument['mint']).toEqual(
      expect.objectContaining({ amount: '500', reference: 'da-registry-setup devnet: supply to 1000500' })
    );
    expect(h.fake.balance().toFixed()).toBe('1000500');
  });

  it('blocks, and apply stops there, when supply is above the configured total', async () => {
    const h = await converged();
    const lowered = configVariant(DEVNET_CONFIG, (raw) => (raw.supply = { total: '999999' }));
    const mark = h.fake.submissions.length;

    const result = await h.run('apply', lowered);

    expect(result.outcome).toBe('blocked');
    expect(result.needsAttention).toBe(true);
    expect(result.steps.map((s) => s.id)).toEqual(STEP_IDS.slice(0, STEP_IDS.indexOf('supply') + 1));
    expect(stepResult(result, 'supply')).toEqual(
      expect.objectContaining({
        status: 'blocked',
        dependency: false,
        summary: 'supply 1000000 exceeds the configured 999999',
        notes: ['reduce supply by redemption (burn), or raise supply.total in the config'],
      })
    );
    expect(h.since(mark)).toEqual([]);
  });

  it('needs credentials until the registrar holds a valid redemption credential', async () => {
    const h = await converged();
    for (const credential of credentialsOf(h, REGISTRAR)) h.fake.archive(credential.contractId);

    const assessment = await h.assess('supply');

    expect(assessment).toEqual({
      status: 'blocked',
      summary: 'needs credentials: the registrar has no valid redemption claim',
      dependency: true,
    });
  });

  it('is not managed when the config declares no supply, and nothing is minted', async () => {
    const noSupply = configVariant(DEVNET_CONFIG, (raw) => {
      raw.supply = null;
      raw.deliveries = [];
    });
    const h = await converged(noSupply);

    expect(stepResult(await h.run('plan'), 'supply')).toEqual(
      expect.objectContaining({ status: 'done', summary: 'not managed here', evidence: { supply: '0' } })
    );
    expect(submissionLabels(h.fake.submissions)).not.toContain('AllocationFactory.AllocationFactory_OfferMint');
    expect(h.fake.balance().toFixed()).toBe('0');
  });
});

describe('deliveries', () => {
  it('waits without polling, and submits nothing towards a receiver that has no preapproval', async () => {
    const noPreapprovalForB = configVariant(DEVNET_CONFIG, (raw) => {
      raw.preapprovals = raw.preapprovals.filter((p) => p.party !== HOLDER_B);
    });
    const h = harness(noPreapprovalForB);

    const result = await h.run('apply');
    const assessment = await h.assess('deliveries');

    expect(result.outcome).toBe('waiting');
    expect(result.needsAttention).toBe(false);
    expect(stepResult(result, 'deliveries')).toEqual(
      expect.objectContaining({
        status: 'waiting',
        notes: ["Test holder B: no DEMO preapproval (DA offers 'offer'); the holder must create one"],
      })
    );
    expect(assessment.poll).toBe(false);
    const transfers = h.fake.submissions.filter((s) => s.commandIdPrefix === 'da-registry-devnet-deliveries');
    expect(transfers.map((s) => (exercise(s).choiceArgument['transfer'] as { receiver: string }).receiver)).toEqual([
      HOLDER_A,
    ]);
    expect(h.fake.balance(HOLDER_A).toFixed()).toBe('10000');
    expect(h.fake.balance(HOLDER_B).toFixed()).toBe('0');
    // Only the provider request was polled: polling cannot create B's preapproval.
    expect(h.sleeps).toEqual([10_000]);
  });

  it('polls when DA does not yet serve the preapproval of a receiver this setup manages', async () => {
    const raised = configVariant(DEVNET_CONFIG, (raw) => {
      const holderA = raw.deliveries.find((d) => d.party === HOLDER_A);
      if (holderA) holderA.minBalance = '20000';
    });
    const h = await converged();
    const preapprovalA = nth(
      h.fake.contracts('transferPreapproval').filter((c) => c.createArgument['receiver'] === HOLDER_A),
      0
    );
    h.fake.archive(preapprovalA.contractId);

    const assessment = await h.assess('deliveries', raised);

    expect(assessment).toEqual(
      expect.objectContaining({
        status: 'waiting',
        poll: true,
        notes: ['Test holder A: DA does not serve its DEMO preapproval yet'],
      })
    );
  });

  it('waits, polling, while DA has not indexed the registrar’s holdings yet', async () => {
    const h = harness();
    h.fake.transferFactoryError = new Error(
      'POST https://api.utilities.digitalasset-dev.com/…/transfer-factory failed: 404 {"error":"Holding 0042 not found"}'
    );

    const result = await h.run('apply');

    expect(result.outcome).toBe('waiting');
    const deliveries = stepResult(result, 'deliveries');
    expect(deliveries.status).toBe('waiting');
    expect(deliveries.notes).toHaveLength(2);
    expect(deliveries.notes[0]).toMatch(
      /^Test holder A: DA has not indexed the registrar's holdings or instrument yet \(POST .*not found/
    );
    expect((await h.assess('deliveries')).poll).toBe(true);
    expect(h.fake.submissions.filter((s) => s.commandIdPrefix === 'da-registry-devnet-deliveries')).toEqual([]);
    // One poll for the provider request, then the deliveries step's three minutes at 10 s.
    expect(h.sleeps).toHaveLength(1 + 18);
  });

  it('reports any other DA error as a blocked step that needs attention', async () => {
    const h = harness();
    h.fake.transferFactoryError = new Error('POST …/transfer-factory failed: 500 {"error":"internal"}');

    const result = await h.run('apply');

    expect(result.outcome).toBe('blocked');
    expect(result.needsAttention).toBe(true);
    expect(stepResult(result, 'deliveries')).toEqual(
      expect.objectContaining({
        status: 'blocked',
        summary: 'the step failed to read its state',
        notes: ['POST …/transfer-factory failed: 500 {"error":"internal"}'],
      })
    );
  });

  it('never spends a locked holding and blocks when the registrar is short', async () => {
    const h = await converged();
    const registrarHolding = nth(
      h.fake.contracts('holding').filter((c) => c.createArgument['owner'] === REGISTRAR),
      0
    );
    h.fake.archive(registrarHolding.contractId);
    h.fake.seed('holding', { ...registrarHolding.createArgument, lock: { holders: [REGISTRAR], context: 'swap' } });
    const more = configVariant(DEVNET_CONFIG, (raw) => {
      nth(raw.deliveries, 0).minBalance = '20000';
    });

    const assessment = await h.assess('deliveries', more);

    expect(assessment.status).toBe('blocked');
    expect(assessment.summary).toBe('the registrar holds 0 spendable, short of 10000 for Test holder A');
  });
});

describe('DA API transfer-only parties', () => {
  it('notes the parties it cannot check through a mint-offer context', async () => {
    const transferOnly = configVariant(DEVNET_CONFIG, (raw) => {
      const holderB = raw.credentials.parties.find((p) => p.party === HOLDER_B);
      if (holderB) holderB.claims = ['transfer'];
    });
    const h = await converged(transferOnly);

    const assessment = await h.assess('da-api', transferOnly);

    expect(assessment.status).toBe('done');
    expect(assessment.notes).toContain(
      'not checked here (transfer claim only; checked when they first transact): Test holder B'
    );
  });
});

describe('ledger access', () => {
  it('blocks, and apply stops before writing, when the user lacks CanActAs for a configured party', async () => {
    const h = harness();
    h.fake.actAsRights.delete(HOLDER_B);

    const result = await h.run('apply');

    expect(result.outcome).toBe('blocked');
    expect(result.needsAttention).toBe(true);
    expect(result.steps).toEqual([
      expect.objectContaining({
        id: 'ledger-access',
        status: 'blocked',
        dependency: false,
        evidence: {
          ledgerUser: 'setup-user',
          synchronizer: devnet.ledger.synchronizerId,
          daOperator: OPERATOR,
        },
        notes: [`user setup-user lacks CanActAs for: ${HOLDER_B}`],
      }),
    ]);
    expect(h.fake.submissions).toEqual([]);
  });

  it('blocks when DA’s API reports another operator than the config pins', async () => {
    const h = harness();
    const resetOperator = `auth0_newoperator::1220${'f'.repeat(64)}`;
    h.fake.daOperator = resetOperator;

    const assessment = await h.assess('ledger-access');

    expect(assessment.status).toBe('blocked');
    expect(assessment.notes).toEqual([`DA's API reports operator ${resetOperator}, but the config pins ${OPERATOR}`]);
  });

  it('blocks when the registrar is not connected to the configured synchronizer', async () => {
    const h = harness();
    h.fake.connectedSynchronizers = [`global-domain::1220${'0'.repeat(64)}`];

    const assessment = await h.assess('ledger-access');

    expect(assessment.status).toBe('blocked');
    expect(assessment.notes?.[0]).toMatch(new RegExp(`^${REGISTRAR} is not connected to ${DEVNET_SYNCHRONIZER}`));
  });

  it('with a stale synchronizer pin, plan blocks the reading steps on ledger-access instead of planning a fresh setup', async () => {
    const h = await converged();
    h.fake.connectedSynchronizers = [`global-domain::1220${'0'.repeat(64)}`];
    h.logs.length = 0;

    const result = await h.run('plan');

    expect(stepResult(result, 'ledger-access').status).toBe('blocked');
    const reading = result.steps.filter((s) => !['ledger-access', 'da-packages'].includes(s.id));
    expect(reading.length).toBeGreaterThan(0);
    for (const step of reading) {
      expect(step).toEqual(
        expect.objectContaining({ status: 'blocked', dependency: true, summary: 'needs ledger-access' })
      );
    }
    expect(h.logs.join('\n')).not.toContain('"commandIdPrefix"');
  });

  it('needs no ParticipantAdmin, since the setup never uploads a DAR', async () => {
    const h = harness();
    h.fake.participantAdmin = false;

    const assessment = await h.assess('ledger-access');

    expect(assessment.status).toBe('done');
    expect(assessment.evidence).not.toHaveProperty('participantAdmin');
  });
});

describe('credentials renewal window', () => {
  it.each<[string, number, string]>([
    ['10 days out', 10 * DAY_MS, 'blocked'],
    ['exactly renewWithinDays out', 30 * DAY_MS, 'blocked'],
    ['just past renewWithinDays', 30 * DAY_MS + 1_000, 'pending'],
  ])('with validUntil %s the step is %s', async (_when, offset, status) => {
    const validUntil = isoAt(offset);
    const config = configVariant(DEVNET_CONFIG, (raw) => (raw.credentials.validUntil = validUntil));
    const h = harness(config);

    const assessment = await h.assess('credentials');

    expect(assessment.status).toBe(status);
    if (status === 'blocked') {
      expect(assessment.dependency).toBeUndefined();
      expect(assessment.summary).toBe(`credentials.validUntil ${validUntil} is within the renewal window`);
      expect(assessment.notes).toEqual([
        `set a validUntil after ${new Date(NOW.getTime() + 30 * DAY_MS).toISOString()} in ${CONFIG_SOURCE}`,
      ]);
    }
  });
});

describe('provider and registrar services', () => {
  it('blocks with DA’s reason when the provider request was rejected', async () => {
    const h = harness();
    const rejected = h.fake.seed('rejectedProviderServiceRequest', {
      operator: OPERATOR,
      request: { operator: OPERATOR, provider: REGISTRAR },
      reason: 'no signed agreement',
    });

    const assessment = await h.assess('provider-service');

    expect(assessment).toEqual({
      status: 'blocked',
      summary: 'DA rejected the provider request',
      notes: ['reason: no signed agreement', `cid: ${rejected}`],
    });
  });

  it('ignores a rejection under another DA operator and requests the service again', async () => {
    const h = harness();
    h.fake.seed('rejectedProviderServiceRequest', {
      operator: OPERATOR,
      request: { operator: `old-operator::1220${'a'.repeat(64)}`, provider: REGISTRAR },
      reason: 'from before a DevNet reset',
    });

    const assessment = await h.assess('provider-service');

    expect(assessment.status).toBe('pending');
    expect(onlySubmission(assessment).commands).toEqual([
      {
        CreateCommand: {
          templateId: T.providerServiceRequest,
          createArguments: { operator: OPERATOR, provider: REGISTRAR },
        },
      },
    ]);
  });

  it('waits on a new provider request even when an older one was rejected', async () => {
    const h = harness();
    h.fake.seed('rejectedProviderServiceRequest', {
      operator: OPERATOR,
      request: { operator: OPERATOR, provider: REGISTRAR },
      reason: 'no signed agreement',
    });
    const request = h.fake.seed('providerServiceRequest', { operator: OPERATOR, provider: REGISTRAR });

    const assessment = await h.assess('provider-service');

    expect(assessment).toEqual({
      status: 'waiting',
      summary: 'waiting for DA’s operator to accept the provider request',
      evidence: { providerServiceRequest: request },
    });
  });

  it('on MainNet submits the request once and waits for DA by hand, without polling', async () => {
    const h = harness(mainnet, { autoAcceptProvider: false });

    const first = await h.run('apply');
    const second = await h.run('apply');

    for (const result of [first, second]) {
      expect(result.outcome).toBe('waiting');
      expect(result.needsAttention).toBe(false);
      expect(stepResult(result, 'provider-service').summary).toBe(
        'waiting for DA’s operator to accept the provider request'
      );
    }
    expect(h.sleeps).toEqual([]);
    expect(submissionLabels(h.fake.submissions)).toEqual(['create ProviderServiceRequest']);

    h.fake.acceptProviderRequests();
    const mark = h.fake.submissions.length;
    const third = await h.run('apply');

    expect(third.outcome).toBe('done');
    expect(stepResult(third, 'supply').summary).toBe('not managed here');
    expect(submissionLabels(h.since(mark))).toEqual([
      'ProviderService.ProviderService_CreateProviderConfiguration',
      'createAndExercise RegistrarServiceRequest.RegistrarServiceRequest_Accept',
      'RegistrarService.RegistrarService_CreateInstrumentConfiguration',
      'create Credential',
      'create TransferPreapproval',
    ]);
    expect(h.fake.submissions.every((s) => s.commandIdPrefix.startsWith('da-registry-mainnet-'))).toBe(true);
    expect(h.fake.balance().toFixed()).toBe('0');
  });

  it('deletes only the registrar’s own rejected registrar request and accepts a pending one rather than creating another', async () => {
    const h = harness();
    h.fake.seed('providerService', { operator: OPERATOR, provider: REGISTRAR });
    const providerConfiguration = h.fake.seed('providerConfiguration', {
      operator: OPERATOR,
      provider: REGISTRAR,
      registrarRequirements: [],
      holderRequirements: [],
    });
    const request = {
      operator: OPERATOR,
      provider: REGISTRAR,
      registrar: REGISTRAR,
      createTransferRule: true,
      createAllocationFactory: true,
    };
    const rejected = h.fake.seed('rejectedRegistrarServiceRequest', { operator: OPERATOR, request, reason: 'stale' });
    // Under an operator from before a DevNet reset: the registrar cannot delete it, so the step must not try.
    const oldOperator = `auth0_oldoperator::1220${'e'.repeat(64)}`;
    const foreign = h.fake.seed('rejectedRegistrarServiceRequest', {
      operator: oldOperator,
      request: { ...request, operator: oldOperator },
      reason: 'reset',
    });
    const pending = h.fake.seed('registrarServiceRequest', request);

    const assessment = await h.assess('registrar-service');

    expect(assessment.summary).toBe('registrar request is pending; accept it');
    expect(submissionLabels([onlySubmission(assessment)])).toEqual([
      'RejectedRegistrarServiceRequest.RejectedRegistrarServiceRequest_Delete',
      'RegistrarServiceRequest.RegistrarServiceRequest_Accept',
    ]);
    expect(exercise(onlySubmission(assessment), 0).contractId).toBe(rejected);
    expect(exercise(onlySubmission(assessment), 1)).toEqual(
      expect.objectContaining({
        templateId: T.registrarServiceRequest,
        contractId: pending,
        choiceArgument: { providerConfigurationCid: providerConfiguration, credentialCids: [] },
      })
    );

    expect((await h.run('apply')).outcome).toBe('done');
    expect(h.fake.contracts('registrarService')).toHaveLength(1);
    expect(h.fake.contracts('rejectedRegistrarServiceRequest').map((c) => c.contractId)).toEqual([foreign]);
  });

  it('accepts the registrar request with the requirement-free provider configuration', async () => {
    const h = harness();
    h.fake.seed('providerService', { operator: OPERATOR, provider: REGISTRAR });
    h.fake.seed('providerConfiguration', {
      operator: OPERATOR,
      provider: REGISTRAR,
      registrarRequirements: [{ issuer: REGISTRAR, requiredClaims: [{ _1: 'isRegistrar', _2: 'yes' }] }],
      holderRequirements: [],
    });
    const open = h.fake.seed('providerConfiguration', {
      operator: OPERATOR,
      provider: REGISTRAR,
      registrarRequirements: [],
      holderRequirements: [],
    });

    const assessment = await h.assess('registrar-service');

    const command = onlySubmission(assessment).commands[0];
    expect(command).toEqual({
      CreateAndExerciseCommand: expect.objectContaining({
        choice: 'RegistrarServiceRequest_Accept',
        choiceArgument: { providerConfigurationCid: open, credentialCids: [] },
      }),
    });
  });

  it('recreates a missing transfer rule from the registrar service', async () => {
    const h = await converged();
    const rule = nth(h.fake.contracts('transferRule'), 0);
    h.fake.archive(rule.contractId);

    const assessment = await h.assess('registrar-service');

    expect(assessment.evidence?.['transferRule']).toBe('missing');
    expect(submissionLabels([onlySubmission(assessment)])).toEqual([
      'RegistrarService.RegistrarService_CreateTransferRule',
    ]);
    expect((await h.run('apply')).outcome).toBe('done');
    expect(h.fake.contracts('transferRule')).toHaveLength(1);
  });

  it('replaces a provider configuration that carries requirements', async () => {
    const h = harness();
    const service = h.fake.seed('providerService', { operator: OPERATOR, provider: REGISTRAR });
    const strict = h.fake.seed('providerConfiguration', {
      operator: OPERATOR,
      provider: REGISTRAR,
      registrarRequirements: [{ issuer: REGISTRAR, requiredClaims: [{ _1: 'isRegistrar', _2: 'yes' }] }],
      holderRequirements: [],
    });

    const assessment = await h.assess('provider-configuration');

    expect(onlySubmission(assessment).commands).toEqual([
      {
        ExerciseCommand: {
          templateId: T.providerService,
          contractId: service,
          choice: 'ProviderService_ArchiveAndCreateProviderConfiguration',
          choiceArgument: { cid: strict, payload: { registrarRequirements: [], holderRequirements: [] } },
        },
      },
    ]);
    expect((await h.run('apply')).outcome).toBe('done');
    expect(h.fake.contracts('providerConfiguration').map((c) => c.createArgument['registrarRequirements'])).toEqual([
      [],
    ]);
  });
});

describe('DA packages', () => {
  const pinnedIds = devnet.da.packages.required.map((p) => p.packageId);

  it('is done when the pinned ids are on the registrar’s node and both nodes vet exactly them', async () => {
    const h = harness();
    const preferred = jest.spyOn(h.fake.ledger, 'preferredPackages');

    const assessment = await h.assess('da-packages');

    expect(assessment.status).toBe('done');
    expect(preferred).toHaveBeenCalledWith(
      [REGISTRAR, OPERATOR],
      devnet.da.packages.required.map((p) => p.name),
      devnet.ledger.synchronizerId
    );
  });

  it('blocks, for the node operator, when a pinned package is missing on the registrar’s node', async () => {
    const h = harness();
    h.fake.packagesOnNode = pinnedIds.slice(1);

    const assessment = await h.assess('da-packages');

    expect(assessment.status).toBe('blocked');
    expect(assessment.summary).toBe(
      'packages missing on the registrar’s node; ask the node operator to upload DA’s bundle'
    );
    expect(assessment.notes).toEqual(['missing: utility-registry-app-v0 0.9.2 (1eddd268bdd5…)']);
    expect(assessment.evidence?.['utility-registry-app-v0']).toBe('0.9.2 missing on the registrar’s node');
    expect(assessment.evidence?.['utility-registry-v0']).toBe('0.8.2 on the registrar’s node');
    expect(assessment.actions).toBeUndefined();
  });

  // On a node without DA's packages every later step that reads DA's templates is blocked only on da-packages.
  it('plans a node without DA’s packages as blocked on da-packages, for the node operator', async () => {
    const h = harness();
    h.fake.packagesOnNode = [];

    const result = await h.run('plan');

    expect(stepResult(result, 'da-packages').status).toBe('blocked');
    expect(stepResult(result, 'provider-service')).toEqual(
      expect.objectContaining({ status: 'blocked', dependency: true })
    );
    expect(result.needsAttention).toBe(true);
  });

  it('never uploads: apply on a node without DA’s packages stops at da-packages and writes nothing', async () => {
    const h = harness();
    h.fake.packagesOnNode = [];

    const result = await h.run('apply');

    expect(result.outcome).toBe('blocked');
    expect(result.needsAttention).toBe(true);
    expect(result.steps.map((s) => s.id)).toEqual(['ledger-access', 'da-packages']);
    expect(stepResult(result, 'da-packages').status).toBe('blocked');
    expect(h.fake.uploadedDars).toEqual([]);
    expect(h.fake.submissions).toEqual([]);
    expect(h.sleeps).toEqual([]);
  });

  it('blocks when preferred-packages fails', async () => {
    const h = harness();
    h.fake.ledger.preferredPackages = async () => {
      throw new Error('PACKAGE_NAMES_NOT_FOUND');
    };

    const assessment = await h.assess('da-packages');

    expect(assessment.status).toBe('blocked');
    expect(assessment.summary).toBe('the registrar’s node and DA’s do not both vet the packages');
    expect(assessment.notes).toEqual(['PACKAGE_NAMES_NOT_FOUND']);
  });

  it('blocks when both nodes vet other package ids than the config pins', async () => {
    const h = harness();
    h.fake.vettedPackages[0] = {
      ...nth(h.fake.vettedPackages, 0),
      packageId: 'ab'.repeat(32),
      packageVersion: '0.9.3',
    };
    h.fake.vettedPackages.splice(1, 1);

    const assessment = await h.assess('da-packages');

    expect(assessment.status).toBe('blocked');
    expect(assessment.summary).toBe('the packages both nodes vet differ from the config’s pins');
    expect(assessment.notes).toEqual([
      'utility-registry-app-v0: both vet 0.9.3 (abababababab…), config pins 0.9.2',
      'utility-registry-v0: both vet nothing, config pins 0.8.2',
      'if DA’s node lacks the pinned version, ask DA; if both vet another bundle, upgrade @fairmint/canton-node-sdk to a release whose command builders target it, then update the pins in the config',
    ]);
  });
});

describe('DA API', () => {
  it('waits while DA serves an older credential than the ledger holds', async () => {
    const h = await converged();
    const realFactory = h.fake.da.mintOfferFactory;
    h.fake.da.mintOfferFactory = async (holder, instrumentId) => {
      const factory = await realFactory(holder, instrumentId);
      if (factory) {
        factory.choiceContext.choiceContextData.values['utility.digitalasset.com/issuer-credentials'] = {
          tag: 'AV_List',
          value: [{ tag: 'AV_ContractId', value: '00stale' }],
        };
      }
      return factory;
    };

    const assessment = await h.assess('da-api');

    expect(assessment.status).toBe('waiting');
    expect(assessment.notes).toHaveLength(3);
    expect(assessment.notes?.[0]).toBe(
      `${REGISTRAR_LABEL}: DA serves [00stale], not ${nth(credentialsOf(h, REGISTRAR), 0).contractId}`
    );
  });

  it('waits while DA serves an archived instrument configuration in its context', async () => {
    const h = await converged();
    const realFactory = h.fake.da.mintOfferFactory;
    h.fake.da.mintOfferFactory = async (holder, instrumentId) => {
      const factory = await realFactory(holder, instrumentId);
      if (factory) {
        factory.choiceContext.choiceContextData.values['utility.digitalasset.com/instrument-configuration'] = {
          tag: 'AV_ContractId',
          value: '00archived',
        };
      }
      return factory;
    };
    const [current] = h.fake.contracts('instrumentConfiguration');

    const assessment = await h.assess('da-api');

    expect(assessment.status).toBe('waiting');
    expect(assessment.notes?.[0]).toBe(
      `${REGISTRAR_LABEL}: DA serves instrument configuration 00archived, not ${current?.contractId ?? ''}`
    );
  });

  it('notes when DA does not serve Token Standard V2', async () => {
    const h = await converged();
    delete h.fake.supportedApis['splice-api-token-transfer-instruction-v2'];

    const assessment = await h.assess('da-api');

    expect(assessment.status).toBe('done');
    expect(assessment.notes).toEqual([
      'Token Standard V2 is not served: DA’s API does not list splice-api-token-transfer-instruction-v2 for the registrar; ask the node operator and DA whether the V2 packages are vetted',
    ]);
  });

  it('waits, without asking for mint offers, while DA does not know the registrar or instrument yet', async () => {
    const h = await converged();
    h.fake.daLagging = true;
    const calls = h.fake.daCalls.length;

    const assessment = await h.assess('da-api');

    expect(assessment.status).toBe('waiting');
    expect(assessment.notes).toEqual(['DA does not know the registrar yet', 'DA does not know DEMO yet']);
    expect(h.fake.daCalls.slice(calls).map((c) => c.method)).toEqual(['registryInfo', 'instrumentMetadata']);
  });

  it('waits while DA’s mint-offer lookup 404s', async () => {
    const h = await converged();
    h.fake.mintOfferLagging = true;

    const assessment = await h.assess('da-api');

    expect(assessment.status).toBe('waiting');
    expect(assessment.notes).toEqual(
      devnet.credentials.parties.map((p) => `${p.label}: DA has not indexed the allocation factory or instrument yet`)
    );
  });
});
