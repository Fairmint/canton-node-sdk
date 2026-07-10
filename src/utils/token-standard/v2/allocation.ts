import type {
  SubmitAndWaitForTransactionTreeParams,
  SubmitAndWaitForTransactionTreeResponse,
} from '../../../clients/ledger-json-api/operations/v2/commands/submit-and-wait-for-transaction-tree';
import type { Command, DisclosedContract, ExerciseCommand } from '../../../clients/ledger-json-api/schemas';
import type { GetAllocationFactoryFromRegistryParams } from '../../../clients/scan-api/operations/v0/registry/allocation-instruction/v1/get-allocation-factory-from-registry';
import { CantonError, type ErrorContext } from '../../../core/errors';
import { isRecord } from '../../../core/utils';
import { extractEventsFromTransaction } from '../../parsers';
import type { TokenStandardV2Account, TokenStandardV2InstrumentId, TokenStandardV2Metadata } from './types';

export const TOKEN_STANDARD_V2_ALLOCATION_FACTORY_INTERFACE_ID =
  '#splice-api-token-allocation-instruction-v2:Splice.Api.Token.AllocationInstructionV2:AllocationFactory';

export const TOKEN_STANDARD_V2_ALLOCATION_FACTORY_ALLOCATE_CHOICE = 'AllocationFactory_Allocate';

export const TokenStandardV2AllocationErrorCode = {
  INPUT_INVALID: 'TOKEN_STANDARD_V2_ALLOCATION_INPUT_INVALID',
  FACTORY_RESPONSE_INVALID: 'TOKEN_STANDARD_V2_ALLOCATION_FACTORY_RESPONSE_INVALID',
  RESULT_INVALID: 'TOKEN_STANDARD_V2_ALLOCATION_RESULT_INVALID',
  RESULT_NOT_FOUND: 'TOKEN_STANDARD_V2_ALLOCATION_RESULT_NOT_FOUND',
} as const;

export type TokenStandardV2AllocationErrorCode =
  (typeof TokenStandardV2AllocationErrorCode)[keyof typeof TokenStandardV2AllocationErrorCode];

export class TokenStandardV2AllocationError extends CantonError {
  public override readonly name = 'TokenStandardV2AllocationError';

  public constructor(code: TokenStandardV2AllocationErrorCode, message: string, context?: ErrorContext) {
    super(message, code, context);
  }
}

export type TokenStandardV2ChoiceContext = Readonly<Record<string, unknown>>;

export interface TokenStandardV2ExtraArgs {
  readonly context: TokenStandardV2ChoiceContext;
  readonly meta: TokenStandardV2Metadata;
}

export interface TokenStandardV2SettlementInfo {
  readonly executors: readonly string[];
  readonly id: string;
  readonly cid: string | null;
  readonly meta?: TokenStandardV2Metadata;
}

export type TokenStandardV2TransferSide = 'SenderSide' | 'ReceiverSide';

export interface TokenStandardV2TransferLegSide {
  readonly transferLegId: string;
  readonly side: TokenStandardV2TransferSide;
  readonly otherside: TokenStandardV2Account;
  readonly amount: string;
  readonly instrumentId: TokenStandardV2InstrumentId['id'];
  readonly meta?: TokenStandardV2Metadata;
}

export interface TokenStandardV2AllocationSpecification {
  readonly admin: TokenStandardV2InstrumentId['admin'];
  readonly authorizer: TokenStandardV2Account;
  readonly transferLegSides: readonly TokenStandardV2TransferLegSide[];
  readonly settlementDeadline: string | null;
  /** Undefined selects the helper default; null is the Token Standard optional value sent to the ledger. */
  readonly nextIterationFunding?: Readonly<Record<string, string>> | null;
  /** Token Standard V2 allocation instructions are committed by default. */
  readonly committed?: boolean;
  readonly meta?: TokenStandardV2Metadata;
}

export interface TokenStandardV2AllocationChoiceArgument {
  readonly settlement: TokenStandardV2SettlementInfo & { readonly meta: TokenStandardV2Metadata };
  readonly allocation: Omit<
    TokenStandardV2AllocationSpecification,
    'committed' | 'meta' | 'nextIterationFunding' | 'transferLegSides'
  > & {
    readonly transferLegSides: ReadonlyArray<
      TokenStandardV2TransferLegSide & { readonly meta: TokenStandardV2Metadata }
    >;
    readonly nextIterationFunding: Readonly<Record<string, string>> | null;
    readonly committed: boolean;
    readonly meta: TokenStandardV2Metadata;
  };
  readonly requestedAt: string;
  readonly inputHoldingCids: readonly string[];
  readonly extraArgs: TokenStandardV2ExtraArgs;
  readonly actors: readonly string[];
}

