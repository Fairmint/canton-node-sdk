import { GetOpenAndIssuingMiningRoundsResponse } from '../../clients/validator-api/schemas/api';
import { ContractInfo } from './disclosed-contracts';
import { ValidatorApiClient } from '../../clients/validator-api';

/**
 * Context information derived from open / issuing mining rounds.
 */
export interface MiningRoundContext {
  /** Contract ID of the open mining round to reference in commands */
  openMiningRound: string;
  /** Contract information (for disclosed contracts) of the open mining round */
  openMiningRoundContract: ContractInfo;
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

  const openMiningRoundContract: ContractInfo = {
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