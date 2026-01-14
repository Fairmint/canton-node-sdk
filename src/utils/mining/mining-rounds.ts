import { type DisclosedContract } from '../../clients/ledger-json-api/schemas';
import {
  type GetOpenAndIssuingMiningRoundsResponse,
  type IssuingMiningRound,
  type OpenMiningRound,
} from '../../clients/validator-api/schemas/api';
import { OperationError, OperationErrorCode } from '../../core/errors';

/** Client interface required for mining round operations */
export interface MiningRoundClient {
  getOpenAndIssuingMiningRounds: () => Promise<GetOpenAndIssuingMiningRoundsResponse>;
}

/** Sleep utility function */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract round number from a mining round object */
function getRoundNumber(miningRound: OpenMiningRound): number {
  try {
    // Try to get round number from various possible locations
    return (
      miningRound.contract.payload.roundNumber ??
      miningRound.contract.payload.round_number ??
      (miningRound.contract.payload.round?.number ? parseInt(miningRound.contract.payload.round.number, 10) : 0)
    );
  } catch {
    return 0;
  }
}

/** Find the latest mining round from a list of open mining rounds */
function findLatestMiningRound(openMiningRounds: OpenMiningRound[]): OpenMiningRound | null {
  if (openMiningRounds.length === 0) return null;

  // Sort by round number descending and return the first (latest) one
  const sorted = openMiningRounds.sort((a, b) => {
    const roundA = getRoundNumber(a);
    const roundB = getRoundNumber(b);
    return roundB - roundA;
  });

  return sorted[0] ?? null;
}

/** Context information derived from open / issuing mining rounds. */
export interface MiningRoundContext {
  /** Contract ID of the open mining round to reference in commands */
  openMiningRound: string;
  /** Contract information (for disclosed contracts) of the open mining round */
  openMiningRoundContract: DisclosedContract;
  /** Issuing mining rounds formatted for command arguments */
  issuingMiningRounds: Array<{ round: number; contractId: string }>;
}

/**
 * Finds the latest mining round that is currently open (`opensAt` is in the past) and returns useful context
 * information.
 *
 * @throws Error if no mining round satisfies the criteria
 */
export async function getCurrentMiningRoundContext(validatorClient: MiningRoundClient): Promise<MiningRoundContext> {
  const miningRoundsResponse: GetOpenAndIssuingMiningRoundsResponse =
    await validatorClient.getOpenAndIssuingMiningRounds();

  // Filter for rounds that have opened already (opensAt <= now)
  const now = new Date();
  const validOpenRounds = miningRoundsResponse.open_mining_rounds.filter((round) => {
    try {
      const opensAtRaw = round.contract.payload.opensAt;
      if (!opensAtRaw) return false;
      const opensAt = new Date(opensAtRaw);
      return opensAt <= now;
    } catch {
      return false;
    }
  });

  if (validOpenRounds.length === 0) {
    throw new OperationError(
      'No open mining rounds found with opensAt <= now',
      OperationErrorCode.MINING_ROUND_NOT_FOUND,
      { totalRounds: miningRoundsResponse.open_mining_rounds.length, filterTime: now.toISOString() }
    );
  }

  // Use the *last* round that has opened (the most recent open one)
  const lastOpenRound = validOpenRounds[validOpenRounds.length - 1];

  if (!lastOpenRound) {
    throw new OperationError('No valid open mining round found', OperationErrorCode.MINING_ROUND_NOT_FOUND, {
      validRoundsCount: validOpenRounds.length,
    });
  }

  const openMiningRoundContract: DisclosedContract = {
    contractId: lastOpenRound.contract.contract_id,
    templateId: lastOpenRound.contract.template_id,
    createdEventBlob: lastOpenRound.contract.created_event_blob,
    synchronizerId: lastOpenRound.domain_id, // Using domainId as synchronizerId (legacy behaviour)
  };

  const issuingMiningRounds = miningRoundsResponse.issuing_mining_rounds.map((round: IssuingMiningRound) => ({
    round: round.round_number,
    contractId: round.contract_id ?? round.contract?.contract_id ?? '',
  }));

  return {
    openMiningRound: openMiningRoundContract.contractId,
    openMiningRoundContract,
    issuingMiningRounds,
  };
}

/**
 * Gets the domain ID from the current mining round context. This is useful for operations that need to automatically
 * determine the domain ID.
 *
 * @param validatorClient - Client with mining round access for getting mining round information
 * @returns Promise resolving to the domain ID string
 * @throws Error if no mining round satisfies the criteria
 */
export async function getCurrentMiningRoundDomainId(validatorClient: MiningRoundClient): Promise<string> {
  const miningRoundContext = await getCurrentMiningRoundContext(validatorClient);
  return miningRoundContext.openMiningRoundContract.synchronizerId;
}

/**
 * Gets the current mining round number by fetching the latest open mining round
 *
 * @param validatorClient Client with mining round access to fetch round information
 * @returns Promise resolving to the current round number
 * @throws Error if no open mining rounds are found
 */
export async function getCurrentRoundNumber(validatorClient: MiningRoundClient): Promise<number> {
  const miningRoundsResponse = await validatorClient.getOpenAndIssuingMiningRounds();
  const currentOpenMiningRounds = miningRoundsResponse.open_mining_rounds;

  if (currentOpenMiningRounds.length === 0) {
    throw new OperationError('No open mining rounds found', OperationErrorCode.MINING_ROUND_NOT_FOUND);
  }

  const latestRound = findLatestMiningRound(currentOpenMiningRounds);
  if (!latestRound) {
    throw new OperationError('No valid mining rounds found', OperationErrorCode.MINING_ROUND_NOT_FOUND, {
      roundsCount: currentOpenMiningRounds.length,
    });
  }

  return getRoundNumber(latestRound);
}

/**
 * Wait until the mining round has actually changed, confirming the change
 *
 * @param validatorClient Client with mining round access to fetch round information
 * @param maxWaitTime Maximum time to wait in milliseconds (default: 20 minutes)
 * @returns Promise that resolves when the round has changed
 */
export async function waitForRoundChange(
  validatorClient: MiningRoundClient,
  maxWaitTime: number = 20 * 60 * 1000 // 20 minutes default
): Promise<void> {
  const startTime = Date.now();
  const checkInterval = 20000; // Check every 20 seconds

  const initialRoundNumber = await getCurrentRoundNumber(validatorClient);

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const miningRoundsResponse = await validatorClient.getOpenAndIssuingMiningRounds();
      const currentOpenMiningRounds = miningRoundsResponse.open_mining_rounds;

      if (currentOpenMiningRounds.length === 0) {
        await sleep(checkInterval);
        continue;
      }

      const latestRound = findLatestMiningRound(currentOpenMiningRounds);
      if (!latestRound) {
        await sleep(checkInterval);
        continue;
      }

      const currentRoundNumber = getRoundNumber(latestRound);
      process.stdout.write('.');

      if (currentRoundNumber > initialRoundNumber) {
        return;
      }

      // Round hasn't changed yet, wait and check again
      await sleep(checkInterval);
    } catch {
      await sleep(checkInterval);
    }
  }

  throw new OperationError(
    `Timeout waiting for mining round to change from ${initialRoundNumber} after ${maxWaitTime / 1000} seconds`,
    OperationErrorCode.MINING_ROUND_NOT_FOUND,
    { initialRoundNumber, maxWaitTimeMs: maxWaitTime }
  );
}
