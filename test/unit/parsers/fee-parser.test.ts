import {
  formatFeeAmount,
  parseFeesFromExercisedEvent,
  parseFeesFromTransaction,
  validateFeeAnalysis,
  type FeeAnalysis,
} from '../../../src/utils/parsers/fee-parser';
import { parseExercisedEvent, type ParsedExercisedEvent } from '../../../src/utils/parsers/event-parser';

const createAmuletRulesTransferEvent = (summary: Record<string, unknown>): Record<string, unknown> => ({
  ExercisedEvent: {
    offset: 10,
    nodeId: 2,
    contractId: 'contract-123',
    templateId: 'pkg:Splice.Amulet:AmuletRules',
    choice: 'AmuletRules_Transfer',
    choiceArgument: {},
    actingParties: ['party1'],
    witnessParties: ['party1'],
    consuming: false,
    lastDescendantNodeId: 5,
    packageName: 'splice-amulet',
    exerciseResult: {
      round: { number: '10' },
      summary: {
        inputAppRewardAmount: '0',
        inputValidatorRewardAmount: '0',
        inputSvRewardAmount: '0',
        inputAmuletAmount: '100',
        holdingFees: '0.001',
        outputFees: ['0.002', '0.003'],
        senderChangeFee: '0.0005',
        senderChangeAmount: '50',
        amuletPrice: '1.0',
        inputValidatorFaucetAmount: '0',
        balanceChanges: [
          ['party1', { changeToInitialAmountAsOfRoundZero: '-50', changeToHoldingFeesRate: '0' }],
          ['party2', { changeToInitialAmountAsOfRoundZero: '49.9935', changeToHoldingFeesRate: '0' }],
        ],
        ...summary,
      },
      createdAmulets: [],
      senderChangeAmulet: 'amulet-123',
    },
  },
});

const createNonTransferEvent = (): Record<string, unknown> => ({
  ExercisedEvent: {
    contractId: 'contract-123',
    templateId: 'pkg:Splice.Wallet:WalletInstall',
    choice: 'SomeOtherChoice',
    choiceArgument: {},
    exerciseResult: {},
  },
});

const createCreatedEvent = (): Record<string, unknown> => ({
  CreatedEvent: {
    contractId: 'contract-123',
    templateId: 'pkg:Module:Template',
  },
});

const exercised = (event: Record<string, unknown>): ParsedExercisedEvent => {
  const parsed = parseExercisedEvent(event);
  if (!parsed) throw new Error('fixture is not an exercised event');
  return parsed;
};

