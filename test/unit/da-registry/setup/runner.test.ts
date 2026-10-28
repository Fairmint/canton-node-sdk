import {
  DA_REGISTRY_SETUP_MAX_ROUNDS_PER_STEP,
  formatDaRegistrySetupSubmission,
  runDaRegistrySetupSteps,
  type DaRegistrySetupAction,
  type DaRegistrySetupStep,
  type DaRegistrySetupStepAssessment,
  type DaRegistrySetupStepStatus,
} from '../../../../src/da-registry';
import { type LedgerSubmission } from '../../../../src/utils/ledger';
import { nth } from './fixtures';

const POLL_MS = 10_000;

function submissionFor(id: string): LedgerSubmission {
  return {
    commandIdPrefix: `test-${id}`,
    actAs: ['registrar::1220'],
    commands: [{ CreateCommand: { templateId: '#pkg:Mod:Thing', createArguments: { id } } }],
  };
}

function assessment(
  status: DaRegistrySetupStepStatus,
  actions: DaRegistrySetupAction[] = []
): DaRegistrySetupStepAssessment {
  return { status, summary: `${status} summary`, evidence: { seen: status }, notes: [`${status} note`], actions };
}

/** Blocked only until an earlier step is done, as the steps' `needs(...)` reports it. */
function dependencyBlock(stepId: string): DaRegistrySetupStepAssessment {
  return { status: 'blocked', summary: `needs ${stepId}`, dependency: true };
}

/** A step whose assess returns `sequence` in order, then repeats the last entry. */
function scriptedStep(
  id: string,
  sequence: DaRegistrySetupStepAssessment[],
  awaitMs?: number
): { step: DaRegistrySetupStep; assess: jest.Mock<Promise<DaRegistrySetupStepAssessment>, []> } {
  let calls = 0;
  const assess = jest.fn(async () => nth(sequence, Math.min(calls++, sequence.length - 1)));
  const step: DaRegistrySetupStep = {
    id,
    title: `${id} title`,
    why: `${id} why`,
    assess,
    ...(awaitMs ? { awaitMs } : {}),
  };
  return { step, assess };
}

interface MockDeps {
  submit: jest.Mock<Promise<{ updateId: string }>, [LedgerSubmission]>;
  log: jest.Mock<void, [string]>;
  sleep: jest.Mock<Promise<void>, [number]>;
  now: jest.Mock<number, []>;
}

function makeDeps(): { deps: MockDeps; lines: string[]; elapsed: () => number } {
  let now = 1_000_000;
  let updates = 0;
  const lines: string[] = [];
  const deps: MockDeps = {
    submit: jest.fn(async (_submission: LedgerSubmission) => ({ updateId: `u${++updates}` })),
    log: jest.fn((line: string) => {
      lines.push(line);
    }),
    sleep: jest.fn(async (ms: number) => {
      now += ms;
    }),
    now: jest.fn(() => now),
  };
  return { deps, lines, elapsed: () => now - 1_000_000 };
}

