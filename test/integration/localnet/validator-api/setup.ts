/** Shared setup for ValidatorApiClient integration tests. */

import { ApiError, CantonRuntime, ValidatorApiClient } from '../../../../src';
import { buildIntegrationTestClientConfig, retry } from '../../../utils/testConfig';

const DEFAULT_VALIDATOR_USER_NAME = 'app-provider-validator';

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

  if (await isValidatorWalletReady(validatorClient)) {
    return;
  }

  try {
    await validatorClient.createUser({ name: DEFAULT_VALIDATOR_USER_NAME });
  } catch (error) {
    if (!isAlreadyOnboardedError(error)) {
      throw error;
    }
  }

  await retry(
    async (): Promise<boolean> => {
      await assertValidatorWalletReady(validatorClient);
      return true;
    },
    {
      timeoutMs: 60_000,
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
