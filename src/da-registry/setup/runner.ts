/**
 * Runs the DA Registry setup steps in order.
 *
 * - `plan` assesses every step and prints its status, evidence and the exact commands `apply` would submit. It never
 *   writes.
 * - `apply` assesses each step; while it is pending, submits its actions and re-assesses, and while it is waiting on
 *   another party, polls for as long as the step allows. It stops at the first step that is not done afterwards.
 *
 * A step that builds on an earlier one reports `blocked` (a dependency) until that one is done; steps that stand alone,
 * such as the allowlist, can be pending while earlier ones are. A step that throws, or whose submission the ledger
 * rejects, is reported as `blocked` with the error, so every run ends with a summary.
 */
import { type LedgerCommand, type LedgerSubmission } from '../../utils/ledger';
import {
  DaRegistrySetupDependencyError,
  type DaRegistrySetupAction,
  type DaRegistrySetupStep,
  type DaRegistrySetupStepAssessment,
  type DaRegistrySetupStepStatus,
} from './types';

/** `plan` reads and prints every step; `apply` also submits the pending ones. */
export type DaRegistrySetupRunMode = 'plan' | 'apply';

/** What one step ended as, and what `apply` submitted for it. */
export interface DaRegistrySetupStepResult {
  id: string;
  title: string;
  status: DaRegistrySetupStepStatus;
  summary: string;
  dependency: boolean;
  evidence: Record<string, string>;
  notes: string[];
  /** Descriptions of the actions `apply` submitted, with their update ids. */
  applied: string[];
}

/** One run: each step's result, the overall outcome, and whether a person must act. */
export interface DaRegistrySetupRunResult {
  mode: DaRegistrySetupRunMode;
  steps: DaRegistrySetupStepResult[];
  /** `done` when every step is done; otherwise the status of the first step that is not. */
  outcome: DaRegistrySetupStepStatus;
  /** Some step is blocked on something a person must fix, not merely on an earlier step. */
  needsAttention: boolean;
}

