/**
 * Interface ids and choice names of the CIP-56 token standard V1 APIs.
 *
 * A standard choice is exercised against the _interface_ id rather than the template id, because that is the contract
 * the choice is defined on. The interface ids are package-name scoped (`#package-name:Module:Interface`), which is what
 * keeps them stable across DAR upgrades.
 */

export const TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID = '#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding';

/** Exercise target for `BurnMintFactory_BurnMint`, which every mint, burn and redeem goes through. */
export const TOKEN_STANDARD_V1_BURN_MINT_FACTORY_INTERFACE_ID =
  '#splice-api-token-burn-mint-v1:Splice.Api.Token.BurnMintV1:BurnMintFactory';

/** Exercise target for `TransferFactory_Transfer`. */
export const TOKEN_STANDARD_V1_TRANSFER_FACTORY_INTERFACE_ID =
  '#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferFactory';

/** Exercise target for the four choices on a pending transfer offer. */
export const TOKEN_STANDARD_V1_TRANSFER_INSTRUCTION_INTERFACE_ID =
  '#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferInstruction';

/** Exercise target for `AllocationFactory_Allocate`. */
export const TOKEN_STANDARD_V1_ALLOCATION_FACTORY_INTERFACE_ID =
  '#splice-api-token-allocation-instruction-v1:Splice.Api.Token.AllocationInstructionV1:AllocationFactory';

/** Exercise target for the three choices on a settled or unwinding allocation. */
export const TOKEN_STANDARD_V1_ALLOCATION_INTERFACE_ID =
  '#splice-api-token-allocation-v1:Splice.Api.Token.AllocationV1:Allocation';

/** Choice names as the Ledger JSON API spells them in an `ExerciseCommand`. */
export const TokenStandardV1Choice = {
  burnMint: 'BurnMintFactory_BurnMint',
  transfer: 'TransferFactory_Transfer',
  transferInstructionAccept: 'TransferInstruction_Accept',
  transferInstructionReject: 'TransferInstruction_Reject',
  transferInstructionWithdraw: 'TransferInstruction_Withdraw',
  transferInstructionUpdate: 'TransferInstruction_Update',
  allocate: 'AllocationFactory_Allocate',
  allocationExecuteTransfer: 'Allocation_ExecuteTransfer',
  allocationCancel: 'Allocation_Cancel',
  allocationWithdraw: 'Allocation_Withdraw',
} as const;

export type TokenStandardV1ChoiceName = (typeof TokenStandardV1Choice)[keyof typeof TokenStandardV1Choice];

/**
 * The five choices that return a `TransferInstructionResult`. One reader covers instructing, accepting, rejecting,
 * withdrawing and expiring, because all five return the same record.
 */
export const TOKEN_STANDARD_V1_TRANSFER_RESULT_CHOICES: readonly string[] = [
  TokenStandardV1Choice.transfer,
  TokenStandardV1Choice.transferInstructionAccept,
  TokenStandardV1Choice.transferInstructionReject,
  TokenStandardV1Choice.transferInstructionWithdraw,
  TokenStandardV1Choice.transferInstructionUpdate,
];

/** The three `TransferInstructionResult.output` variants the standard defines. */
export const TokenStandardV1TransferResultTag = {
  completed: 'TransferInstructionResult_Completed',
  pending: 'TransferInstructionResult_Pending',
  failed: 'TransferInstructionResult_Failed',
} as const;

export const TOKEN_STANDARD_V1_TRANSFER_RESULT_TAGS: readonly string[] = Object.values(
  TokenStandardV1TransferResultTag
);

/** The three `AllocationInstructionResult.output` variants the standard defines. */
export const TokenStandardV1AllocationResultTag = {
  completed: 'AllocationInstructionResult_Completed',
  pending: 'AllocationInstructionResult_Pending',
  failed: 'AllocationInstructionResult_Failed',
} as const;

export const TOKEN_STANDARD_V1_ALLOCATION_RESULT_TAGS: readonly string[] = Object.values(
  TokenStandardV1AllocationResultTag
);

/** The three exits an allocation has, all returning holdings; the difference is who gets them. */
export const TOKEN_STANDARD_V1_ALLOCATION_EXIT_CHOICES: readonly string[] = [
  TokenStandardV1Choice.allocationExecuteTransfer,
  TokenStandardV1Choice.allocationCancel,
  TokenStandardV1Choice.allocationWithdraw,
];