export interface BuildTokenStandardV2AllocationChoiceArgumentParams {
  readonly settlement: TokenStandardV2SettlementInfo;
  readonly allocation: TokenStandardV2AllocationSpecification;
  readonly requestedAt: string;
  readonly inputHoldingCids: readonly string[];
  readonly actors: readonly string[];
  readonly extraArgs?: TokenStandardV2ExtraArgs;
}

export interface BuildTokenStandardV2AllocationCommandParams extends BuildTokenStandardV2AllocationChoiceArgumentParams {
  readonly allocationFactoryContractId: string;
  /** Override only when the registry advertises a compatible V2 interface identifier. */
  readonly allocationFactoryInterfaceId?: string;
}

export interface TokenStandardV2AllocationRegistryClient {
  getAllocationFactoryFromRegistry(params: GetAllocationFactoryFromRegistryParams): Promise<unknown>;
}

export interface PrepareTokenStandardV2AllocationCommandParams extends BuildTokenStandardV2AllocationChoiceArgumentParams {
  readonly registryUrl: string;
  readonly scan: TokenStandardV2AllocationRegistryClient;
  readonly allocationFactoryInterfaceId?: string;
  readonly excludeDebugFields?: boolean;
}

export interface PreparedTokenStandardV2AllocationCommand {
  readonly command: Command;
  readonly allocationFactoryContractId: string;
  readonly disclosedContracts: readonly DisclosedContract[];
  readonly choiceArgument: TokenStandardV2AllocationChoiceArgument;
}

export interface TokenStandardV2AllocationLedgerClient {
  submitAndWaitForTransactionTree(
    params: SubmitAndWaitForTransactionTreeParams
  ): Promise<SubmitAndWaitForTransactionTreeResponse>;
}

export interface SubmitPreparedTokenStandardV2AllocationParams {
  readonly ledger: TokenStandardV2AllocationLedgerClient;
  readonly prepared: PreparedTokenStandardV2AllocationCommand;
  readonly actAs: readonly string[];
  readonly readAs?: readonly string[];
  readonly commandId?: string;
  readonly submissionId?: string;
}

export interface TokenStandardV2AllocationInstructionCompleted {
  readonly type: 'Completed';
  readonly allocationCid: string;
}

export interface TokenStandardV2AllocationInstructionPending {
  readonly type: 'Pending';
  readonly allocationInstructionCid: string;
}

export interface TokenStandardV2AllocationInstructionFailed {
  readonly type: 'Failed';
}

export type TokenStandardV2AllocationInstructionResult =
  | TokenStandardV2AllocationInstructionCompleted
  | TokenStandardV2AllocationInstructionPending
  | TokenStandardV2AllocationInstructionFailed;

export interface SubmitPreparedTokenStandardV2AllocationResult {
  readonly updateId: string;
  readonly result: TokenStandardV2AllocationInstructionResult;
  readonly response: SubmitAndWaitForTransactionTreeResponse;
}

function requireNonEmpty(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TokenStandardV2AllocationError(
      'TOKEN_STANDARD_V2_ALLOCATION_INPUT_INVALID',
      `${fieldName} must be non-empty.`,
      { field: fieldName }
    );
  }
  return normalized;
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeStrings(values: readonly string[], fieldName: string, allowEmpty = false): string[] {
  if (!allowEmpty && values.length === 0) {
    throw new TokenStandardV2AllocationError(
      'TOKEN_STANDARD_V2_ALLOCATION_INPUT_INVALID',
      `${fieldName} must contain at least one value.`,
      { field: fieldName }
    );
  }
  return values.map((value, index) => requireNonEmpty(value, `${fieldName}[${index}]`));
}

function emptyTokenStandardV2ExtraArgs(): TokenStandardV2ExtraArgs {
  return {
    context: { values: {} },
    meta: { values: {} },
  };
}

function withDefaultTokenStandardV2Metadata<T extends { readonly meta?: TokenStandardV2Metadata }>(
  value: T
): Omit<T, 'meta'> & { readonly meta: TokenStandardV2Metadata } {
  return {
    ...value,
    meta: value.meta ?? { values: {} },
  };
}

export function buildTokenStandardV2AllocationChoiceArgument(
  params: BuildTokenStandardV2AllocationChoiceArgumentParams
): TokenStandardV2AllocationChoiceArgument {
  const extraArgs = params.extraArgs ?? emptyTokenStandardV2ExtraArgs();
  return {
    settlement: withDefaultTokenStandardV2Metadata(params.settlement),
    allocation: {
      ...withDefaultTokenStandardV2Metadata(params.allocation),
      admin: requireNonEmpty(params.allocation.admin, 'allocation.admin'),
      transferLegSides: params.allocation.transferLegSides.map((transferLegSide) =>
        withDefaultTokenStandardV2Metadata(transferLegSide)
      ),
      nextIterationFunding: params.allocation.nextIterationFunding ?? null,
      committed: params.allocation.committed ?? true,
    },
    requestedAt: requireNonEmpty(params.requestedAt, 'requestedAt'),
    inputHoldingCids: normalizeStrings(params.inputHoldingCids, 'inputHoldingCids', true),
    extraArgs: {
      context: extraArgs.context,
      meta: extraArgs.meta,
    },
    actors: normalizeStrings(params.actors, 'actors'),
  };
}

