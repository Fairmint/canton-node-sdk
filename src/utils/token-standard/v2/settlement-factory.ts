import type { Command, DisclosedContract, ExerciseCommand } from '../../../clients/ledger-json-api/schemas';
import type { GetSettlementFactoryFromRegistryParams } from '../../../clients/scan-api/operations/v0/registry/allocation/v2/get-settlement-factory-from-registry';
import { CantonError, type ErrorContext } from '../../../core/errors';
import { isRecord } from '../../../core/utils';
import type {
  TokenStandardV2ExtraArgs,
  TokenStandardV2SettlementInfo,
  TokenStandardV2TransferLegSide,
} from './allocation';
import type { TokenStandardV2Account, TokenStandardV2Metadata } from './types';

export const TOKEN_STANDARD_V2_SETTLEMENT_FACTORY_INTERFACE_ID =
  '#splice-api-token-allocation-v2:Splice.Api.Token.AllocationV2:SettlementFactory';

export const TOKEN_STANDARD_V2_SETTLEMENT_FACTORY_SETTLE_BATCH_CHOICE = 'SettlementFactory_SettleBatch';

const DAML_DECIMAL_PATTERN = /^(-?)(\d{1,28})(?:\.(\d{1,10}))?$/;
const ZERO_DIGITS_PATTERN = /^0+$/;

export const TokenStandardV2SettlementFactoryErrorCode = {
  INPUT_INVALID: 'TOKEN_STANDARD_V2_SETTLEMENT_FACTORY_INPUT_INVALID',
  FACTORY_RESPONSE_INVALID: 'TOKEN_STANDARD_V2_SETTLEMENT_FACTORY_RESPONSE_INVALID',
} as const;

export type TokenStandardV2SettlementFactoryErrorCode =
  (typeof TokenStandardV2SettlementFactoryErrorCode)[keyof typeof TokenStandardV2SettlementFactoryErrorCode];

/** Typed failure raised while preparing a Token Standard V2 settlement-factory choice. */
export class TokenStandardV2SettlementFactoryError extends CantonError {
  public override readonly name = 'TokenStandardV2SettlementFactoryError';

  public constructor(code: TokenStandardV2SettlementFactoryErrorCode, message: string, context?: ErrorContext) {
    super(message, code, context);
  }
}

export interface TokenStandardV2TransferLeg {
  readonly transferLegId: string;
  readonly sender: TokenStandardV2Account;
  readonly receiver: TokenStandardV2Account;
  readonly amount: string;
  readonly instrumentId: string;
  readonly meta?: TokenStandardV2Metadata;
}

export interface TokenStandardV2FinalizedAllocation {
  readonly allocationCid: string;
  readonly extraTransferLegSides?: readonly TokenStandardV2TransferLegSide[];
  /** Omission and null both encode the absent Token Standard optional value sent to the ledger. */
  readonly nextIterationFunding?: Readonly<Record<string, string>> | null;
}

export interface TokenStandardV2SettlementChoiceContext {
  readonly values: Readonly<Record<string, unknown>>;
}

export type TokenStandardV2SettlementExtraArgs = Omit<TokenStandardV2ExtraArgs, 'context'> & {
  readonly context: TokenStandardV2SettlementChoiceContext;
};

export interface TokenStandardV2SettlementChoiceArgument {
  readonly settlement: TokenStandardV2SettlementInfo & { readonly meta: TokenStandardV2Metadata };
  readonly transferLegs: ReadonlyArray<TokenStandardV2TransferLeg & { readonly meta: TokenStandardV2Metadata }>;
  readonly allocations: ReadonlyArray<{
    readonly allocationCid: string;
    readonly extraTransferLegSides: ReadonlyArray<
      TokenStandardV2TransferLegSide & { readonly meta: TokenStandardV2Metadata }
    >;
    readonly nextIterationFunding: Readonly<Record<string, string>> | null;
  }>;
  readonly actors: readonly string[];
  readonly extraArgs: TokenStandardV2SettlementExtraArgs;
}

export interface BuildTokenStandardV2SettlementChoiceArgumentParams {
  readonly settlement: TokenStandardV2SettlementInfo;
  readonly transferLegs: readonly TokenStandardV2TransferLeg[];
  readonly allocations: readonly TokenStandardV2FinalizedAllocation[];
  readonly actors: readonly string[];
  readonly extraArgs?: TokenStandardV2SettlementExtraArgs;
}

export interface BuildTokenStandardV2SettlementCommandParams extends BuildTokenStandardV2SettlementChoiceArgumentParams {
  readonly settlementFactoryContractId: string;
}

