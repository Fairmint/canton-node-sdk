/**
 * Reading a mint or a burn back out of the transaction that performed it.
 *
 * `BurnMintFactory_BurnMint` returns a record rather than contract ids, and the interesting half of a mint is in that
 * record: `outputCids` names the holdings it created. The create events alone cannot say it — a mint of two holdings
 * creates two contracts with nothing to distinguish which output each was — so the exercise result is read instead.
 */

import { isRecord } from '../../../core/utils';
import {
  findExercisedEvent,
  findCreatedContractIds,
  requireTransactionUpdateId,
} from '../../parsers/event-parser';
import { TokenStandardV1Choice } from './constants';
import { requireContractIds, requireResultRecord } from './result';

export interface TokenStandardV1BurnMintResult {
  readonly updateId: string;
  /** `Holding` interface contract ids, one per output, in the order the outputs were given. Empty for a pure burn. */
  readonly outputHoldingCids: string[];
}

/**
 * The result of the burn-mint in this transaction: a mint's new holdings, or an empty list for a burn. Also finds a
 * burn-mint that was exercised as a child of another choice, which is how a redeem's burn is confirmed.
 */
export function parseBurnMintResult(transaction: unknown): TokenStandardV1BurnMintResult {
  const result = requireResultRecord(transaction, TokenStandardV1Choice.burnMint);
  return {
    updateId: requireTransactionUpdateId(transaction),
    outputHoldingCids: requireContractIds(result['outputCids'], 'outputCids'),
  };
}

export interface ParseMintedHoldingsOptions {
  /**
   * Template of the concrete holding contract, used only for the fallback path. Matched package-agnostically, so
   * `Module:Template`, `Template`, or a fully qualified id all work. When omitted the fallback returns every contract
   * the transaction created.
   */
  readonly holdingTemplate?: string;
}

/**
 * The holdings a mint created. Falls back to the transaction's create events when it contains no burn-mint exercise —
 * an admin recovery may mint through a registry-specific enforcement choice, which returns contract ids of the concrete
 * template rather than a burn-mint result.
 */
export function parseMintedHoldings(transaction: unknown, options: ParseMintedHoldingsOptions = {}): string[] {
  const burnMint = findExercisedEvent(transaction, TokenStandardV1Choice.burnMint);
  if (burnMint && isRecord(burnMint.exerciseResult)) {
    return requireContractIds(burnMint.exerciseResult['outputCids'], 'outputCids');
  }
  return findCreatedContractIds(transaction, options.holdingTemplate);
}
