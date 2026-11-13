/**
 * Pure Ledger JSON API v2 command builders for the holder-side DA Registry and CIP-56 actions, typed as JSON so a
 * wallet can pass them on unchanged.
 *
 * Template, interface and choice names are the SDK's own constants. The builders themselves are not shared with
 * `da-registry/commands` (whose module graph reaches Node-only code) or `buildTokenStandardV1TransferCommand` (which
 * throws the SDK's Node error classes); unit tests check that both produce the same JSON as those builders.
 */
import type { JsonObject } from './json';
import { DA_REGISTRY_TEMPLATES } from '../da-registry/templates';
import {
  TOKEN_STANDARD_V1_TRANSFER_FACTORY_INTERFACE_ID,
  TOKEN_STANDARD_V1_TRANSFER_INSTRUCTION_INTERFACE_ID,
  TokenStandardV1Choice,
} from '../utils/token-standard/v1/constants';
import type { ChoiceContextData, TransferInstructionAction, TransferSpec } from './token-registry';
import type { CreateCommand, ExerciseCommand, InstrumentId } from './types';

/** Splice `ExtraArgs`: the registry's context, unchanged, and empty metadata. */
export function extraArgs(context: ChoiceContextData): JsonObject {
  return { context: { values: context.values }, meta: { values: {} } };
}

function instrumentIdJson(instrumentId: InstrumentId): JsonObject {
  return { admin: instrumentId.admin, id: instrumentId.id };
}

/** The holder accepts a DA mint offer (`MintOffer_Accept`). */
export function acceptMintOfferCommand(mintOfferCid: string, context: ChoiceContextData): ExerciseCommand {
  return {
    ExerciseCommand: {
      templateId: DA_REGISTRY_TEMPLATES.mintOffer,
      contractId: mintOfferCid,
      choice: 'MintOffer_Accept',
      choiceArgument: { extraArgs: extraArgs(context) },
    },
  };
}

/** DA's `Burn` record. */
export interface DaBurn {
  readonly instrumentId: InstrumentId;
  readonly amount: string;
  readonly holder: string;
  readonly reference: string;
  readonly requestedAt: string;
  readonly executeBefore: string;
}

/**
 * The holder's burn request (`AllocationFactory_RequestBurn`, controlled by the holder): DA merges and splits
 * `holdingCids`, locks exactly the amount to the registrar and creates a `BurnRequest`. `meta` is left empty.
 */
export function requestBurnCommand(params: {
  readonly allocationFactoryCid: string;
  readonly expectedAdmin: string;
  readonly burn: DaBurn;
  readonly holdingCids: readonly string[];
  readonly context: ChoiceContextData;
}): ExerciseCommand {
  const { burn } = params;
  return {
    ExerciseCommand: {
      templateId: DA_REGISTRY_TEMPLATES.allocationFactory,
      contractId: params.allocationFactoryCid,
      choice: 'AllocationFactory_RequestBurn',
      choiceArgument: {
        expectedAdmin: params.expectedAdmin,
        burn: {
          instrumentId: instrumentIdJson(burn.instrumentId),
          amount: burn.amount,
          holder: burn.holder,
          reference: burn.reference,
          requestedAt: burn.requestedAt,
          executeBefore: burn.executeBefore,
          meta: { values: {} },
        },
        holdingCids: [...params.holdingCids],
        extraArgs: extraArgs(params.context),
      },
    },
  };
}

/** The CIP-56 transfer (`TransferFactory_Transfer` on the TransferFactory interface), acting as the sender. */
export function transferCommand(params: {
  readonly factoryId: string;
  readonly expectedAdmin: string;
  readonly transfer: TransferSpec;
  readonly context: ChoiceContextData;
}): ExerciseCommand {
  const { transfer } = params;
  return {
    ExerciseCommand: {
      templateId: TOKEN_STANDARD_V1_TRANSFER_FACTORY_INTERFACE_ID,
      contractId: params.factoryId,
      choice: TokenStandardV1Choice.transfer,
      choiceArgument: {
        expectedAdmin: params.expectedAdmin,
        transfer: {
          sender: transfer.sender,
          receiver: transfer.receiver,
          amount: transfer.amount,
          instrumentId: instrumentIdJson(transfer.instrumentId),
          requestedAt: transfer.requestedAt,
          executeBefore: transfer.executeBefore,
          inputHoldingCids: [...transfer.inputHoldingCids],
          meta: { values: { ...transfer.meta.values } },
        },
        extraArgs: extraArgs(params.context),
      },
    },
  };
}

const TRANSFER_INSTRUCTION_CHOICES: Readonly<Record<TransferInstructionAction, string>> = {
  accept: TokenStandardV1Choice.transferInstructionAccept,
  reject: TokenStandardV1Choice.transferInstructionReject,
  withdraw: TokenStandardV1Choice.transferInstructionWithdraw,
};

/** Accept or reject (receiver) or withdraw (sender) a pending CIP-56 transfer, on the TransferInstruction interface. */
export function transferInstructionCommand(
  transferInstructionCid: string,
  action: TransferInstructionAction,
  context: ChoiceContextData
): ExerciseCommand {
  return {
    ExerciseCommand: {
      templateId: TOKEN_STANDARD_V1_TRANSFER_INSTRUCTION_INTERFACE_ID,
      contractId: transferInstructionCid,
      choice: TRANSFER_INSTRUCTION_CHOICES[action],
      choiceArgument: { extraArgs: extraArgs(context) },
    },
  };
}

/** DA allows up to 10 instrument ids per preapproval; an empty list covers every instrument of the admin. */
export const MAX_PREAPPROVAL_INSTRUMENTS = 10;

/**
 * The receiver's DA transfer preapproval (a plain create; signatory the receiver, observer DA's operator). Transfers of
 * the allowed instruments then complete at once instead of waiting for the receiver to accept.
 *
 * Experimental: the same command as `da-registry`'s `createTransferPreapproval`, but no holder-side create of it has
 * been observed on a live network yet.
 */
export function createDaTransferPreapprovalCommand(params: {
  readonly operator: string;
  readonly receiver: string;
  readonly instrumentAdmin: string;
  readonly instrumentIds: readonly string[];
}): CreateCommand {
  return {
    CreateCommand: {
      templateId: DA_REGISTRY_TEMPLATES.transferPreapproval,
      createArguments: {
        operator: params.operator,
        receiver: params.receiver,
        instrumentAdmin: params.instrumentAdmin,
        instrumentAllowances: params.instrumentIds.map((id) => ({ id })),
      },
    },
  };
}
