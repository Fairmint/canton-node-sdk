import type {
  SubmitAndWaitForTransactionTreeParams,
  SubmitAndWaitForTransactionTreeResponse,
} from '../../../clients/ledger-json-api/operations/v2/commands/submit-and-wait-for-transaction-tree';
import type { Command, DisclosedContract, ExerciseCommand } from '../../../clients/ledger-json-api/schemas';
import type { GetAllocationFactoryV2FromRegistryParams } from '../../../clients/scan-api/operations/v0/registry/allocation-instruction/v2/get-allocation-factory-v2-from-registry';
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
  public override readonly name: string;

  public constructor(code: TokenStandardV2AllocationErrorCode, message: string, context?: ErrorContext) {
    super(message, code, context);
    this.name = 'TokenStandardV2AllocationError';
  }
}

export interface TokenStandardV2ChoiceContext {
  readonly values: Readonly<Record<string, unknown>>;
}

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
  readonly nextIterationFunding?: Readonly<Record<string, string>> | null;
  readonly committed: boolean;
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
  getAllocationFactoryV2FromRegistry(params: GetAllocationFactoryV2FromRegistryParams): Promise<unknown>;
}

export interface PrepareTokenStandardV2AllocationCommandParams extends Omit<
  BuildTokenStandardV2AllocationChoiceArgumentParams,
  'extraArgs'
> {
  readonly registryUrl: string;
  readonly scan: TokenStandardV2AllocationRegistryClient;
  /** Caller metadata is applied only after the registry returns its choice context. */
  readonly metadata?: TokenStandardV2Metadata;
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
  /** Stable across retries so Canton command deduplication can protect against duplicate allocations. */
  readonly commandId: string;
  readonly submissionId?: string;
  readonly deduplicationPeriod?: SubmitAndWaitForTransactionTreeParams['deduplicationPeriod'];
  readonly synchronizerId?: string;
  readonly userId?: string;
  readonly workflowId?: string;
}

export interface TokenStandardV2AllocationInstructionResultBase {
  readonly authorizerChangeCids: Readonly<Record<string, readonly string[]>>;
  readonly meta: TokenStandardV2Metadata;
}

export interface TokenStandardV2AllocationInstructionCompleted extends TokenStandardV2AllocationInstructionResultBase {
  readonly type: 'Completed';
  readonly allocationCid: string;
}

export interface TokenStandardV2AllocationInstructionPending extends TokenStandardV2AllocationInstructionResultBase {
  readonly type: 'Pending';
  readonly allocationInstructionCid: string;
}

export interface TokenStandardV2AllocationInstructionFailed extends TokenStandardV2AllocationInstructionResultBase {
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

function requireNonEmpty(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.INPUT_INVALID,
      `${fieldName} must be a string.`,
      { field: fieldName }
    );
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.INPUT_INVALID,
      `${fieldName} must be non-empty.`,
      { field: fieldName }
    );
  }
  return normalized;
}

function requireInputRecord(value: unknown, fieldName: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.INPUT_INVALID,
      `${fieldName} must be an object.`,
      { field: fieldName }
    );
  }
}

function requireText(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.INPUT_INVALID,
      `${fieldName} must be text.`,
      { field: fieldName }
    );
  }
  return value;
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeStrings(values: readonly string[], fieldName: string, allowEmpty = false): string[] {
  if (!Array.isArray(values)) {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.INPUT_INVALID,
      `${fieldName} must be an array.`,
      { field: fieldName }
    );
  }
  if (!allowEmpty && values.length === 0) {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.INPUT_INVALID,
      `${fieldName} must contain at least one value.`,
      { field: fieldName }
    );
  }
  return values.map((value, index) => requireNonEmpty(value, `${fieldName}[${index}]`));
}

function copyStringRecord(value: unknown, fieldName: string): Readonly<Record<string, string>> {
  if (!isRecord(value)) {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.INPUT_INVALID,
      `${fieldName} must be a string map.`,
      { field: fieldName }
    );
  }
  const result = Object.create(null) as Record<string, string>;
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') {
      throw new TokenStandardV2AllocationError(
        TokenStandardV2AllocationErrorCode.INPUT_INVALID,
        `${fieldName}.${key} must be a string.`,
        { field: `${fieldName}.${key}` }
      );
    }
    Object.defineProperty(result, key, {
      value: entry,
      enumerable: true,
      configurable: true,
      writable: false,
    });
  }
  return result;
}

