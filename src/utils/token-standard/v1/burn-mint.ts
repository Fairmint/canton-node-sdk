/**
 * Reading a mint or a burn back out of the transaction that performed it.
 *
 * `BurnMintFactory_BurnMint` returns a record rather than contract ids, and the interesting half of a mint is in that
 * record: `outputCids` names the holdings it created. The create events alone cannot say it — a mint of two holdings
 * creates two contracts with nothing to distinguish which output each was — so the exercise result is read instead, and
 * a registry that mints outside the factory is read from the creates only when the caller asks for it.
 */

import {
  findExercisedEvent,
  findCreatedContractIds,
  getTransactionUpdateId,
  requireTransactionUpdateId,
} from '../../parsers/event-parser';
import { TokenStandardV1Choice } from './constants';
import { TokenStandardV1ResultError, TokenStandardV1ResultErrorCode } from './errors';
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
   * Registry-specific choices that mint without going through the burn-mint factory, such as an admin recovery's
   * `BurnHoldingEnforcement`, which returns contract ids of the concrete template rather than a burn-mint result. The
   * fallback reads create events only when the transaction exercised one of these — the stricter of the two opt-ins,
   * because it names the choice that did the minting rather than trusting the transaction's creates.
   */
  readonly mintingChoices?: readonly string[];
  /**
   * Template of the concrete holding contract, narrowing the fallback's create events to it. Matched
   * package-agnostically, so `Module:Template`, `Template`, or a fully qualified id all work.
   */
  readonly holdingTemplate?: string;
}

/**
 * The holdings a mint created, from `BurnMintFactory_BurnMint`'s `outputCids`.
 *
 * Create events are never read on their own: every contract a transaction happened to create is not the same thing as
 * the outputs of a mint, and answering with the first would name a sender's change as minted supply. A caller whose
 * registry mints outside the factory opts into the fallback by naming `mintingChoices`, `holdingTemplate`, or both;
 * without either, a transaction carrying no burn-mint result is reported.
 */
export function parseMintedHoldings(transaction: unknown, options: ParseMintedHoldingsOptions = {}): string[] {
  if (findExercisedEvent(transaction, TokenStandardV1Choice.burnMint)) {
    const result = requireResultRecord(transaction, TokenStandardV1Choice.burnMint);
    return requireContractIds(result['outputCids'], 'outputCids');
  }

  const { mintingChoices, holdingTemplate } = options;
  if (mintingChoices === undefined && holdingTemplate === undefined) {
    throw new TokenStandardV1ResultError(
      TokenStandardV1ResultErrorCode.RESULT_NOT_FOUND,
      `The transaction contains no ${TokenStandardV1Choice.burnMint} exercise, so it minted nothing. Name mintingChoices or holdingTemplate to read a registry-specific mint from the create events instead.`,
      { choice: TokenStandardV1Choice.burnMint, updateId: getTransactionUpdateId(transaction) }
    );
  }
  if (mintingChoices !== undefined && !findExercisedEvent(transaction, mintingChoices)) {
    throw new TokenStandardV1ResultError(
      TokenStandardV1ResultErrorCode.RESULT_NOT_FOUND,
      `The transaction contains neither a ${TokenStandardV1Choice.burnMint} exercise nor any of these minting choices: ${mintingChoices.join(', ')}.`,
      { choices: [TokenStandardV1Choice.burnMint, ...mintingChoices], updateId: getTransactionUpdateId(transaction) }
    );
  }

  return findCreatedContractIds(transaction, holdingTemplate);
}