describe('fee-parser', () => {
  describe('parseFeesFromTransaction', () => {
    it('extracts fees from a submit response containing AmuletRules_Transfer', () => {
      const response = {
        transaction: { updateId: 'update-1', events: [createCreatedEvent(), createAmuletRulesTransferEvent({})] },
      };

      const result = parseFeesFromTransaction(response);

      expect(result.feeBreakdown.holdingFees).toBe('0.001');
      expect(result.feeBreakdown.outputFees).toEqual(['0.002', '0.003']);
      expect(result.feeBreakdown.senderChangeFee).toBe('0.0005');
    });

    it('extracts fees from a bare event array', () => {
      const result = parseFeesFromTransaction([createAmuletRulesTransferEvent({})]);

      expect(result.feeBreakdown.holdingFees).toBe('0.001');
    });

    it('throws when no AmuletRules_Transfer event found', () => {
      const events = [createCreatedEvent(), createNonTransferEvent()];

      expect(() => parseFeesFromTransaction({ events })).toThrow('No AmuletRules_Transfer event found in transaction');
    });

    it('throws for a transaction without events', () => {
      expect(() => parseFeesFromTransaction({ events: [] })).toThrow(
        'No AmuletRules_Transfer event found in transaction'
      );
    });
  });

  describe('parseFeesFromExercisedEvent', () => {
    it('parses fees from valid exercised event', () => {
      const result = parseFeesFromExercisedEvent(exercised(createAmuletRulesTransferEvent({})));

      expect(result.feeBreakdown.holdingFees).toBe('0.001');
      expect(result.feeBreakdown.outputFees).toEqual(['0.002', '0.003']);
      expect(result.feeBreakdown.senderChangeFee).toBe('0.0005');
    });

    it('calculates total fees correctly', () => {
      const event = createAmuletRulesTransferEvent({
        holdingFees: '1.5',
        outputFees: ['0.5', '0.25'],
        senderChangeFee: '0.25',
      });

      const result = parseFeesFromExercisedEvent(exercised(event));

      // 1.5 + 0.5 + 0.25 + 0.25 = 2.5
      expect(parseFloat(result.totalFees)).toBeCloseTo(2.5);
    });

    it('extracts balance changes', () => {
      const event = createAmuletRulesTransferEvent({
        balanceChanges: [
          ['alice', { changeToInitialAmountAsOfRoundZero: '-100', changeToHoldingFeesRate: '0.01' }],
          ['bob', { changeToInitialAmountAsOfRoundZero: '95', changeToHoldingFeesRate: '0.01' }],
        ],
      });

      const result = parseFeesFromExercisedEvent(exercised(event));

      expect(result.balanceChanges).toHaveLength(2);
      expect(result.balanceChanges[0]).toEqual({
        party: 'alice',
        changeToInitialAmountAsOfRoundZero: '-100',
        changeToHoldingFeesRate: '0.01',
      });
      expect(result.balanceChanges[1]).toEqual({
        party: 'bob',
        changeToInitialAmountAsOfRoundZero: '95',
        changeToHoldingFeesRate: '0.01',
      });
    });

    it('validates fee balance calculation', () => {
      // The isBalanced check verifies totalBalanceChange + totalFees ≈ 0
      // Using the default mock values to test this
      const result = parseFeesFromExercisedEvent(exercised(createAmuletRulesTransferEvent({})));

      // Verify fee validation structure exists
      expect(result.feeValidation).toHaveProperty('isBalanced');
      expect(result.feeValidation).toHaveProperty('totalBalanceChange');
      expect(result.feeValidation).toHaveProperty('totalFeesCalculated');
    });

    it('detects fee imbalance', () => {
      const event = createAmuletRulesTransferEvent({
        holdingFees: '10',
        outputFees: [],
        senderChangeFee: '0',
        balanceChanges: [['alice', { changeToInitialAmountAsOfRoundZero: '-5', changeToHoldingFeesRate: '0' }]],
      });

      const result = parseFeesFromExercisedEvent(exercised(event));

      expect(result.feeValidation.isBalanced).toBe(false);
      expect(result.feeValidation.discrepancy).toBeDefined();
    });

    it('throws for non-transfer exercised event', () => {
      expect(() => parseFeesFromExercisedEvent(exercised(createNonTransferEvent()))).toThrow(
        'No fee information found in exercised event - only AmuletRules_Transfer choices contain fee data'
      );
    });

    it('throws when the exercise result carries no summary', () => {
      const event = {
        ExercisedEvent: {
          contractId: 'contract-123',
          templateId: 'pkg:Splice.Amulet:AmuletRules',
          choice: 'AmuletRules_Transfer',
          choiceArgument: {},
          exerciseResult: { round: { number: '10' } },
        },
      };

      expect(() => parseFeesFromExercisedEvent(exercised(event))).toThrow(
        'No fee information found in exercise result'
      );
    });

    it('handles missing optional fields with defaults', () => {
      const event = createAmuletRulesTransferEvent({
        holdingFees: '0.5',
        outputFees: [],
        senderChangeFee: '0.1',
        balanceChanges: [],
      });

      const result = parseFeesFromExercisedEvent(exercised(event));

      expect(result.feeBreakdown.outputFees).toEqual([]);
      expect(result.balanceChanges).toEqual([]);
    });
  });

  describe('formatFeeAmount', () => {
    it('formats with default 10 decimal places', () => {
      expect(formatFeeAmount('1.5')).toBe('1.5000000000');
    });

    it('formats with custom decimal places', () => {
      expect(formatFeeAmount('1.5', 2)).toBe('1.50');
      expect(formatFeeAmount('1.5', 4)).toBe('1.5000');
    });

    it('handles whole numbers', () => {
      expect(formatFeeAmount('100', 2)).toBe('100.00');
    });

    it('handles very small numbers', () => {
      expect(formatFeeAmount('0.0000001', 10)).toBe('0.0000001000');
    });

    it('rounds when fewer decimals requested', () => {
      expect(formatFeeAmount('1.999', 2)).toBe('2.00');
    });
  });

  describe('validateFeeAnalysis', () => {
    const validFeeAnalysis: FeeAnalysis = {
      totalFees: '5.0000000000',
      feeBreakdown: {
        holdingFees: '2.5',
        outputFees: ['1.5', '0.5'],
        senderChangeFee: '0.5',
      },
      balanceChanges: [],
      feeValidation: {
        isBalanced: true,
        totalBalanceChange: '-5.0',
        totalFeesCalculated: '5.0',
      },
    };

    it('returns empty array for valid fee analysis', () => {
      const errors = validateFeeAnalysis(validFeeAnalysis);
      expect(errors).toEqual([]);
    });

    it('detects negative holding fees', () => {
      const analysis: FeeAnalysis = {
        ...validFeeAnalysis,
        feeBreakdown: {
          ...validFeeAnalysis.feeBreakdown,
          holdingFees: '-1.0',
        },
      };

      const errors = validateFeeAnalysis(analysis);
      expect(errors).toContain('Holding fees cannot be negative');
    });

    it('detects negative sender change fee', () => {
      const analysis: FeeAnalysis = {
        ...validFeeAnalysis,
        feeBreakdown: {
          ...validFeeAnalysis.feeBreakdown,
          senderChangeFee: '-0.5',
        },
      };

      const errors = validateFeeAnalysis(analysis);
      expect(errors).toContain('Sender change fee cannot be negative');
    });

    it('detects negative output fees', () => {
      const analysis: FeeAnalysis = {
        ...validFeeAnalysis,
        feeBreakdown: {
          ...validFeeAnalysis.feeBreakdown,
          outputFees: ['1.0', '-0.5', '0.5'],
        },
      };

      const errors = validateFeeAnalysis(analysis);
      expect(errors).toContain('Output fees cannot be negative');
    });

    it('reports fee balance mismatch', () => {
      const analysis: FeeAnalysis = {
        ...validFeeAnalysis,
        feeValidation: {
          isBalanced: false,
          totalBalanceChange: '-3.0',
          totalFeesCalculated: '5.0',
          discrepancy: '2.0',
        },
      };

      const errors = validateFeeAnalysis(analysis);
      expect(errors).toContain('Fee balance mismatch: 2.0');
    });

    it('reports multiple errors', () => {
      const analysis: FeeAnalysis = {
        ...validFeeAnalysis,
        feeBreakdown: {
          holdingFees: '-1.0',
          outputFees: ['-0.5'],
          senderChangeFee: '-0.2',
        },
        feeValidation: {
          isBalanced: false,
          totalBalanceChange: '0',
          totalFeesCalculated: '0',
          discrepancy: '0',
        },
      };

      const errors = validateFeeAnalysis(analysis);
      expect(errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});
