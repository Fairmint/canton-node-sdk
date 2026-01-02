import {
  parseFeesFromEventTree,
  parseFeesFromUpdate,
  formatFeeAmount,
  validateFeeAnalysis,
  type FeeAnalysis,
} from '../../../src/utils/parsers/fee-parser';
import type { TreeEvent } from '../../../src/clients/ledger-json-api/schemas/api/events';

// Helper to create mock events - use `as unknown as TreeEvent` to avoid strict type checking on test mocks
const createAmuletRulesTransferEvent = (summary: Record<string, unknown>): TreeEvent =>
  ({
    ExercisedTreeEvent: {
      value: {
        contractId: 'contract-123',
        templateId: 'pkg:Splice.Amulet:AmuletRules',
        choice: 'AmuletRules_Transfer',
        choiceArgument: {},
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
    },
  }) as unknown as TreeEvent;

const createNonTransferEvent = (): TreeEvent =>
  ({
    ExercisedTreeEvent: {
      value: {
        contractId: 'contract-123',
        templateId: 'pkg:Splice.Wallet:WalletInstall',
        choice: 'SomeOtherChoice',
        choiceArgument: {},
        exerciseResult: {},
      },
    },
  }) as unknown as TreeEvent;

const createCreatedEvent = (): TreeEvent =>
  ({
    CreatedTreeEvent: {
      value: {
        contractId: 'contract-123',
        templateId: 'pkg:Module:Template',
      },
    },
  }) as unknown as TreeEvent;

describe('fee-parser', () => {
  describe('parseFeesFromEventTree', () => {
    it('extracts fees from event tree with AmuletRules_Transfer', () => {
      const eventTree: Record<string, TreeEvent> = {
        '1': createCreatedEvent(),
        '2': createAmuletRulesTransferEvent({}),
      };

      const result = parseFeesFromEventTree(eventTree);

      expect(result.feeBreakdown.holdingFees).toBe('0.001');
      expect(result.feeBreakdown.outputFees).toEqual(['0.002', '0.003']);
      expect(result.feeBreakdown.senderChangeFee).toBe('0.0005');
    });

    it('throws when no AmuletRules_Transfer event found', () => {
      const eventTree: Record<string, TreeEvent> = {
        '1': createCreatedEvent(),
        '2': createNonTransferEvent(),
      };

      expect(() => parseFeesFromEventTree(eventTree)).toThrow('No AmuletRules_Transfer event found in event tree');
    });

    it('throws for empty event tree', () => {
      expect(() => parseFeesFromEventTree({})).toThrow('No AmuletRules_Transfer event found in event tree');
    });
  });

  describe('parseFeesFromUpdate', () => {
    it('parses fees from valid exercised event', () => {
      const event = createAmuletRulesTransferEvent({});

      const result = parseFeesFromUpdate(event);

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

      const result = parseFeesFromUpdate(event);

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

      const result = parseFeesFromUpdate(event);

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
      const event = createAmuletRulesTransferEvent({});

      const result = parseFeesFromUpdate(event);

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
        balanceChanges: [
          ['alice', { changeToInitialAmountAsOfRoundZero: '-5', changeToHoldingFeesRate: '0' }],
        ],
      });

      const result = parseFeesFromUpdate(event);

      expect(result.feeValidation.isBalanced).toBe(false);
      expect(result.feeValidation.discrepancy).toBeDefined();
    });

    it('throws for non-exercised event', () => {
      const event = createCreatedEvent();

      expect(() => parseFeesFromUpdate(event)).toThrow(
        'No fee information found in TreeEvent - only exercised events contain fee data'
      );
    });

    it('throws for non-transfer exercised event', () => {
      const event = createNonTransferEvent();

      expect(() => parseFeesFromUpdate(event)).toThrow(
        'No fee information found in TreeEvent - only AmuletRules_Transfer choices contain fee data'
      );
    });

    it('handles missing optional fields with defaults', () => {
      const event = {
        ExercisedTreeEvent: {
          value: {
            contractId: 'contract-123',
            templateId: 'pkg:Splice.Amulet:AmuletRules',
            choice: 'AmuletRules_Transfer',
            choiceArgument: {},
            exerciseResult: {
              round: { number: '10' },
              summary: {
                inputAppRewardAmount: '0',
                inputValidatorRewardAmount: '0',
                inputSvRewardAmount: '0',
                inputAmuletAmount: '100',
                holdingFees: '0.5',
                outputFees: [],
                senderChangeFee: '0.1',
                senderChangeAmount: '50',
                amuletPrice: '1.0',
                inputValidatorFaucetAmount: '0',
                balanceChanges: [],
              },
              createdAmulets: [],
              senderChangeAmulet: 'amulet-123',
            },
          },
        },
      } as unknown as TreeEvent;

      const result = parseFeesFromUpdate(event);

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
