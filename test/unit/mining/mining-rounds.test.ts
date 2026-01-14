import type { ValidatorApiClient } from '../../../src/clients/validator-api';
import type { GetOpenAndIssuingMiningRoundsResponse } from '../../../src/clients/validator-api/schemas/api';
import {
  getCurrentMiningRoundContext,
  getCurrentMiningRoundDomainId,
  getCurrentRoundNumber,
} from '../../../src/utils/mining/mining-rounds';

const createMockValidatorClient = (response: GetOpenAndIssuingMiningRoundsResponse): ValidatorApiClient =>
  ({
    getOpenAndIssuingMiningRounds: jest.fn().mockResolvedValue(response),
  }) as unknown as ValidatorApiClient;

const createOpenMiningRound = (roundNumber: number, opensAt: Date, contractId = `contract-${roundNumber}`) => ({
  contract: {
    contract_id: contractId,
    template_id: 'pkg:Splice.Round:OpenMiningRound',
    created_event_blob: 'blob-123',
    payload: {
      roundNumber,
      opensAt: opensAt.toISOString(),
    },
  },
  domain_id: 'domain-123',
});

const createIssuingMiningRound = (roundNumber: number, contractId = `issuing-${roundNumber}`) => ({
  round_number: roundNumber,
  contract_id: contractId,
  contract: {
    contract_id: contractId,
  },
});