export interface TokenStandardV2SettlementRegistryClient {
  getSettlementFactoryFromRegistry(params: GetSettlementFactoryFromRegistryParams): Promise<unknown>;
}

export interface PrepareTokenStandardV2SettlementCommandParams extends Omit<
  BuildTokenStandardV2SettlementChoiceArgumentParams,
  'extraArgs'
> {
  readonly registryUrl: string;
  readonly scan: TokenStandardV2SettlementRegistryClient;
  readonly metadata?: TokenStandardV2Metadata;
  readonly excludeDebugFields?: boolean;
}

export interface PreparedTokenStandardV2SettlementCommand {
  readonly command: Command;
  readonly settlementFactoryContractId: string;
  readonly disclosedContracts: readonly DisclosedContract[];
  readonly choiceArgument: TokenStandardV2SettlementChoiceArgument;
}

function inputInvalid(message: string, context: ErrorContext): never {
  throw new TokenStandardV2SettlementFactoryError(
    TokenStandardV2SettlementFactoryErrorCode.INPUT_INVALID,
    message,
    context
  );
}

function factoryResponseInvalid(message: string, context: ErrorContext): never {
  throw new TokenStandardV2SettlementFactoryError(
    TokenStandardV2SettlementFactoryErrorCode.FACTORY_RESPONSE_INVALID,
    message,
    context
  );
}

type InvalidValueHandler = (message: string, context: ErrorContext) => never;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function createSafeRecord<T>(entries: Iterable<readonly [string, T]>): Readonly<Record<string, T>> {
  const result = Object.create(null) as Record<string, T>;
  for (const [key, value] of entries) {
    Object.defineProperty(result, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: false,
    });
  }
  return result;
}

function requireTrimmedNonEmpty(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    inputInvalid(`${field} must be a non-empty string.`, { field, value });
  }
  return value.trim();
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    inputInvalid(`${field} must be a string.`, { field, value });
  }
  return value;
}

function parseDecimalText(value: unknown, field: string): { readonly text: string; readonly sign: -1 | 0 | 1 } {
  const text = requireText(value, field);
  const match = DAML_DECIMAL_PATTERN.exec(text);
  if (match?.[0] !== text) {
    inputInvalid(`${field} must be a valid Daml Decimal string.`, { field, value });
  }
  const digits = `${match[2]}${match[3] ?? ''}`;
  const sign = ZERO_DIGITS_PATTERN.test(digits) ? 0 : match[1] === '-' ? -1 : 1;
  return { text, sign };
}

function normalizePositiveDecimal(value: unknown, field: string): string {
  const decimal = parseDecimalText(value, field);
  if (decimal.sign !== 1) {
    inputInvalid(`${field} must be positive.`, { field, value });
  }
  return decimal.text;
}

function normalizeNullableParty(value: unknown, field: string): string | null {
  if (value === null) return null;
  return requireTrimmedNonEmpty(value, field);
}

function normalizeParties(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    inputInvalid(`${field} must contain at least one value.`, { field, value });
  }
  return value.map((item, index) => requireTrimmedNonEmpty(item, `${field}[${index}]`));
}

function normalizeMetadata(value: unknown, field: string): TokenStandardV2Metadata {
  if (!isPlainRecord(value) || !isPlainRecord(value['values'])) {
    inputInvalid(`${field} must contain a values record.`, { field, value });
  }
  if (Object.getOwnPropertySymbols(value['values']).length > 0) {
    inputInvalid(`${field}.values must contain only string keys.`, { field, value });
  }
  const entries = Object.entries(value['values']).map(([key, metadataValue]) => {
    if (typeof metadataValue !== 'string') {
      inputInvalid(`${field}.values must contain only strings.`, { field, key, value: metadataValue });
    }
    return [key, metadataValue] as const;
  });
  return { values: createSafeRecord(entries) };
}

function normalizeOptionalMetadata(value: unknown, field: string): TokenStandardV2Metadata {
  return value === undefined ? { values: createSafeRecord<string>([]) } : normalizeMetadata(value, field);
}

function cloneChoiceContextValue(value: unknown, field: string, invalid: InvalidValueHandler): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid(`${field} must contain only JSON-compatible values.`, { field, value });
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => cloneChoiceContextValue(item, `${field}[${index}]`, invalid));
  }
  if (!isPlainRecord(value) || Object.getOwnPropertySymbols(value).length > 0) {
    invalid(`${field} must contain only JSON-compatible values.`, { field, value });
  }
  return createSafeRecord(
    Object.entries(value).map(
      ([key, item]) => [key, cloneChoiceContextValue(item, `${field}.${key}`, invalid)] as const
    )
  );
}