function normalizeMetadata(value: unknown, fieldName: string): TokenStandardV2Metadata {
  if (!isRecord(value)) {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.INPUT_INVALID,
      `${fieldName} must be Token Standard metadata.`,
      { field: fieldName }
    );
  }
  return { values: copyStringRecord(value['values'], `${fieldName}.values`) };
}

function normalizeChoiceContext(
  value: unknown,
  fieldName: string,
  code: TokenStandardV2AllocationErrorCode = TokenStandardV2AllocationErrorCode.FACTORY_RESPONSE_INVALID
): TokenStandardV2ChoiceContext {
  if (!isRecord(value) || !isRecord(value['values'])) {
    throw new TokenStandardV2AllocationError(code, `${fieldName} must be a Token Standard choice context.`, {
      field: fieldName,
    });
  }
  const values = Object.create(null) as Record<string, unknown>;
  for (const [key, entry] of Object.entries(value['values'])) {
    Object.defineProperty(values, key, {
      value: entry,
      enumerable: true,
      configurable: true,
      writable: false,
    });
  }
  return { values };
}

function normalizeAccount(value: unknown, fieldName: string): TokenStandardV2Account {
  if (!isRecord(value)) {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.INPUT_INVALID,
      `${fieldName} must be a Token Standard V2 account.`,
      { field: fieldName }
    );
  }
  const { id, owner, provider } = value;
  if (typeof id !== 'string') {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.INPUT_INVALID,
      `${fieldName} must be a Token Standard V2 account.`,
      { field: fieldName }
    );
  }
  if (owner !== null && typeof owner !== 'string') {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.INPUT_INVALID,
      `${fieldName}.owner must be a party or null.`,
      { field: `${fieldName}.owner` }
    );
  }
  if (provider !== null && typeof provider !== 'string') {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.INPUT_INVALID,
      `${fieldName}.provider must be a party or null.`,
      { field: `${fieldName}.provider` }
    );
  }
  return {
    owner: owner === null ? null : requireNonEmpty(owner, `${fieldName}.owner`),
    provider: provider === null ? null : requireNonEmpty(provider, `${fieldName}.provider`),
    // CIP-112 uses the empty string as the default account identifier.
    id,
  };
}

function parseDecimalText(value: unknown, fieldName: string): { readonly text: string; readonly sign: -1 | 0 | 1 } {
  const text = requireNonEmpty(value, fieldName);
  const match = /^(-?)(\d{1,28})(?:\.(\d{1,10}))?$/.exec(text);
  if (!match) {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.INPUT_INVALID,
      `${fieldName} must be a valid Daml Decimal string.`,
      { field: fieldName }
    );
  }
  const digits = `${match[2]}${match[3] ?? ''}`;
  const sign = /^0+$/.test(digits) ? 0 : match[1] === '-' ? -1 : 1;
  return { text, sign };
}

function normalizePositiveDecimal(value: unknown, fieldName: string): string {
  const decimal = parseDecimalText(value, fieldName);
  if (decimal.sign !== 1) {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.INPUT_INVALID,
      `${fieldName} must be positive.`,
      { field: fieldName }
    );
  }
  return decimal.text;
}

function normalizeFunding(
  value: Readonly<Record<string, string>> | null | undefined,
  fieldName: string
): Readonly<Record<string, string>> | null {
  if (value === null || value === undefined) return null;
  const funding = copyStringRecord(value, fieldName);
  const normalized = Object.create(null) as Record<string, string>;
  for (const [key, amount] of Object.entries(funding)) {
    Object.defineProperty(normalized, key, {
      value: normalizePositiveDecimal(amount, `${fieldName}.${key}`),
      enumerable: true,
      configurable: true,
      writable: false,
    });
  }
  return normalized;
}

function emptyTokenStandardV2ExtraArgs(): TokenStandardV2ExtraArgs {
  return {
    context: { values: {} },
    meta: { values: {} },
  };
}

function defaultWhenUndefined<T>(value: T | undefined, fallback: T): T {
  if (value === undefined) return fallback;
  return value;
}

function withDefaultTokenStandardV2Metadata<T extends { readonly meta?: TokenStandardV2Metadata }>(
  value: T,
  fieldName: string
): Omit<T, 'meta'> & { readonly meta: TokenStandardV2Metadata } {
  return {
    ...value,
    meta: normalizeMetadata(defaultWhenUndefined(value.meta, { values: {} }), `${fieldName}.meta`),
  };
}