describe('runDaRegistrySetupSteps in plan mode', () => {
  it('assesses every step, prints the commands, and never submits or polls', async () => {
    const pending = assessment('pending', [
      { description: 'create the thing', submission: submissionFor('a') },
      { description: 'create the other thing', submission: submissionFor('b') },
    ]);
    const steps = [
      scriptedStep('one', [assessment('done')]),
      scriptedStep('two', [pending]),
      scriptedStep('three', [assessment('waiting')], 60_000),
      scriptedStep('four', [dependencyBlock('two')]),
      scriptedStep('five', [assessment('blocked')]),
    ];
    const { deps, lines } = makeDeps();

    const result = await runDaRegistrySetupSteps(
      steps.map((s) => s.step),
      'plan',
      deps
    );

    expect(deps.submit).not.toHaveBeenCalled();
    expect(deps.sleep).not.toHaveBeenCalled();
    for (const s of steps) expect(s.assess).toHaveBeenCalledTimes(1);
    expect(result.mode).toBe('plan');
    expect(result.steps.map((s) => [s.id, s.status])).toEqual([
      ['one', 'done'],
      ['two', 'pending'],
      ['three', 'waiting'],
      ['four', 'blocked'],
      ['five', 'blocked'],
    ]);
    // The first step that is not done decides the outcome, even with a blocked step later.
    expect(result.outcome).toBe('pending');
    expect(result.steps.map((s) => s.dependency)).toEqual([false, false, false, true, false]);
    // `five` is blocked on something a person must fix, not on an earlier step.
    expect(result.needsAttention).toBe(true);
    expect(result.steps[1]).toEqual({
      id: 'two',
      title: 'two title',
      status: 'pending',
      summary: 'pending summary',
      dependency: false,
      evidence: { seen: 'pending' },
      notes: ['pending note'],
      applied: [],
    });

    const output = lines.join('\n');
    expect(output).toContain('[2/5] two — two title');
    expect(output).toContain('      two why');
    expect(output).toContain('      → create the thing');
    expect(output).toContain('"commandIdPrefix": "test-a"');
    expect(output).toContain('      → create the other thing');
    expect(output).toContain('"commandIdPrefix": "test-b"');
    expect(output).toContain('      ! blocked note');
  });

  it('reports done when every step is done', async () => {
    const { deps } = makeDeps();
    const result = await runDaRegistrySetupSteps([scriptedStep('one', [assessment('done')]).step], 'plan', deps);
    expect(result.outcome).toBe('done');
    expect(result.needsAttention).toBe(false);
  });

  it('does not need attention when every block is only a dependency', async () => {
    const { deps } = makeDeps();
    const result = await runDaRegistrySetupSteps(
      [scriptedStep('one', [assessment('pending')]).step, scriptedStep('two', [dependencyBlock('one')]).step],
      'plan',
      deps
    );
    expect(result.outcome).toBe('pending');
    expect(result.needsAttention).toBe(false);
  });

  it('does not count `dependency` on a step that is not blocked', async () => {
    const { deps } = makeDeps();
    const result = await runDaRegistrySetupSteps(
      [scriptedStep('one', [{ ...assessment('waiting'), dependency: true }]).step],
      'plan',
      deps
    );
    expect(nth(result.steps, 0).dependency).toBe(false);
  });

  it('reports a step whose assess throws as blocked with the error, and keeps going', async () => {
    const failing: DaRegistrySetupStep = {
      id: 'broken',
      title: 'broken title',
      why: 'why',
      assess: async () => {
        throw new Error('ledger unreachable');
      },
    };
    const after = scriptedStep('after', [assessment('done')]);
    const { deps } = makeDeps();

    const result = await runDaRegistrySetupSteps([failing, after.step], 'plan', deps);

    expect(result.steps[0]).toEqual(
      expect.objectContaining({
        status: 'blocked',
        summary: 'the step failed to read its state',
        dependency: false,
        notes: ['ledger unreachable'],
      })
    );
    expect(after.assess).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('blocked');
    expect(result.needsAttention).toBe(true);
  });
});