function normalizeChoiceContext(
  value: unknown,
  field: string,
  invalid: InvalidValueHandler
): TokenStandardV2SettlementChoiceContext {
  if (!isPlainRecord(value)) {
    invalid(`${field} must be a ChoiceContext record.`, { field, value });
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 1 || keys[0] !== 'values' || !isPlainRecord(value['values'])) {
    invalid(`${field} must have exactly the shape { values: Record<string, unknown> }.`, { field, value });
  }
  if (Object.getOwnPropertySymbols(value['values']).length > 0) {
    invalid(`${field}.values must contain only string keys.`, { field, value });
  }
  return {
    values: createSafeRecord(
      Object.entries(value['values']).map(
        ([key, item]) => [key, cloneChoiceContextValue(item, `${field}.values.${key}`, invalid)] as const
      )
    ),
  };
}

function normalizeAccount(value: unknown, field: string): TokenStandardV2Account {
  if (!isRecord(value)) {
    inputInvalid(`${field} must be an account record.`, { field, value });
  }
  const owner = normalizeNullableParty(value['owner'], `${field}.owner`);
  const provider = normalizeNullableParty(value['provider'], `${field}.provider`);
  return {
    owner,
    provider,
    id: requireText(value['id'], `${field}.id`),
  };
}

function normalizeSettlementInfo(value: unknown): TokenStandardV2SettlementChoiceArgument['settlement'] {
  if (!isRecord(value)) {
    inputInvalid('settlement must be a record.', { field: 'settlement', value });
  }
  return {
    executors: normalizeParties(value['executors'], 'settlement.executors'),
    id: requireText(value['id'], 'settlement.id'),
    cid: value['cid'] === null ? null : requireTrimmedNonEmpty(value['cid'], 'settlement.cid'),
    meta: normalizeOptionalMetadata(value['meta'], 'settlement.meta'),
  };
}

function normalizeTransferLeg(
  value: unknown,
  index: number
): TokenStandardV2SettlementChoiceArgument['transferLegs'][number] {
  const field = `transferLegs[${index}]`;
  if (!isRecord(value)) {
    inputInvalid(`${field} must be a record.`, { field, value });
  }
  return {
    transferLegId: requireText(value['transferLegId'], `${field}.transferLegId`),
    sender: normalizeAccount(value['sender'], `${field}.sender`),
    receiver: normalizeAccount(value['receiver'], `${field}.receiver`),
    amount: normalizePositiveDecimal(value['amount'], `${field}.amount`),
    instrumentId: requireText(value['instrumentId'], `${field}.instrumentId`),
    meta: normalizeOptionalMetadata(value['meta'], `${field}.meta`),
  };
}

function normalizeTransferLegSide(
  value: unknown,
  field: string
): TokenStandardV2SettlementChoiceArgument['allocations'][number]['extraTransferLegSides'][number] {
  if (!isRecord(value)) {
    inputInvalid(`${field} must be a record.`, { field, value });
  }
  const { side } = value;
  if (side !== 'SenderSide' && side !== 'ReceiverSide') {
    inputInvalid(`${field}.side must be SenderSide or ReceiverSide.`, { field: `${field}.side`, value: side });
  }
  return {
    transferLegId: requireText(value['transferLegId'], `${field}.transferLegId`),
    side,
    otherside: normalizeAccount(value['otherside'], `${field}.otherside`),
    amount: normalizePositiveDecimal(value['amount'], `${field}.amount`),
    instrumentId: requireText(value['instrumentId'], `${field}.instrumentId`),
    meta: normalizeOptionalMetadata(value['meta'], `${field}.meta`),
  };
}

function normalizeFunding(value: unknown, field: string): Readonly<Record<string, string>> | null {
  if (value === undefined || value === null) return null;
  if (!isPlainRecord(value)) {
    inputInvalid(`${field} must be a record or null.`, { field, value });
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    inputInvalid(`${field} must contain only string keys.`, { field, value });
  }
  const entries = Object.entries(value).map(
    ([instrumentId, amount]) => [instrumentId, normalizePositiveDecimal(amount, `${field}.${instrumentId}`)] as const
  );
  return createSafeRecord(entries);
}