export function buildTokenStandardV2AllocationChoiceArgument(
  params: BuildTokenStandardV2AllocationChoiceArgumentParams
): TokenStandardV2AllocationChoiceArgument {
  requireInputRecord(params, 'params');
  requireInputRecord(params.settlement, 'settlement');
  requireInputRecord(params.allocation, 'allocation');
  if (params.extraArgs !== undefined) requireInputRecord(params.extraArgs, 'extraArgs');
  const extraArgs = defaultWhenUndefined(params.extraArgs, emptyTokenStandardV2ExtraArgs());
  if (!Array.isArray(params.allocation.transferLegSides)) {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.INPUT_INVALID,
      'allocation.transferLegSides must be an array.',
      { field: 'allocation.transferLegSides' }
    );
  }
  if (typeof params.allocation.committed !== 'boolean') {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.INPUT_INVALID,
      'allocation.committed must be a boolean.',
      { field: 'allocation.committed' }
    );
  }
  const settlement = withDefaultTokenStandardV2Metadata(params.settlement, 'settlement');
  const allocation = withDefaultTokenStandardV2Metadata(params.allocation, 'allocation');
  const transferLegSides: TokenStandardV2AllocationChoiceArgument['allocation']['transferLegSides'] =
    params.allocation.transferLegSides.map((transferLegSide, index) => {
      const fieldName = `allocation.transferLegSides[${index}]`;
      if (!isRecord(transferLegSide)) {
        throw new TokenStandardV2AllocationError(
          TokenStandardV2AllocationErrorCode.INPUT_INVALID,
          `${fieldName} must be a transfer-leg side.`,
          { field: fieldName }
        );
      }
      const { amount, instrumentId, otherside, side, transferLegId } = transferLegSide;
      if (side !== 'SenderSide' && side !== 'ReceiverSide') {
        throw new TokenStandardV2AllocationError(
          TokenStandardV2AllocationErrorCode.INPUT_INVALID,
          `${fieldName}.side must be SenderSide or ReceiverSide.`,
          { field: `${fieldName}.side` }
        );
      }
      return {
        ...withDefaultTokenStandardV2Metadata(transferLegSide, fieldName),
        transferLegId: requireText(transferLegId, `${fieldName}.transferLegId`),
        side,
        otherside: normalizeAccount(otherside, `${fieldName}.otherside`),
        amount: normalizePositiveDecimal(amount, `${fieldName}.amount`),
        instrumentId: requireText(instrumentId, `${fieldName}.instrumentId`),
      };
    });
  const transferLegSideKeys = transferLegSides.map(({ side, transferLegId }) => JSON.stringify([transferLegId, side]));
  if (new Set(transferLegSideKeys).size !== transferLegSideKeys.length) {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.INPUT_INVALID,
      'allocation.transferLegSides must not contain duplicate transfer-leg sides.',
      { field: 'allocation.transferLegSides' }
    );
  }
  const nextIterationFunding = normalizeFunding(
    params.allocation.nextIterationFunding,
    'allocation.nextIterationFunding'
  );
  if (transferLegSides.length === 0 && nextIterationFunding === null) {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.INPUT_INVALID,
      'allocation.transferLegSides may be empty only when iterated settlement is enabled.',
      { field: 'allocation.transferLegSides' }
    );
  }
  return {
    settlement: {
      ...settlement,
      executors: normalizeStrings(params.settlement.executors, 'settlement.executors'),
      id: requireText(params.settlement.id, 'settlement.id'),
      cid: params.settlement.cid === null ? null : requireNonEmpty(params.settlement.cid, 'settlement.cid'),
    },
    allocation: {
      ...allocation,
      admin: requireNonEmpty(params.allocation.admin, 'allocation.admin'),
      authorizer: normalizeAccount(params.allocation.authorizer, 'allocation.authorizer'),
      transferLegSides,
      settlementDeadline:
        params.allocation.settlementDeadline === null
          ? null
          : requireNonEmpty(params.allocation.settlementDeadline, 'allocation.settlementDeadline'),
      nextIterationFunding,
      committed: params.allocation.committed,
    },
    requestedAt: requireNonEmpty(params.requestedAt, 'requestedAt'),
    inputHoldingCids: normalizeStrings(params.inputHoldingCids, 'inputHoldingCids', true),
    extraArgs: {
      context: normalizeChoiceContext(
        extraArgs.context,
        'extraArgs.context',
        TokenStandardV2AllocationErrorCode.INPUT_INVALID
      ),
      meta: normalizeMetadata(extraArgs.meta, 'extraArgs.meta'),
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
      TokenStandardV2AllocationErrorCode.FACTORY_RESPONSE_INVALID,
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
  const choiceContextData = choiceContext?.['choiceContextData'];
  const disclosedContracts = choiceContext?.['disclosedContracts'];
  const factoryId = readNonEmptyString(response?.['factoryId']);
  if (!factoryId || !Array.isArray(disclosedContracts)) {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.FACTORY_RESPONSE_INVALID,
      'Token Standard V2 allocation registry returned an invalid factory choice context.',
      { value }
    );
  }
  return {
    factoryId,
    choiceContextData: normalizeChoiceContext(choiceContextData, 'choiceContext.choiceContextData'),
    disclosedContracts: disclosedContracts.map(parseDisclosedContract),
  };
}