describe('mining-rounds', () => {
  describe('getCurrentMiningRoundContext', () => {
    it('returns mining round context for valid open round', async () => {
      const now = new Date();
      const pastTime = new Date(now.getTime() - 60000); // 1 minute ago

      const mockClient = createMockValidatorClient({
        open_mining_rounds: [createOpenMiningRound(10, pastTime)],
        issuing_mining_rounds: [],
      });

      const result = await getCurrentMiningRoundContext(mockClient);

      expect(result.openMiningRound).toBe('contract-10');
      expect(result.openMiningRoundContract.contractId).toBe('contract-10');
      expect(result.openMiningRoundContract.templateId).toBe('pkg:Splice.Round:OpenMiningRound');
      expect(result.openMiningRoundContract.synchronizerId).toBe('domain-123');
    });

    it('returns the last round that has already opened', async () => {
      const now = new Date();
      const pastTime1 = new Date(now.getTime() - 120000); // 2 minutes ago
      const pastTime2 = new Date(now.getTime() - 60000); // 1 minute ago

      const mockClient = createMockValidatorClient({
        open_mining_rounds: [
          createOpenMiningRound(10, pastTime1, 'contract-10'),
          createOpenMiningRound(11, pastTime2, 'contract-11'),
        ],
        issuing_mining_rounds: [],
      });

      const result = await getCurrentMiningRoundContext(mockClient);

      // Should return the last (most recent) open round
      expect(result.openMiningRound).toBe('contract-11');
    });

    it('filters out rounds that have not opened yet', async () => {
      const now = new Date();
      const pastTime = new Date(now.getTime() - 60000); // 1 minute ago
      const futureTime = new Date(now.getTime() + 60000); // 1 minute in future

      const mockClient = createMockValidatorClient({
        open_mining_rounds: [
          createOpenMiningRound(10, pastTime, 'contract-10'),
          createOpenMiningRound(11, futureTime, 'contract-11'), // Not yet open
        ],
        issuing_mining_rounds: [],
      });

      const result = await getCurrentMiningRoundContext(mockClient);

      // Should only return the round that has opened
      expect(result.openMiningRound).toBe('contract-10');
    });

    it('includes issuing mining rounds in context', async () => {
      const now = new Date();
      const pastTime = new Date(now.getTime() - 60000);

      const mockClient = createMockValidatorClient({
        open_mining_rounds: [createOpenMiningRound(10, pastTime)],
        issuing_mining_rounds: [createIssuingMiningRound(8, 'issuing-8'), createIssuingMiningRound(9, 'issuing-9')],
      });

      const result = await getCurrentMiningRoundContext(mockClient);

      expect(result.issuingMiningRounds).toHaveLength(2);
      expect(result.issuingMiningRounds[0]).toEqual({ round: 8, contractId: 'issuing-8' });
      expect(result.issuingMiningRounds[1]).toEqual({ round: 9, contractId: 'issuing-9' });
    });

    it('throws when no open rounds found', async () => {
      const mockClient = createMockValidatorClient({
        open_mining_rounds: [],
        issuing_mining_rounds: [],
      });

      await expect(getCurrentMiningRoundContext(mockClient)).rejects.toThrow(
        'No open mining rounds found with opensAt <= now'
      );
    });

    it('throws when all rounds are in the future', async () => {
      const futureTime = new Date(Date.now() + 60000);

      const mockClient = createMockValidatorClient({
        open_mining_rounds: [createOpenMiningRound(10, futureTime)],
        issuing_mining_rounds: [],
      });

      await expect(getCurrentMiningRoundContext(mockClient)).rejects.toThrow(
        'No open mining rounds found with opensAt <= now'
      );
    });

    it('handles rounds without opensAt field', async () => {
      const mockClient = createMockValidatorClient({
        open_mining_rounds: [
          {
            contract: {
              contract_id: 'contract-10',
              template_id: 'pkg:Splice.Round:OpenMiningRound',
              created_event_blob: 'blob-123',
              payload: {
                roundNumber: 10,
                // opensAt is missing
              },
            },
            domain_id: 'domain-123',
          },
        ],
        issuing_mining_rounds: [],
      });

      await expect(getCurrentMiningRoundContext(mockClient)).rejects.toThrow(
        'No open mining rounds found with opensAt <= now'
      );
    });
  });

  describe('getCurrentMiningRoundDomainId', () => {
    it('returns domain ID from mining round context', async () => {
      const now = new Date();
      const pastTime = new Date(now.getTime() - 60000);

      const mockClient = createMockValidatorClient({
        open_mining_rounds: [createOpenMiningRound(10, pastTime)],
        issuing_mining_rounds: [],
      });

      const domainId = await getCurrentMiningRoundDomainId(mockClient);

      expect(domainId).toBe('domain-123');
    });

    it('throws when no open rounds found', async () => {
      const mockClient = createMockValidatorClient({
        open_mining_rounds: [],
        issuing_mining_rounds: [],
      });

      await expect(getCurrentMiningRoundDomainId(mockClient)).rejects.toThrow();
    });
  });

  describe('getCurrentRoundNumber', () => {
    it('returns round number from latest open round', async () => {
      const now = new Date();
      const pastTime = new Date(now.getTime() - 60000);

      const mockClient = createMockValidatorClient({
        open_mining_rounds: [createOpenMiningRound(10, pastTime), createOpenMiningRound(11, pastTime)],
        issuing_mining_rounds: [],
      });

      const roundNumber = await getCurrentRoundNumber(mockClient);

      // Should return the highest round number
      expect(roundNumber).toBe(11);
    });

    it('throws when no open rounds found', async () => {
      const mockClient = createMockValidatorClient({
        open_mining_rounds: [],
        issuing_mining_rounds: [],
      });

      await expect(getCurrentRoundNumber(mockClient)).rejects.toThrow('No open mining rounds found');
    });

    it('handles various round number formats', async () => {
      const now = new Date();
      const pastTime = new Date(now.getTime() - 60000);

      // Test with round.number format
      const mockClient = createMockValidatorClient({
        open_mining_rounds: [
          {
            contract: {
              contract_id: 'contract-10',
              template_id: 'pkg:Splice.Round:OpenMiningRound',
              created_event_blob: 'blob-123',
              payload: {
                round: { number: '15' },
                opensAt: pastTime.toISOString(),
              },
            },
            domain_id: 'domain-123',
          },
        ],
        issuing_mining_rounds: [],
      });

      const roundNumber = await getCurrentRoundNumber(mockClient);

      expect(roundNumber).toBe(15);
    });
  });

  // Note: waitForRoundChange is not tested here because it involves
  // actual waiting/polling behavior that's better suited for integration tests
});
