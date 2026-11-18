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
import type { ChoiceContextData } from './da-utilities/client';
import type { CreateCommand, ExerciseCommand, InstrumentId } from './types';

/** The CIP-56 `Transfer` record. */
export interface TransferSpec {
  readonly sender: string;
  readonly receiver: string;
  /** Decimal string. */
  readonly amount: string;
  readonly instrumentId: InstrumentId;
  /** ISO-8601. */
  readonly requestedAt: string;
  /** ISO-8601. */
  readonly executeBefore: string;
  readonly inputHoldingCids: readonly string[];
  readonly meta: { readonly values: Readonly<Record<string, string>> };
}

/** An action on a pending transfer: the receiver accepts or rejects, the sender withdraws. */
export type TransferInstructionAction = 'accept' | 'reject' | 'withdraw';

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

/**
 * The holder rejects a DA mint offer (`MintOffer_Reject`: `{reason, extraArgs: Optional ExtraArgs}`). DA needs no
 * choice context for it.
 */
export function rejectMintOfferCommand(mintOfferCid: string, reason: string): ExerciseCommand {
  return {
    ExerciseCommand: {
      templateId: DA_REGISTRY_TEMPLATES.mintOffer,
      contractId: mintOfferCid,
      choice: 'MintOffer_Reject',
      choiceArgument: { reason, extraArgs: null },
    },
  };
}

/**
 * The holder cancels its burn request, and DA unlocks the amount. `BurnRequest_Cancel` takes `{extraArgs: Optional
 * ExtraArgs}` and is controlled by the burn's holder (DA's `utility-registry-app-v0` 0.9.2, as embedded in
 * `Fairmint/canton` `config/third-party-dars/tradecraft/canton-swap-amm-vault-1.3.19.dar`).
 */
export function cancelBurnRequestCommand(burnRequestCid: string): ExerciseCommand {
  return {
    ExerciseCommand: {
      templateId: DA_REGISTRY_TEMPLATES.burnRequest,
      contractId: burnRequestCid,
      choice: 'BurnRequest_Cancel',
      choiceArgument: { extraArgs: null },
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
 * The receiver's DA transfer preapproval (a plain create; signatory the receiver, observer DA's operator), the same
 * command as `da-registry`'s `createTransferPreapproval`. Transfers of the allowed instruments then complete at once
 * instead of waiting for the receiver to accept.
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

/**
 * The receiver withdraws its DA transfer preapproval. `TransferPreapproval_Withdraw` takes `{actor: Party}`, is
 * controlled by `actor` and checks it against the contract's receiver and operator (DA's `utility-registry-app-v0`
 * 0.9.2, as embedded in `Fairmint/canton` `config/third-party-dars/tradecraft/canton-swap-amm-vault-1.3.19.dar`).
 */
export function withdrawTransferPreapprovalCommand(preapprovalCid: string, actor: string): ExerciseCommand {
  return {
    ExerciseCommand: {
      templateId: DA_REGISTRY_TEMPLATES.transferPreapproval,
      contractId: preapprovalCid,
      choice: 'TransferPreapproval_Withdraw',
      choiceArgument: { actor },
    },
  };
}