export async function prepareTokenStandardV2AllocationCommand(
  params: PrepareTokenStandardV2AllocationCommandParams
): Promise<PreparedTokenStandardV2AllocationCommand> {
  requireInputRecord(params, 'params');
  requireInputRecord(params.scan, 'scan');
  if (typeof params.scan.getAllocationFactoryV2FromRegistry !== 'function') {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.INPUT_INVALID,
      'scan.getAllocationFactoryV2FromRegistry must be a function.',
      { field: 'scan.getAllocationFactoryV2FromRegistry' }
    );
  }
  const registryUrl = requireNonEmpty(params.registryUrl, 'registryUrl');
  const registryChoiceArgument = buildTokenStandardV2AllocationChoiceArgument({
    ...params,
    extraArgs: emptyTokenStandardV2ExtraArgs(),
  });
  const request: GetAllocationFactoryV2FromRegistryParams = {
    registryUrl,
    choiceArguments: registryChoiceArgument as unknown as GetAllocationFactoryV2FromRegistryParams['choiceArguments'],
    excludeDebugFields: params.excludeDebugFields ?? true,
  };
  const factory = parseAllocationFactoryResponse(await params.scan.getAllocationFactoryV2FromRegistry(request));
  const choiceArgument: TokenStandardV2AllocationChoiceArgument = {
    ...registryChoiceArgument,
    extraArgs: {
      context: factory.choiceContextData,
      meta: normalizeMetadata(defaultWhenUndefined(params.metadata, { values: {} }), 'metadata'),
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

function tryReadMetadata(value: unknown): TokenStandardV2Metadata | undefined {
  if (!isRecord(value) || !isRecord(value['values'])) return undefined;
  const values = Object.create(null) as Record<string, string>;
  for (const [key, entry] of Object.entries(value['values'])) {
    if (typeof entry !== 'string') return undefined;
    Object.defineProperty(values, key, {
      value: entry,
      enumerable: true,
      configurable: true,
      writable: false,
    });
  }
  return { values };
}

function tryReadAuthorizerChangeCids(value: unknown): Readonly<Record<string, readonly string[]>> | undefined {
  if (!isRecord(value)) return undefined;
  const result = Object.create(null) as Record<string, readonly string[]>;
  for (const [key, entry] of Object.entries(value)) {
    if (
      !Array.isArray(entry) ||
      !entry.every((contractId) => typeof contractId === 'string' && contractId.trim().length > 0)
    ) {
      return undefined;
    }
    Object.defineProperty(result, key, {
      value: entry.map((contractId) => contractId.trim()),
      enumerable: true,
      configurable: true,
      writable: false,
    });
  }
  return result;
}

function tryParseTokenStandardV2AllocationInstructionResult(
  value: unknown
): TokenStandardV2AllocationInstructionResult | undefined {
  const record = isRecord(value) ? value : undefined;
  const output = isRecord(record?.['output']) ? record['output'] : undefined;
  const tag = readNonEmptyString(output?.['tag']);
  if (!tag) return undefined;
  const variant = isRecord(output?.['value']) ? output['value'] : undefined;
  const authorizerChangeCids = tryReadAuthorizerChangeCids(record?.['authorizerChangeCids']);
  const meta = tryReadMetadata(record?.['meta']);
  if (!authorizerChangeCids || !meta) return undefined;
  const common = { authorizerChangeCids, meta };
  switch (tag) {
    case 'AllocationInstructionResult_Completed': {
      const allocationCid = readNonEmptyString(variant?.['allocationCid']);
      return allocationCid ? { type: 'Completed', allocationCid, ...common } : undefined;
    }
    case 'AllocationInstructionResult_Pending': {
      const allocationInstructionCid = readNonEmptyString(variant?.['allocationInstructionCid']);
      return allocationInstructionCid ? { type: 'Pending', allocationInstructionCid, ...common } : undefined;
    }
    case 'AllocationInstructionResult_Failed':
      return { type: 'Failed', ...common };
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
      TokenStandardV2AllocationErrorCode.RESULT_INVALID,
      'Token Standard V2 AllocationInstructionResult is malformed.',
      { value }
    );
  }
  return parsed;
}

export function findTokenStandardV2AllocationInstructionResult(
  input: unknown,
  allocationFactoryContractId?: string
): TokenStandardV2AllocationInstructionResult | undefined {
  const direct = tryParseTokenStandardV2AllocationInstructionResult(input);
  if (direct) return direct;

  const { exercised } = extractEventsFromTransaction(input);
  for (const event of exercised) {
    if (event.choice !== TOKEN_STANDARD_V2_ALLOCATION_FACTORY_ALLOCATE_CHOICE) continue;
    if (allocationFactoryContractId !== undefined && event.contractId !== allocationFactoryContractId) continue;
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
  requireInputRecord(params, 'params');
  requireInputRecord(params.prepared, 'prepared');
  requireInputRecord(params.ledger, 'ledger');
  if (typeof params.ledger.submitAndWaitForTransactionTree !== 'function') {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.INPUT_INVALID,
      'ledger.submitAndWaitForTransactionTree must be a function.',
      { field: 'ledger.submitAndWaitForTransactionTree' }
    );
  }
  requireInputRecord(params.prepared.command, 'prepared.command');
  if (!Array.isArray(params.prepared.disclosedContracts)) {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.INPUT_INVALID,
      'prepared.disclosedContracts must be an array.',
      { field: 'prepared.disclosedContracts' }
    );
  }
  const allocationFactoryContractId = requireNonEmpty(
    params.prepared.allocationFactoryContractId,
    'prepared.allocationFactoryContractId'
  );
  const actAs = normalizeStrings(params.actAs, 'actAs');
  const readAs = params.readAs === undefined ? [] : normalizeStrings(params.readAs, 'readAs', true);
  const submitParams: SubmitAndWaitForTransactionTreeParams = {
    commands: [params.prepared.command],
    actAs,
    commandId: requireNonEmpty(params.commandId, 'commandId'),
    ...(readAs.length > 0 ? { readAs } : {}),
    disclosedContracts: [...params.prepared.disclosedContracts],
    ...(params.submissionId !== undefined
      ? { submissionId: requireNonEmpty(params.submissionId, 'submissionId') }
      : {}),
    ...(params.deduplicationPeriod !== undefined ? { deduplicationPeriod: params.deduplicationPeriod } : {}),
    ...(params.synchronizerId !== undefined
      ? { synchronizerId: requireNonEmpty(params.synchronizerId, 'synchronizerId') }
      : {}),
    ...(params.userId !== undefined ? { userId: requireNonEmpty(params.userId, 'userId') } : {}),
    ...(params.workflowId !== undefined ? { workflowId: requireNonEmpty(params.workflowId, 'workflowId') } : {}),
  };
  const response = await params.ledger.submitAndWaitForTransactionTree(submitParams);
  const result = findTokenStandardV2AllocationInstructionResult(response, allocationFactoryContractId);
  if (!result) {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.RESULT_NOT_FOUND,
      `${TOKEN_STANDARD_V2_ALLOCATION_FACTORY_ALLOCATE_CHOICE} result was not found in the transaction tree.`,
      { updateId: readTransactionTreeUpdateId(response) }
    );
  }
  const updateId = readTransactionTreeUpdateId(response);
  if (!updateId) {
    throw new TokenStandardV2AllocationError(
      TokenStandardV2AllocationErrorCode.RESULT_INVALID,
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