function normalizeFinalizedAllocation(
  value: unknown,
  index: number
): TokenStandardV2SettlementChoiceArgument['allocations'][number] {
  const field = `allocations[${index}]`;
  if (!isRecord(value)) {
    inputInvalid(`${field} must be a record.`, { field, value });
  }
  const { extraTransferLegSides } = value;
  if (extraTransferLegSides !== undefined && !Array.isArray(extraTransferLegSides)) {
    inputInvalid(`${field}.extraTransferLegSides must be an array.`, {
      field: `${field}.extraTransferLegSides`,
      value: extraTransferLegSides,
    });
  }
  return {
    allocationCid: requireTrimmedNonEmpty(value['allocationCid'], `${field}.allocationCid`),
    extraTransferLegSides: (extraTransferLegSides ?? []).map((item, sideIndex) =>
      normalizeTransferLegSide(item, `${field}.extraTransferLegSides[${sideIndex}]`)
    ),
    nextIterationFunding: normalizeFunding(value['nextIterationFunding'], `${field}.nextIterationFunding`),
  };
}

function normalizeExtraArgs(value: unknown): TokenStandardV2SettlementExtraArgs {
  if (value === undefined) return emptyTokenStandardV2ExtraArgs();
  if (!isRecord(value)) {
    inputInvalid('extraArgs must be a record.', { field: 'extraArgs', value });
  }
  return {
    context: normalizeChoiceContext(value['context'], 'extraArgs.context', inputInvalid),
    meta: normalizeMetadata(value['meta'], 'extraArgs.meta'),
  };
}

function emptyTokenStandardV2ExtraArgs(): TokenStandardV2SettlementExtraArgs {
  return {
    context: { values: createSafeRecord<unknown>([]) },
    meta: { values: createSafeRecord<string>([]) },
  };
}

function normalizeRegistryUrl(value: unknown): string {
  const registryUrl = requireTrimmedNonEmpty(value, 'registryUrl');
  try {
    const url = new URL(registryUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('unsupported protocol');
  } catch {
    inputInvalid('registryUrl must be an absolute http or https URL.', { field: 'registryUrl', value });
  }
  return registryUrl;
}

export function buildTokenStandardV2SettlementChoiceArgument(
  params: BuildTokenStandardV2SettlementChoiceArgumentParams
): TokenStandardV2SettlementChoiceArgument {
  if (!isRecord(params)) {
    inputInvalid('params must be a record.', { field: 'params', value: params });
  }
  if (!Array.isArray(params.transferLegs) || params.transferLegs.length === 0) {
    inputInvalid('transferLegs must contain at least one transfer leg.', {
      field: 'transferLegs',
      value: params.transferLegs,
    });
  }
  if (!Array.isArray(params.allocations) || params.allocations.length === 0) {
    inputInvalid('allocations must contain at least one finalized allocation.', {
      field: 'allocations',
      value: params.allocations,
    });
  }
  const transferLegs = params.transferLegs.map(normalizeTransferLeg);
  const transferLegIdIndexes = new Map<string, number>();
  for (const [index, transferLeg] of transferLegs.entries()) {
    const firstIndex = transferLegIdIndexes.get(transferLeg.transferLegId);
    if (firstIndex !== undefined) {
      inputInvalid('transferLegs must have unique transferLegId values.', {
        field: `transferLegs[${index}].transferLegId`,
        transferLegId: transferLeg.transferLegId,
        firstIndex,
      });
    }
    transferLegIdIndexes.set(transferLeg.transferLegId, index);
  }
  return {
    settlement: normalizeSettlementInfo(params.settlement),
    transferLegs,
    allocations: params.allocations.map(normalizeFinalizedAllocation),
    actors: normalizeParties(params.actors, 'actors'),
    extraArgs: normalizeExtraArgs(params.extraArgs),
  };
}

function buildTokenStandardV2SettlementCommandFromChoiceArgument(params: {
  readonly settlementFactoryContractId: string;
  readonly choiceArgument: TokenStandardV2SettlementChoiceArgument;
}): Command {
  return {
    ExerciseCommand: {
      templateId: TOKEN_STANDARD_V2_SETTLEMENT_FACTORY_INTERFACE_ID,
      contractId: requireTrimmedNonEmpty(params.settlementFactoryContractId, 'settlementFactoryContractId'),
      choice: TOKEN_STANDARD_V2_SETTLEMENT_FACTORY_SETTLE_BATCH_CHOICE,
      choiceArgument: params.choiceArgument as unknown as ExerciseCommand['ExerciseCommand']['choiceArgument'],
    },
  };
}

export function buildTokenStandardV2SettlementCommand(params: BuildTokenStandardV2SettlementCommandParams): Command {
  return buildTokenStandardV2SettlementCommandFromChoiceArgument({
    settlementFactoryContractId: params.settlementFactoryContractId,
    choiceArgument: buildTokenStandardV2SettlementChoiceArgument(params),
  });
}

function readResponseTrimmedNonEmpty(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    factoryResponseInvalid(`Settlement-factory registry response has an invalid ${field}.`, { field, value });
  }
  return value.trim();
}

