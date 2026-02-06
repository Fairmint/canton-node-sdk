/** Types for fee-related data structures */

import { type TreeEvent } from '../../clients/ledger-json-api/schemas/api/events';
import { ValidationError } from '../../core/errors';

export interface BalanceChange {
  party: string;
  changeToInitialAmountAsOfRoundZero: string;
  changeToHoldingFeesRate: string;
}

export interface FeeSummary {
  holdingFees: string;
  outputFees: string[];
  senderChangeFee: string;
  senderChangeAmount: string;
  amuletPrice: string;
}

export interface FeeAnalysis {
  totalFees: string;
  feeBreakdown: {
    holdingFees: string;
    outputFees: string[];
    senderChangeFee: string;
  };
  balanceChanges: BalanceChange[];
  feeValidation: {
    isBalanced: boolean;
    totalBalanceChange: string;
    totalFeesCalculated: string;
    discrepancy?: string;
  };
}

// Type for the exercise result summary structure
interface ExerciseResultSummary {
  inputAppRewardAmount: string;
  inputValidatorRewardAmount: string;
  inputSvRewardAmount: string;
  inputAmuletAmount: string;
  balanceChanges: Array<
    [
      string,
      {
        changeToInitialAmountAsOfRoundZero: string;
        changeToHoldingFeesRate: string;
      },
    ]
  >;
  holdingFees: string;
  outputFees: string[];
  senderChangeFee: string;
  senderChangeAmount: string;
  amuletPrice: string;
  inputValidatorFaucetAmount: string;
}

// Type for the exercise result structure
interface ExerciseResult {
  round: {
    number: string;
  };
  summary: ExerciseResultSummary;
  createdAmulets: Array<{
    tag: string;
    value: string;
  }>;
  senderChangeAmulet: string;
}

// Type guard to check if an object is an ExerciseResult
function isExerciseResult(obj: unknown): obj is ExerciseResult {
  return (
    typeof obj === 'object' && obj !== null && 'summary' in obj && typeof (obj as ExerciseResult).summary === 'object'
  );
}

// Type guard to check if an object is an ExerciseResultSummary
function isExerciseResultSummary(obj: unknown): obj is ExerciseResultSummary {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'holdingFees' in obj &&
    'outputFees' in obj &&
    'senderChangeFee' in obj &&
    'balanceChanges' in obj
  );
}

function addStrings(a: string, b: string): string {
  // Handles decimal addition as strings to avoid float precision issues
  const [aIntRaw, aDec = ''] = a.split('.');
  const [bIntRaw, bDec = ''] = b.split('.');
  const aInt = aIntRaw ?? '0';
  const bInt = bIntRaw ?? '0';
  const decLen = Math.max(aDec.length, bDec.length);
  const aDecPadded = aDec.padEnd(decLen, '0');
  const bDecPadded = bDec.padEnd(decLen, '0');
  const decSum = (parseInt(aDecPadded, 10) + parseInt(bDecPadded, 10)).toString().padStart(decLen, '0');
  let carry = 0;
  let decResult = decSum;
  if (decSum.length > decLen) {
    carry = parseInt(decSum.slice(0, decSum.length - decLen), 10);
    decResult = decSum.slice(-decLen);
  }
  const intSum = (parseInt(aInt, 10) + parseInt(bInt, 10) + carry).toString();
  return decLen > 0 ? `${intSum}.${decResult}`.replace(/\.?0+$/, '') : intSum;
}

/**
 * Finds the AmuletRules_Transfer event in an event tree
 *
 * @param eventTree - The event tree as a Record<string, TreeEvent>
 * @returns The TreeEvent containing fee information, or null if not found
 */
function findAmuletRulesTransferEvent(eventTree: Record<string, TreeEvent>): TreeEvent | null {
  for (const [, treeEvent] of Object.entries(eventTree)) {
    if ('ExercisedTreeEvent' in treeEvent) {
      const exercisedEvent = treeEvent.ExercisedTreeEvent.value;
      if (exercisedEvent.choice === 'AmuletRules_Transfer') {
        return treeEvent;
      }
    }
  }
  return null;
}

/**
 * Parses fee information from an event tree (Record<string, TreeEvent>)
 *
 * @param eventTree - The event tree object
 * @returns FeeAnalysis object with extracted fee information and validation
 */
export function parseFeesFromEventTree(eventTree: Record<string, TreeEvent>): FeeAnalysis {
  const amuletRulesEvent = findAmuletRulesTransferEvent(eventTree);

  if (!amuletRulesEvent) {
    throw new ValidationError('No AmuletRules_Transfer event found in event tree', {
      eventCount: Object.keys(eventTree).length,
    });
  }

  return parseFeesFromUpdate(amuletRulesEvent);
}

