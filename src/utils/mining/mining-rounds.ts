import { GetOpenAndIssuingMiningRoundsResponse } from '../../clients/validator-api/schemas/api';
import { ValidatorApiClient } from '../../clients/validator-api';
import { DisclosedContract } from '../../clients/ledger-json-api/schemas';

/**
 * Sleep utility function
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Find the latest mining round from a list of open mining rounds
 */
function findLatestMiningRound(openMiningRounds: any[]): any {
  if (openMiningRounds.length === 0) return null;
  
  // Sort by round number descending and return the first (latest) one
  return openMiningRounds.sort((a, b) => {
    const roundA = getRoundNumber(a);
    const roundB = getRoundNumber(b);
    return roundB - roundA;
  })[0];
}

/**
 * Extract round number from a mining round object
 */
function getRoundNumber(miningRound: any): number {
  try {
    // Try to get round number from various possible locations
    return (
      miningRound.round_number ||
      miningRound.roundNumber ||
      (miningRound.contract?.payload?.roundNumber as number) ||
      (miningRound.contract?.payload?.round_number as number) ||
      0
    );
  } catch {
    return 0;
  }
}

/**
 * Context information derived from open / issuing mining rounds.
 */
export interface MiningRoundContext {
  /** Contract ID of the open mining round to reference in commands */
  openMiningRound: string;
  /** Contract information (for disclosed contracts) of the open mining round */
  openMiningRoundContract: DisclosedContract;
  /** Issuing mining rounds formatted for command arguments */
  issuingMiningRounds: Array<{ round: number; contractId: string }>;
}

/**
 * Finds the latest mining round that is currently open (\`opensAt\` is in the past)
 * and returns useful context information.
 *
 * @throws Error if no mining round satisfies the criteria
 */
export async function getCurrentMiningRoundContext(
  validatorClient: ValidatorApiClient
): Promise<MiningRoundContext> {
  const miningRoundsResponse: GetOpenAndIssuingMiningRoundsResponse =
    await validatorClient.getOpenAndIssuingMiningRounds();

  // Filter for rounds that have opened already (opensAt <= now)
  const now = new Date();
  const validOpenRounds = miningRoundsResponse.open_mining_rounds.filter(round => {
    try {
      const opensAtRaw = (round as any)?.contract?.payload?.opensAt as string | undefined;
      if (!opensAtRaw) return false;
      const opensAt = new Date(opensAtRaw);
      return opensAt <= now;
    } catch {
      return false;
    }
  });

  if (validOpenRounds.length === 0) {
    throw new Error('No open mining rounds found with opensAt <= now');
  }

  // Use the *last* round that has opened (the most recent open one)
  const lastOpenRound = validOpenRounds[validOpenRounds.length - 1] as any;

  const openMiningRoundContract: DisclosedContract = {
    contractId: lastOpenRound.contract.contract_id,
    templateId: lastOpenRound.contract.template_id,
    createdEventBlob: lastOpenRound.contract.created_event_blob,
    synchronizerId: lastOpenRound.domain_id, // Using domainId as synchronizerId (legacy behaviour)
  };

  const issuingMiningRounds = (miningRoundsResponse.issuing_mining_rounds || []).map(
    (round: any) => ({
      round: round.round_number as number,
      contractId: (round.contract_id ?? round.contract?.contract_id) as string,
    })
  );

  return {
    openMiningRound: openMiningRoundContract.contractId,
    openMiningRoundContract,
    issuingMiningRounds,
  };
}

/**
 * Gets the domain ID from the current mining round context.
 * This is useful for operations that need to automatically determine the domain ID.
 *
 * @param validatorClient - Validator API client for getting mining round information
 * @returns Promise resolving to the domain ID string
 * @throws Error if no mining round satisfies the criteria
 */
export async function getCurrentMiningRoundDomainId(
  validatorClient: ValidatorApiClient
): Promise<string> {
  const miningRoundContext = await getCurrentMiningRoundContext(validatorClient);
  return miningRoundContext.openMiningRoundContract.synchronizerId;
} 

/**
 * Wait until the mining round has actually changed, confirming the change
 * @param validatorClient Validator API client to fetch round information
 * @param initialRoundNumber The round number when we started waiting
 * @param maxWaitTime Maximum time to wait in milliseconds (default: 10 minutes)
 * @returns Promise that resolves when the round has changed
 */
export async function waitForRoundChange(
  validatorClient: ValidatorApiClient,
  initialRoundNumber: number,
  maxWaitTime: number = 15 * 60 * 1000 // 15 minutes default
): Promise<void> {
  const startTime = Date.now();
  const checkInterval = 20000; // Check every 20 seconds

  console.log(
    `🔄 Waiting for mining round to change from ${initialRoundNumber}...`
  );

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const miningRoundsResponse =
        await validatorClient.getOpenAndIssuingMiningRounds();
      const currentOpenMiningRounds = miningRoundsResponse.open_mining_rounds;

      if (currentOpenMiningRounds.length === 0) {
        console.log('⚠️ No open mining rounds found, waiting...');
        await sleep(checkInterval);
        continue;
      }

      const latestRound = findLatestMiningRound(currentOpenMiningRounds);
      if (!latestRound) {
        console.log('⚠️ No valid mining rounds found, waiting...');
        await sleep(checkInterval);
        continue;
      }

      const currentRoundNumber = getRoundNumber(latestRound);
      process.stdout.write('.');

      if (currentRoundNumber > initialRoundNumber) {
        console.log(
          `✅ Mining round has changed from ${initialRoundNumber} to ${currentRoundNumber}`
        );
        return;
      }

      // Round hasn't changed yet, wait and check again
      await sleep(checkInterval);
    } catch (error) {
      console.error('⚠️ Error checking mining rounds:', error);
      await sleep(checkInterval);
    }
  }

  throw new Error(
    `Timeout waiting for mining round to change from ${initialRoundNumber} after ${maxWaitTime / 1000} seconds`
  );
} 