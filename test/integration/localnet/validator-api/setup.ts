/** Shared setup for ValidatorApiClient integration tests. */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ApiError, CantonRuntime, ValidatorApiClient } from '../../../../src';
import { buildIntegrationTestClientConfig, retry } from '../../../utils/testConfig';

const DEFAULT_VALIDATOR_USER_NAME = 'app-provider-validator';
const VALIDATOR_ONBOARDING_TIMEOUT_MS = 150_000;
export const VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS = VALIDATOR_ONBOARDING_TIMEOUT_MS + 120_000;
const VALIDATOR_ONBOARDING_LOCK_DIR = join(tmpdir(), 'canton-node-sdk-validator-onboarding.lock');
const VALIDATOR_ONBOARDING_LOCK_OWNER_FILE = join(VALIDATOR_ONBOARDING_LOCK_DIR, 'owner');

let client: ValidatorApiClient | null = null;
let onboardingPromise: Promise<void> | null = null;

/**
 * Get the shared ValidatorApiClient instance for tests. Creates the client on first call, reuses it for subsequent
 * calls.
 */
export function getClient(): ValidatorApiClient {
  if (!client) {
    const config = buildIntegrationTestClientConfig();
    client = new ValidatorApiClient(new CantonRuntime(config));
  }
  return client;
}

/** Ensure the cn-quickstart OAuth client has an onboarded wallet user before wallet-scoped endpoint tests run. */
export async function ensureValidatorUserOnboarded(): Promise<void> {
  onboardingPromise ??= onboardValidatorUser();
  return onboardingPromise;
}

async function onboardValidatorUser(): Promise<void> {
  const validatorClient = getClient();

  await retry(
    async (): Promise<boolean> => {
      if (await isValidatorWalletReady(validatorClient)) {
        return true;
      }

      if (!(await tryAcquireOnboardingLock())) {
        throw new Error(`Validator user ${DEFAULT_VALIDATOR_USER_NAME} onboarding is in progress`);
      }

      try {
        if (await isValidatorWalletReady(validatorClient)) {
          return true;
        }

        await registerValidatorUser(validatorClient);

        await assertValidatorWalletReady(validatorClient);
        return true;
      } finally {
        await releaseOnboardingLock();
      }
    },
    {
      timeoutMs: VALIDATOR_ONBOARDING_TIMEOUT_MS,
      pollIntervalMs: 2_000,
      description: `validator wallet user ${DEFAULT_VALIDATOR_USER_NAME} onboarding`,
    }
  );
}

async function isValidatorWalletReady(validatorClient: ValidatorApiClient): Promise<boolean> {
  try {
    return await checkValidatorWalletReady(validatorClient);
  } catch (error) {
    if (isApiErrorStatus(error, 404)) {
      return false;
    }
    throw error;
  }
}

async function assertValidatorWalletReady(validatorClient: ValidatorApiClient): Promise<void> {
  if (!(await checkValidatorWalletReady(validatorClient))) {
    const status = await validatorClient.getUserStatus();
    throw new Error(`Validator user ${DEFAULT_VALIDATOR_USER_NAME} is not fully onboarded: ${JSON.stringify(status)}`);
  }
}

async function checkValidatorWalletReady(validatorClient: ValidatorApiClient): Promise<boolean> {
  const status = await validatorClient.getUserStatus();
  if (!status.user_onboarded || !status.user_wallet_installed || !status.party_id) {
    return false;
  }
  await validatorClient.getWalletBalance();
  return true;
}

function isAlreadyOnboardedError(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return false;
  }

  if (error.status === 409) {
    return true;
  }

  return error.status === 400 && /\b(already|exists|duplicate)\b/i.test(error.message);
}

function isApiErrorStatus(error: unknown, status: number): boolean {
  return error instanceof ApiError && error.status === status;
}

async function tryAcquireOnboardingLock(): Promise<boolean> {
  try {
    await mkdir(VALIDATOR_ONBOARDING_LOCK_DIR);
  } catch (error) {
    if (hasErrorCode(error, 'EEXIST')) {
      if (await releaseStaleOnboardingLock()) {
        return tryAcquireOnboardingLock();
      }
      return false;
    }
    throw error;
  }

  try {
    await writeFile(VALIDATOR_ONBOARDING_LOCK_OWNER_FILE, `${process.pid}\n`);
    return true;
  } catch (error) {
    await releaseOnboardingLock();
    throw error;
  }
}

async function releaseOnboardingLock(): Promise<void> {
  await rm(VALIDATOR_ONBOARDING_LOCK_DIR, { recursive: true, force: true });
}

async function releaseStaleOnboardingLock(): Promise<boolean> {
  try {
    const ownerPid = Number((await readFile(VALIDATOR_ONBOARDING_LOCK_OWNER_FILE, 'utf8')).trim());
    if (Number.isInteger(ownerPid) && ownerPid > 0 && isProcessAlive(ownerPid)) {
      return false;
    }
  } catch (error) {
    if (!hasErrorCode(error, 'ENOENT')) {
      throw error;
    }
  }

  await releaseOnboardingLock();
  return true;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as { code?: unknown }).code === code;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (hasErrorCode(error, 'ESRCH')) {
      return false;
    }
    if (hasErrorCode(error, 'EPERM')) {
      return true;
    }
    throw error;
  }
}

async function registerValidatorUser(validatorClient: ValidatorApiClient): Promise<void> {
  try {
    await validatorClient.registerNewUser();
  } catch (error) {
    if (!isAlreadyOnboardedError(error)) {
      throw error;
    }
  }
}