function parseDisclosedContract(value: unknown, index: number): DisclosedContract {
  if (!isRecord(value)) {
    factoryResponseInvalid('Settlement-factory registry returned a malformed disclosed contract.', { index, value });
  }
  return {
    templateId: readResponseTrimmedNonEmpty(value['templateId'], `disclosedContracts[${index}].templateId`),
    contractId: readResponseTrimmedNonEmpty(value['contractId'], `disclosedContracts[${index}].contractId`),
    createdEventBlob: readResponseTrimmedNonEmpty(
      value['createdEventBlob'],
      `disclosedContracts[${index}].createdEventBlob`
    ),
    synchronizerId: readResponseTrimmedNonEmpty(value['synchronizerId'], `disclosedContracts[${index}].synchronizerId`),
  };
}

function parseSettlementFactoryResponse(value: unknown): {
  readonly factoryId: string;
  readonly choiceContextData: TokenStandardV2SettlementChoiceContext;
  readonly disclosedContracts: readonly DisclosedContract[];
} {
  if (!isRecord(value)) {
    factoryResponseInvalid('Settlement-factory registry returned an invalid factory choice context.', { value });
  }
  const { choiceContext } = value;
  if (!isRecord(choiceContext)) {
    factoryResponseInvalid('Settlement-factory registry returned an invalid factory choice context.', { value });
  }
  const { choiceContextData, disclosedContracts } = choiceContext;
  if (!Array.isArray(disclosedContracts)) {
    factoryResponseInvalid('Settlement-factory registry returned an invalid factory choice context.', { value });
  }
  return {
    factoryId: readResponseTrimmedNonEmpty(value['factoryId'], 'factoryId'),
    choiceContextData: normalizeChoiceContext(
      choiceContextData,
      'choiceContext.choiceContextData',
      factoryResponseInvalid
    ),
    disclosedContracts: disclosedContracts.map(parseDisclosedContract),
  };
}

export async function prepareTokenStandardV2SettlementCommand(
  params: PrepareTokenStandardV2SettlementCommandParams
): Promise<PreparedTokenStandardV2SettlementCommand> {
  if (!isRecord(params)) {
    inputInvalid('params must be a record.', { field: 'params', value: params });
  }
  if (!isRecord(params.scan) || typeof params.scan.getSettlementFactoryFromRegistry !== 'function') {
    inputInvalid('scan must provide getSettlementFactoryFromRegistry.', { field: 'scan' });
  }
  if (Object.prototype.hasOwnProperty.call(params, 'extraArgs')) {
    inputInvalid('prepare does not accept extraArgs; use metadata for caller-supplied metadata.', {
      field: 'extraArgs',
    });
  }
  const registryUrl = normalizeRegistryUrl(params.registryUrl);
  const metadata = normalizeOptionalMetadata(params.metadata, 'metadata');
  const lookupChoiceArgument = buildTokenStandardV2SettlementChoiceArgument({
    settlement: params.settlement,
    transferLegs: params.transferLegs,
    allocations: params.allocations,
    actors: params.actors,
    extraArgs: emptyTokenStandardV2ExtraArgs(),
  });
  const request: GetSettlementFactoryFromRegistryParams = {
    registryUrl,
    choiceArguments: lookupChoiceArgument as unknown as GetSettlementFactoryFromRegistryParams['choiceArguments'],
    excludeDebugFields: params.excludeDebugFields ?? true,
  };
  const factory = parseSettlementFactoryResponse(await params.scan.getSettlementFactoryFromRegistry(request));
  const choiceArgument: TokenStandardV2SettlementChoiceArgument = {
    ...lookupChoiceArgument,
    extraArgs: {
      context: factory.choiceContextData,
      meta: metadata,
    },
  };
  return {
    settlementFactoryContractId: factory.factoryId,
    disclosedContracts: factory.disclosedContracts,
    choiceArgument,
    command: buildTokenStandardV2SettlementCommandFromChoiceArgument({
      settlementFactoryContractId: factory.factoryId,
      choiceArgument,
    }),
  };
}