/**
 * Parses fee information from a TreeEvent
 *
 * @param treeEvent - The TreeEvent object
 * @returns FeeAnalysis object with extracted fee information and validation
 */
export function parseFeesFromUpdate(treeEvent: TreeEvent): FeeAnalysis {
  // Check if this is an exercised event that contains fee information
  if (!('ExercisedTreeEvent' in treeEvent)) {
    throw new ValidationError('No fee information found in TreeEvent - only exercised events contain fee data', {
      eventType: Object.keys(treeEvent)[0],
    });
  }

  const exercisedEvent = treeEvent.ExercisedTreeEvent.value;

  // Check if this is an AmuletRules_Transfer choice which contains fee information
  if (exercisedEvent.choice !== 'AmuletRules_Transfer') {
    throw new ValidationError(
      'No fee information found in TreeEvent - only AmuletRules_Transfer choices contain fee data',
      { choice: exercisedEvent.choice }
    );
  }

  const { exerciseResult } = exercisedEvent;

  if (!isExerciseResult(exerciseResult) || !isExerciseResultSummary(exerciseResult.summary)) {
    throw new ValidationError('No fee information found in exercise result', {
      hasResult: Boolean(exerciseResult),
    });
  }

  const { summary } = exerciseResult;

  // Extract fee components
  const holdingFees = typeof summary.holdingFees === 'string' ? summary.holdingFees : '0';
  const outputFees = Array.isArray(summary.outputFees) ? summary.outputFees : [];
  const senderChangeFee = typeof summary.senderChangeFee === 'string' ? summary.senderChangeFee : '0';

  // Calculate total fees using string math
  let totalFees = holdingFees;
  for (const fee of outputFees) {
    totalFees = addStrings(totalFees, fee);
  }
  totalFees = addStrings(totalFees, senderChangeFee);
  // Pad to 10 decimals for output
  totalFees = parseFloat(totalFees).toFixed(10);

  // Extract balance changes
  const balanceChanges: BalanceChange[] = summary.balanceChanges.map(([party, change]) => ({
    party,
    changeToInitialAmountAsOfRoundZero: change.changeToInitialAmountAsOfRoundZero,
    changeToHoldingFeesRate: typeof change.changeToHoldingFeesRate === 'string' ? change.changeToHoldingFeesRate : '0',
  }));

  // Calculate total balance change using string math
  let totalBalanceChange = '0';
  for (const change of balanceChanges) {
    const amt =
      typeof change.changeToInitialAmountAsOfRoundZero === 'string' ? change.changeToInitialAmountAsOfRoundZero : '0';
    totalBalanceChange = addStrings(totalBalanceChange, amt);
  }
  totalBalanceChange = parseFloat(totalBalanceChange).toFixed(10);

  // Validate that fees match balance changes (allow for small epsilon)
  const totalFeesCalculated = totalFees;
  const isBalanced = Math.abs(parseFloat(totalBalanceChange) + parseFloat(totalFeesCalculated)) < 1e-8;

  const feeValidation: FeeAnalysis['feeValidation'] = {
    isBalanced,
    totalBalanceChange,
    totalFeesCalculated,
  };

  if (!isBalanced) {
    feeValidation.discrepancy = (parseFloat(totalBalanceChange) + parseFloat(totalFeesCalculated)).toString();
  }

  return {
    totalFees,
    feeBreakdown: {
      holdingFees,
      outputFees,
      senderChangeFee,
    },
    balanceChanges,
    feeValidation,
  };
}

/**
 * Formats fee amounts for display
 *
 * @param amount - The fee amount as a string
 * @param decimals - Number of decimal places to show (default: 10)
 * @returns Formatted fee amount
 */
export function formatFeeAmount(amount: string, decimals = 10): string {
  const num = parseFloat(amount);
  return num.toFixed(decimals);
}

/**
 * Validates that all fee components are present and non-negative
 *
 * @param feeAnalysis - The fee analysis result
 * @returns Array of validation errors, empty if valid
 */
export function validateFeeAnalysis(feeAnalysis: FeeAnalysis): string[] {
  const errors: string[] = [];

  if (parseFloat(feeAnalysis.feeBreakdown.holdingFees) < 0) {
    errors.push('Holding fees cannot be negative');
  }

  if (parseFloat(feeAnalysis.feeBreakdown.senderChangeFee) < 0) {
    errors.push('Sender change fee cannot be negative');
  }

  for (const fee of feeAnalysis.feeBreakdown.outputFees) {
    if (parseFloat(fee) < 0) {
      errors.push('Output fees cannot be negative');
      break;
    }
  }

  if (!feeAnalysis.feeValidation.isBalanced) {
    errors.push(`Fee balance mismatch: ${feeAnalysis.feeValidation.discrepancy}`);
  }

  return errors;
}