describe('runDaRegistrySetupSteps in apply mode', () => {
  it('submits a pending step, records what it applied, re-assesses, and moves on', async () => {
    const first = scriptedStep('first', [
      assessment('pending', [
        { description: 'create the thing', submission: submissionFor('a') },
        { description: 'create the other thing', submission: submissionFor('b') },
      ]),
      assessment('done'),
    ]);
    const second = scriptedStep('second', [assessment('done')]);
    const { deps } = makeDeps();

    const result = await runDaRegistrySetupSteps([first.step, second.step], 'apply', deps);

    expect(deps.submit).toHaveBeenCalledTimes(2);
    expect(deps.submit).toHaveBeenNthCalledWith(1, submissionFor('a'));
    expect(deps.submit).toHaveBeenNthCalledWith(2, submissionFor('b'));
    expect(first.assess).toHaveBeenCalledTimes(2);
    expect(result.outcome).toBe('done');
    expect(nth(result.steps, 0).applied).toEqual([
      'create the thing (update u1)',
      'create the other thing (update u2)',
    ]);
    expect(nth(result.steps, 1).status).toBe('done');
  });

  it('stops at the first blocked step without assessing later ones', async () => {
    const one = scriptedStep('one', [assessment('done')]);
    const two = scriptedStep('two', [assessment('blocked')]);
    const three = scriptedStep('three', [
      assessment('pending', [{ description: 'x', submission: submissionFor('x') }]),
    ]);
    const { deps } = makeDeps();

    const result = await runDaRegistrySetupSteps([one.step, two.step, three.step], 'apply', deps);

    expect(result.outcome).toBe('blocked');
    expect(result.steps.map((s) => s.id)).toEqual(['one', 'two']);
    expect(three.assess).not.toHaveBeenCalled();
    expect(deps.submit).not.toHaveBeenCalled();
  });

  it('stops when a pending step is still not done after its actions', async () => {
    const one = scriptedStep('one', [
      assessment('pending', [{ description: 'x', submission: submissionFor('x') }]),
      assessment('blocked'),
    ]);
    const two = scriptedStep('two', [assessment('done')]);
    const { deps } = makeDeps();

    const result = await runDaRegistrySetupSteps([one.step, two.step], 'apply', deps);

    expect(result.outcome).toBe('blocked');
    expect(nth(result.steps, 0).applied).toEqual(['x (update u1)']);
    expect(two.assess).not.toHaveBeenCalled();
  });

  it('polls a waiting step through the injected sleep and clock, and stops at the deadline', async () => {
    const waiting = scriptedStep('waiting', [assessment('waiting')], 30_000);
    const after = scriptedStep('after', [assessment('done')]);
    const { deps, elapsed, lines } = makeDeps();

    const result = await runDaRegistrySetupSteps([waiting.step, after.step], 'apply', deps);

    // Deadline = start + 30s; polls at +10s, +20s and +30s, then stops.
    expect(deps.sleep).toHaveBeenCalledTimes(3);
    expect(deps.sleep.mock.calls.every(([ms]) => ms === POLL_MS)).toBe(true);
    expect(elapsed()).toBe(30_000);
    expect(waiting.assess).toHaveBeenCalledTimes(4);
    expect(after.assess).not.toHaveBeenCalled();
    expect(result.outcome).toBe('waiting');
    expect(result.steps.map((s) => [s.id, s.status])).toEqual([['waiting', 'waiting']]);
    expect(lines.join('\n')).toContain('polling up to 1 min: waiting summary');
  });

  it('continues once a waiting step turns done during polling', async () => {
    const waiting = scriptedStep(
      'waiting',
      [assessment('waiting'), assessment('waiting'), assessment('done')],
      600_000
    );
    const after = scriptedStep('after', [assessment('done')]);
    const { deps } = makeDeps();

    const result = await runDaRegistrySetupSteps([waiting.step, after.step], 'apply', deps);

    expect(deps.sleep).toHaveBeenCalledTimes(2);
    expect(after.assess).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('done');
  });

  it('does not poll a waiting step without awaitMs', async () => {
    const waiting = scriptedStep('waiting', [assessment('waiting')]);
    const { deps } = makeDeps();

    const result = await runDaRegistrySetupSteps([waiting.step], 'apply', deps);

    expect(deps.sleep).not.toHaveBeenCalled();
    expect(waiting.assess).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('waiting');
  });

  it('acts again when a polled step turns pending, then resumes polling with a fresh deadline', async () => {
    const step = scriptedStep(
      'mixed',
      [
        assessment('waiting'),
        assessment('pending', [{ description: 'x', submission: submissionFor('x') }]),
        assessment('waiting'),
        assessment('done'),
      ],
      20_000
    );
    const { deps } = makeDeps();

    const result = await runDaRegistrySetupSteps([step.step], 'apply', deps);

    expect(deps.submit).toHaveBeenCalledTimes(1);
    expect(deps.sleep).toHaveBeenCalledTimes(2);
    expect(result.outcome).toBe('done');
  });

  it('blocks, after one submission, a step that plans the same actions again right after applying them', async () => {
    const stuck = scriptedStep('stuck', [
      assessment('pending', [{ description: 'replace the thing', submission: submissionFor('x') }]),
    ]);
    const after = scriptedStep('after', [assessment('done')]);
    const { deps } = makeDeps();

    const result = await runDaRegistrySetupSteps([stuck.step, after.step], 'apply', deps);

    expect(deps.submit).toHaveBeenCalledTimes(1);
    expect(after.assess).not.toHaveBeenCalled();
    expect(result.outcome).toBe('blocked');
    expect(result.needsAttention).toBe(true);
    expect(result.steps[0]).toEqual(
      expect.objectContaining({
        status: 'blocked',
        summary: 'the step does not read back its own write',
        notes: ['planned again after it was applied: replace the thing'],
        applied: ['replace the thing (update u1)'],
      })
    );
  });

  it('leaves a step pending with a note after DA_REGISTRY_SETUP_MAX_ROUNDS_PER_STEP rounds, and stops', async () => {
    expect(DA_REGISTRY_SETUP_MAX_ROUNDS_PER_STEP).toBe(25);
    // Each round makes progress (different actions), but the step never finishes.
    const stuck = scriptedStep(
      'stuck',
      Array.from({ length: 30 }, (_, i) =>
        assessment('pending', [{ description: `round ${i + 1}`, submission: submissionFor('x') }])
      )
    );
    const after = scriptedStep('after', [assessment('done')]);
    const { deps } = makeDeps();

    const result = await runDaRegistrySetupSteps([stuck.step, after.step], 'apply', deps);

    expect(deps.submit).toHaveBeenCalledTimes(25);
    expect(stuck.assess).toHaveBeenCalledTimes(26);
    expect(after.assess).not.toHaveBeenCalled();
    expect(result.outcome).toBe('pending');
    expect(result.needsAttention).toBe(false);
    expect(nth(result.steps, 0).notes).toEqual(['pending note', 'still pending after 25 rounds; run again']);
    expect(nth(result.steps, 0).applied).toHaveLength(25);
  });

  it('reports a rejected submission as blocked, keeps what was applied before it, and stops', async () => {
    const one = scriptedStep('one', [
      assessment('pending', [
        { description: 'first', submission: submissionFor('a') },
        { description: 'second', submission: submissionFor('b') },
        { description: 'third', submission: submissionFor('c') },
      ]),
    ]);
    const two = scriptedStep('two', [assessment('done')]);
    const { deps } = makeDeps();
    deps.submit.mockResolvedValueOnce({ updateId: 'u1' }).mockRejectedValueOnce(new Error('INVALID_ARGUMENT'));

    const result = await runDaRegistrySetupSteps([one.step, two.step], 'apply', deps);

    expect(deps.submit).toHaveBeenCalledTimes(2);
    expect(one.assess).toHaveBeenCalledTimes(1);
    expect(two.assess).not.toHaveBeenCalled();
    expect(result.outcome).toBe('blocked');
    expect(result.needsAttention).toBe(true);
    expect(result.steps[0]).toEqual(
      expect.objectContaining({
        status: 'blocked',
        summary: 'a submission failed',
        notes: ['second failed: INVALID_ARGUMENT'],
        applied: ['first (update u1)'],
      })
    );
  });

  it('does not poll a waiting step that says polling cannot help', async () => {
    const waiting = scriptedStep('waiting', [{ ...assessment('waiting'), poll: false }], 600_000);
    const { deps } = makeDeps();

    const result = await runDaRegistrySetupSteps([waiting.step], 'apply', deps);

    expect(deps.sleep).not.toHaveBeenCalled();
    expect(waiting.assess).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('waiting');
  });
});

describe('formatDaRegistrySetupSubmission', () => {
  it('shortens long createdEventBlobs and leaves everything else as JSON', () => {
    const longBlob = 'B'.repeat(100);
    const shortBlob = 'S'.repeat(48);
    const submission: LedgerSubmission = {
      ...submissionFor('a'),
      disclosedContracts: [
        { templateId: 'pkg:Mod:Long', contractId: 'c1', createdEventBlob: longBlob, synchronizerId: 'sync' },
        { templateId: 'pkg:Mod:Short', contractId: 'c2', createdEventBlob: shortBlob, synchronizerId: 'sync' },
      ],
    };

    const text = formatDaRegistrySetupSubmission(submission);
    const parsed = JSON.parse(text) as LedgerSubmission;

    expect(parsed.disclosedContracts?.[0]?.createdEventBlob).toBe(`${'B'.repeat(48)}…(100 chars)`);
    expect(parsed.disclosedContracts?.[1]?.createdEventBlob).toBe(shortBlob);
    expect(parsed.commands).toEqual(submission.commands);
    expect(text).not.toContain(longBlob);
    // Pretty-printed with two spaces.
    expect(text.split('\n')[1]).toBe('  "commandIdPrefix": "test-a",');
  });
});