/** Side effects the runner needs, injected so a run is testable with a fake clock and ledger. */
export interface DaRegistrySetupRunnerDeps {
  submit: (submission: LedgerSubmission) => Promise<{ updateId: string }>;
  log: (line: string) => void;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

const STATUS_ICON: Record<DaRegistrySetupStepStatus, string> = {
  done: '✅ done',
  pending: '⏳ pending',
  waiting: '🕒 waiting',
  blocked: '⛔ blocked',
};

const WAIT_POLL_MS = 10_000;
/** Guards against a step whose actions never change what it reads; the step is left pending for the next run. */
export const DA_REGISTRY_SETUP_MAX_ROUNDS_PER_STEP = 25;
const MAX_BLOB_CHARS = 48;

/** JSON for the plan output, with disclosed-contract blobs shortened so the plan stays readable. */
export function formatDaRegistrySetupSubmission(submission: LedgerSubmission): string {
  return JSON.stringify(
    submission,
    (key, value: unknown) =>
      key === 'createdEventBlob' && typeof value === 'string' && value.length > MAX_BLOB_CHARS
        ? `${value.slice(0, MAX_BLOB_CHARS)}…(${value.length} chars)`
        : value,
    2
  );
}

function indent(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

/** What a command acts on: the contract and choice it exercises, or the template it creates. */
function commandTarget(command: LedgerCommand): string[] {
  if ('ExerciseCommand' in command) {
    return ['exercise', command.ExerciseCommand.contractId, command.ExerciseCommand.choice];
  }
  if ('CreateAndExerciseCommand' in command) {
    return [
      'create-and-exercise',
      command.CreateAndExerciseCommand.templateId,
      command.CreateAndExerciseCommand.choice,
    ];
  }
  return ['create', command.CreateCommand.templateId];
}

/** A round's identity: each action's description and the contracts and templates its commands act on. */
function roundFingerprint(actions: readonly DaRegistrySetupAction[]): string {
  return JSON.stringify(actions.map((a) => [a.description, a.submission.commands.map(commandTarget)]));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function printAssessment(
  log: (line: string) => void,
  assessment: DaRegistrySetupStepAssessment,
  showActions: boolean
): void {
  log(`      ${STATUS_ICON[assessment.status]}  ${assessment.summary}`);
  for (const [key, value] of Object.entries(assessment.evidence ?? {})) {
    log(`      · ${key}: ${value}`);
  }
  for (const note of assessment.notes ?? []) {
    log(`      ! ${note}`);
  }
  if (!showActions) return;
  for (const action of assessment.actions ?? []) {
    log(`      → ${action.description}`);
    log(indent(formatDaRegistrySetupSubmission(action.submission), '        '));
  }
}

async function safeAssess(step: DaRegistrySetupStep): Promise<DaRegistrySetupStepAssessment> {
  try {
    return await step.assess();
  } catch (error) {
    if (error instanceof DaRegistrySetupDependencyError) {
      return { status: 'blocked', summary: `needs ${error.stepId}`, dependency: true, notes: [error.message] };
    }
    return { status: 'blocked', summary: 'the step failed to read its state', notes: [errorMessage(error)] };
  }
}

/** Submits a pending step's actions; returns an error message instead of throwing, so the run still summarises. */
async function applyActions(
  assessment: DaRegistrySetupStepAssessment,
  deps: DaRegistrySetupRunnerDeps,
  applied: string[]
): Promise<string | null> {
  for (const action of assessment.actions ?? []) {
    deps.log(`      ▶ ${action.description}`);
    try {
      const { updateId } = await deps.submit(action.submission);
      applied.push(`${action.description} (update ${updateId})`);
      deps.log(`        submitted, update ${updateId}`);
    } catch (error) {
      return `${action.description} failed: ${errorMessage(error)}`;
    }
  }
  return null;
}

/** Runs `steps` in order in `mode`; see the module documentation for how `plan` and `apply` differ. */
export async function runDaRegistrySetupSteps(
  steps: DaRegistrySetupStep[],
  mode: DaRegistrySetupRunMode,
  deps: DaRegistrySetupRunnerDeps
): Promise<DaRegistrySetupRunResult> {
  const results: DaRegistrySetupStepResult[] = [];
  let outcome: DaRegistrySetupStepStatus = 'done';

  for (const [index, step] of steps.entries()) {
    deps.log('');
    deps.log(`[${index + 1}/${steps.length}] ${step.id} — ${step.title}`);
    deps.log(indent(step.why, '      '));

    let assessment = await safeAssess(step);
    const applied: string[] = [];

    if (mode === 'apply') {
      // Some steps take several rounds: a mint is an offer then an accept, and each delivery spends the change of
      // the one before. Each round re-reads the ledger, so a round only ever acts on current state.
      let rounds = 0;
      let waitDeadline: number | undefined;
      // A round that plans exactly what the round before it just submitted means the step does not read back its own
      // write (for example a reader that does not match the ledger's encoding); repeating it would only churn. Rounds
      // are compared by what they act on, not by their timestamps, which every round regenerates.
      let lastRound: string | undefined;
      for (;;) {
        if (assessment.status === 'pending' && rounds < DA_REGISTRY_SETUP_MAX_ROUNDS_PER_STEP) {
          const descriptions = (assessment.actions ?? []).map((a) => a.description);
          const round = roundFingerprint(assessment.actions ?? []);
          if (round === lastRound) {
            assessment = {
              status: 'blocked',
              summary: 'the step does not read back its own write',
              ...(assessment.evidence ? { evidence: assessment.evidence } : {}),
              notes: [`planned again after it was applied: ${descriptions.join('; ')}`],
            };
            break;
          }
          lastRound = round;
          rounds++;
          printAssessment(deps.log, assessment, true);
          const failure = await applyActions(assessment, deps, applied);
          if (failure) {
            assessment = { status: 'blocked', summary: 'a submission failed', notes: [failure] };
            break;
          }
          waitDeadline = undefined;
        } else if (assessment.status === 'waiting' && step.awaitMs && assessment.poll !== false) {
          if (waitDeadline === undefined) {
            waitDeadline = deps.now() + step.awaitMs;
            deps.log(`      🕒 polling up to ${Math.ceil(step.awaitMs / 60_000)} min: ${assessment.summary}`);
          }
          if (deps.now() >= waitDeadline) break;
          lastRound = undefined;
          await deps.sleep(WAIT_POLL_MS);
        } else {
          break;
        }
        assessment = await safeAssess(step);
      }
      if (assessment.status === 'pending' && rounds === DA_REGISTRY_SETUP_MAX_ROUNDS_PER_STEP) {
        assessment = {
          ...assessment,
          notes: [
            ...(assessment.notes ?? []),
            `still pending after ${DA_REGISTRY_SETUP_MAX_ROUNDS_PER_STEP} rounds; run again`,
          ],
        };
      }
    }

    // Plan prints the commands for every pending step; apply prints them for whatever is left undone.
    printAssessment(deps.log, assessment, mode === 'plan' || assessment.status !== 'done');
    results.push({
      id: step.id,
      title: step.title,
      status: assessment.status,
      summary: assessment.summary,
      dependency: assessment.status === 'blocked' && assessment.dependency === true,
      evidence: assessment.evidence ?? {},
      notes: assessment.notes ?? [],
      applied,
    });

    if (assessment.status !== 'done' && outcome === 'done') {
      outcome = assessment.status;
      // apply stops here: later steps build on this one. plan keeps going to show the whole picture.
      if (mode === 'apply') break;
    }
  }

  return {
    mode,
    steps: results,
    outcome,
    needsAttention: results.some((r) => r.status === 'blocked' && !r.dependency),
  };
}