function buildTokenStandardV2AllocationCommandFromChoiceArgument(params: {
  readonly allocationFactoryContractId: string;
  readonly allocationFactoryInterfaceId?: string;
  readonly choiceArgument: TokenStandardV2AllocationChoiceArgument;
}): Command {
  const templateId =
    params.allocationFactoryInterfaceId === undefined
      ? TOKEN_STANDARD_V2_ALLOCATION_FACTORY_INTERFACE_ID
      : requireNonEmpty(params.allocationFactoryInterfaceId, 'allocationFactoryInterfaceId');
  return {
    ExerciseCommand: {
      templateId,
      contractId: requireNonEmpty(params.allocationFactoryContractId, 'allocationFactoryContractId'),
      choice: TOKEN_STANDARD_V2_ALLOCATION_FACTORY_ALLOCATE_CHOICE,
      choiceArgument: params.choiceArgument as unknown as ExerciseCommand['ExerciseCommand']['choiceArgument'],
    },
  };
}

export function buildTokenStandardV2AllocationCommand(params: BuildTokenStandardV2AllocationCommandParams): Command {
  return buildTokenStandardV2AllocationCommandFromChoiceArgument({
    allocationFactoryContractId: params.allocationFactoryContractId,
    ...(params.allocationFactoryInterfaceId === undefined
      ? {}
      : { allocationFactoryInterfaceId: params.allocationFactoryInterfaceId }),
    choiceArgument: buildTokenStandardV2AllocationChoiceArgument(params),
  });
}

function parseDisclosedContract(value: unknown): DisclosedContract {
  const record = isRecord(value) ? value : undefined;
  const templateId = readNonEmptyString(record?.['templateId']);
  const contractId = readNonEmptyString(record?.['contractId']);
  const createdEventBlob = readNonEmptyString(record?.['createdEventBlob']);
  const synchronizerId = readNonEmptyString(record?.['synchronizerId']);
  if (!templateId || !contractId || !createdEventBlob || !synchronizerId) {
    throw new TokenStandardV2AllocationError(
      'TOKEN_STANDARD_V2_ALLOCATION_FACTORY_RESPONSE_INVALID',
      'Token Standard V2 allocation registry returned an invalid disclosed contract.',
      { value }
    );
  }
  return {
    templateId,
    contractId,
    createdEventBlob,
    synchronizerId,
  };
}

function parseAllocationFactoryResponse(value: unknown): {
  readonly factoryId: string;
  readonly choiceContextData: TokenStandardV2ChoiceContext;
  readonly disclosedContracts: readonly DisclosedContract[];
} {
  const response = isRecord(value) ? value : undefined;
  const choiceContext = isRecord(response?.['choiceContext']) ? response['choiceContext'] : undefined;
  const choiceContextData = isRecord(choiceContext?.['choiceContextData'])
    ? choiceContext['choiceContextData']
    : undefined;
  const disclosedContracts = choiceContext?.['disclosedContracts'];
  const factoryId = readNonEmptyString(response?.['factoryId']);
  if (!factoryId || !choiceContextData || !Array.isArray(disclosedContracts)) {
    throw new TokenStandardV2AllocationError(
      'TOKEN_STANDARD_V2_ALLOCATION_FACTORY_RESPONSE_INVALID',
      'Token Standard V2 allocation registry returned an invalid factory choice context.',
      { value }
    );
  }
  return {
    factoryId,
    choiceContextData,
    disclosedContracts: disclosedContracts.map(parseDisclosedContract),
  };
}

export async function prepareTokenStandardV2AllocationCommand(
  params: PrepareTokenStandardV2AllocationCommandParams
): Promise<PreparedTokenStandardV2AllocationCommand> {
  const registryUrl = requireNonEmpty(params.registryUrl, 'registryUrl');
  const initialChoiceArgument = buildTokenStandardV2AllocationChoiceArgument(params);
  const request: GetAllocationFactoryFromRegistryParams = {
    registryUrl,
    choiceArguments: initialChoiceArgument as unknown as GetAllocationFactoryFromRegistryParams['choiceArguments'],
    ...(params.excludeDebugFields === undefined ? {} : { excludeDebugFields: params.excludeDebugFields }),
  };
  const factory = parseAllocationFactoryResponse(await params.scan.getAllocationFactoryFromRegistry(request));
  const choiceArgument: TokenStandardV2AllocationChoiceArgument = {
    ...initialChoiceArgument,
    extraArgs: {
      ...initialChoiceArgument.extraArgs,
      context: factory.choiceContextData,
    },
  };
  return {
    allocationFactoryContractId: factory.factoryId,
    disclosedContracts: factory.disclosedContracts,
    choiceArgument,
    command: buildTokenStandardV2AllocationCommandFromChoiceArgument({
      allocationFactoryContractId: factory.factoryId,
      ...(params.allocationFactoryInterfaceId === undefined
        ? {}
        : { allocationFactoryInterfaceId: params.allocationFactoryInterfaceId }),
      choiceArgument,
    }),
  };
}

function tryParseTokenStandardV2AllocationInstructionResult(
  value: unknown
): TokenStandardV2AllocationInstructionResult | undefined {
  const record = isRecord(value) ? value : undefined;
  const output = isRecord(record?.['output']) ? record['output'] : undefined;
  const tag = readNonEmptyString(output?.['tag']);
  if (!tag) return undefined;
  const variant = isRecord(output?.['value']) ? output['value'] : undefined;
  switch (tag) {
    case 'AllocationInstructionResult_Completed': {
      const allocationCid = readNonEmptyString(variant?.['allocationCid']);
      return allocationCid ? { type: 'Completed', allocationCid } : undefined;
    }
    case 'AllocationInstructionResult_Pending': {
      const allocationInstructionCid = readNonEmptyString(variant?.['allocationInstructionCid']);
      return allocationInstructionCid ? { type: 'Pending', allocationInstructionCid } : undefined;
    }
    case 'AllocationInstructionResult_Failed':
      return { type: 'Failed' };
    default:
      return undefined;
  }
}

export function parseTokenStandardV2AllocationInstructionResult(
  value: unknown
): TokenStandardV2AllocationInstructionResult {
  const parsed = tryParseTokenStandardV2AllocationInstructionResult(value);
  if (!parsed) {
    throw new TokenStandardV2AllocationError(
      'TOKEN_STANDARD_V2_ALLOCATION_RESULT_INVALID',
      'Token Standard V2 AllocationInstructionResult is malformed.',
      { value }
    );
  }
  return parsed;
}

export function findTokenStandardV2AllocationInstructionResult(
  input: unknown
): TokenStandardV2AllocationInstructionResult | undefined {
  const direct = tryParseTokenStandardV2AllocationInstructionResult(input);
  if (direct) return direct;

  const { exercised } = extractEventsFromTransaction(input);
  for (const event of exercised) {
    if (event.choice !== TOKEN_STANDARD_V2_ALLOCATION_FACTORY_ALLOCATE_CHOICE) continue;
    const parsed = tryParseTokenStandardV2AllocationInstructionResult(event.exerciseResult);
    if (parsed) return parsed;
  }
  return undefined;
}

function readTransactionTreeUpdateId(response: unknown): string | undefined {
  if (!isRecord(response)) return undefined;
  const transactionTree = isRecord(response['transactionTree']) ? response['transactionTree'] : undefined;
  return readNonEmptyString(transactionTree?.['updateId']);
}

export async function submitPreparedTokenStandardV2Allocation(
  params: SubmitPreparedTokenStandardV2AllocationParams
): Promise<SubmitPreparedTokenStandardV2AllocationResult> {
  const actAs = normalizeStrings(params.actAs, 'actAs');
  const readAs = params.readAs ? normalizeStrings(params.readAs, 'readAs', true) : [];
  const submitParams: SubmitAndWaitForTransactionTreeParams = {
    commands: [params.prepared.command],
    actAs,
    ...(readAs.length > 0 ? { readAs } : {}),
    disclosedContracts: [...params.prepared.disclosedContracts],
    ...(params.commandId ? { commandId: params.commandId } : {}),
    ...(params.submissionId ? { submissionId: params.submissionId } : {}),
  };
  const response = await params.ledger.submitAndWaitForTransactionTree(submitParams);
  const result = findTokenStandardV2AllocationInstructionResult(response);
  if (!result) {
    throw new TokenStandardV2AllocationError(
      'TOKEN_STANDARD_V2_ALLOCATION_RESULT_NOT_FOUND',
      `${TOKEN_STANDARD_V2_ALLOCATION_FACTORY_ALLOCATE_CHOICE} result was not found in the transaction tree.`,
      { updateId: readTransactionTreeUpdateId(response) }
    );
  }
  const updateId = readTransactionTreeUpdateId(response);
  if (!updateId) {
    throw new TokenStandardV2AllocationError(
      'TOKEN_STANDARD_V2_ALLOCATION_RESULT_INVALID',
      'Token Standard V2 allocation submission response did not include transactionTree.updateId.',
      { response }
    );
  }
  return {
    updateId,
    result,
    response,
  };
}
