import type { Command, ExerciseCommand } from '../../../clients/ledger-json-api/schemas';
import { CantonError, type ErrorContext } from '../../../core/errors';
import { isRecord } from '../../../core/utils';
import { TOKEN_STANDARD_V1_TRANSFER_FACTORY_INTERFACE_ID, TokenStandardV1Choice } from './constants';

const DAML_DECIMAL_PATTERN = /^(-?)(\d{1,28})(?:\.(\d{1,10}))?$/;
const ZERO_DIGITS_PATTERN = /^0+$/;

export const TokenStandardV1TransferFactoryErrorCode = {
  INPUT_INVALID: 'TOKEN_STANDARD_V1_TRANSFER_FACTORY_INPUT_INVALID',
} as const;

export type TokenStandardV1TransferFactoryErrorCode =
  (typeof TokenStandardV1TransferFactoryErrorCode)[keyof typeof TokenStandardV1TransferFactoryErrorCode];

export class TokenStandardV1TransferFactoryError extends CantonError {
  public override readonly name: string;

  public constructor(code: TokenStandardV1TransferFactoryErrorCode, message: string, context?: ErrorContext) {
    super(message, code, context);
    this.name = 'TokenStandardV1TransferFactoryError';
  }
}

export interface TokenStandardV1InstrumentId {
  readonly admin: string;
  readonly id: string;
}

export interface TokenStandardV1Metadata {
  readonly values: Readonly<Record<string, string>>;
}

export interface TokenStandardV1ChoiceContext {
  readonly values: Readonly<Record<string, unknown>>;
}

export interface TokenStandardV1ExtraArgs {
  readonly context: TokenStandardV1ChoiceContext;
  readonly meta: TokenStandardV1Metadata;
}

export interface TokenStandardV1Transfer {
  readonly sender: string;
  readonly receiver: string;
  readonly amount: string;
  readonly instrumentId: TokenStandardV1InstrumentId;
  readonly requestedAt: string;
  readonly executeBefore: string;
  readonly inputHoldingCids: readonly string[];
  readonly meta?: TokenStandardV1Metadata;
}

export interface TokenStandardV1TransferFactoryTransferArgument {
  readonly expectedAdmin: string;
  readonly transfer: Omit<TokenStandardV1Transfer, 'meta'> & { readonly meta: TokenStandardV1Metadata };
  readonly extraArgs: TokenStandardV1ExtraArgs;
}

export interface BuildTokenStandardV1TransferChoiceArgumentParams {
  readonly expectedAdmin: string;
  readonly transfer: TokenStandardV1Transfer;
  readonly extraArgs?: TokenStandardV1ExtraArgs;
}

export interface BuildTokenStandardV1TransferCommandParams extends BuildTokenStandardV1TransferChoiceArgumentParams {
  readonly transferFactoryContractId: string;
}

function inputInvalid(message: string, context: ErrorContext): never {
  throw new TokenStandardV1TransferFactoryError(
    TokenStandardV1TransferFactoryErrorCode.INPUT_INVALID,
    message,
    context
  );
}

function requireInputRecord(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    inputInvalid(`${field} must be an object.`, { field, value });
  }
}

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    inputInvalid(`${field} must be a string.`, { field, value });
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    inputInvalid(`${field} must be non-empty.`, { field, value });
  }
  return normalized;
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    inputInvalid(`${field} must be text.`, { field, value });
  }
  return value;
}

function copyStringRecord(value: unknown, field: string): Readonly<Record<string, string>> {
  if (!isRecord(value)) {
    inputInvalid(`${field} must be a string map.`, { field, value });
  }
  const result = Object.create(null) as Record<string, string>;
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') {
      inputInvalid(`${field}.${key} must be a string.`, { field: `${field}.${key}`, value: entry });
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

function normalizeMetadata(value: unknown, field: string): TokenStandardV1Metadata {
  if (!isRecord(value)) {
    inputInvalid(`${field} must be Token Standard metadata.`, { field, value });
  }
  return { values: copyStringRecord(value['values'], `${field}.values`) };
}

function normalizeMetadataOrDefault(value: unknown, field: string): TokenStandardV1Metadata {
  return value === undefined ? { values: copyStringRecord({}, `${field}.values`) } : normalizeMetadata(value, field);
}

function normalizeChoiceContext(value: unknown, field: string): TokenStandardV1ChoiceContext {
  if (!isRecord(value) || !isRecord(value['values'])) {
    inputInvalid(`${field} must be a Token Standard choice context.`, { field, value });
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

function parseDecimalText(value: unknown, field: string): { readonly text: string; readonly sign: -1 | 0 | 1 } {
  const text = requireNonEmpty(value, field);
  const match = DAML_DECIMAL_PATTERN.exec(text);
  if (!match) {
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

function normalizeInstrumentId(value: unknown, field: string): TokenStandardV1InstrumentId {
  requireInputRecord(value, field);
  return {
    admin: requireNonEmpty(value['admin'], `${field}.admin`),
    id: requireText(value['id'], `${field}.id`),
  };
}

function normalizeHoldingCids(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    inputInvalid(`${field} must be an array.`, { field, value });
  }
  return value.map((entry, index) => requireNonEmpty(entry, `${field}[${index}]`));
}

function emptyTokenStandardV1ExtraArgs(): TokenStandardV1ExtraArgs {
  return {
    context: { values: Object.create(null) as Record<string, unknown> },
    meta: { values: Object.create(null) as Record<string, string> },
  };
}

function normalizeExtraArgs(value: unknown): TokenStandardV1ExtraArgs {
  if (value === undefined) return emptyTokenStandardV1ExtraArgs();
  requireInputRecord(value, 'extraArgs');
  return {
    context: normalizeChoiceContext(value['context'], 'extraArgs.context'),
    meta: normalizeMetadata(value['meta'], 'extraArgs.meta'),
  };
}

export function buildTokenStandardV1TransferChoiceArgument(
  params: BuildTokenStandardV1TransferChoiceArgumentParams
): TokenStandardV1TransferFactoryTransferArgument {
  requireInputRecord(params, 'params');
  requireInputRecord(params.transfer, 'transfer');
  if (params.extraArgs !== undefined) requireInputRecord(params.extraArgs, 'extraArgs');
  if (params.transfer.meta !== undefined) requireInputRecord(params.transfer.meta, 'transfer.meta');
  return {
    expectedAdmin: requireNonEmpty(params.expectedAdmin, 'expectedAdmin'),
    transfer: {
      sender: requireNonEmpty(params.transfer.sender, 'transfer.sender'),
      receiver: requireNonEmpty(params.transfer.receiver, 'transfer.receiver'),
      amount: normalizePositiveDecimal(params.transfer.amount, 'transfer.amount'),
      instrumentId: normalizeInstrumentId(params.transfer.instrumentId, 'transfer.instrumentId'),
      requestedAt: requireNonEmpty(params.transfer.requestedAt, 'transfer.requestedAt'),
      executeBefore: requireNonEmpty(params.transfer.executeBefore, 'transfer.executeBefore'),
      inputHoldingCids: normalizeHoldingCids(params.transfer.inputHoldingCids, 'transfer.inputHoldingCids'),
      meta: normalizeMetadataOrDefault(params.transfer.meta, 'transfer.meta'),
    },
    extraArgs: normalizeExtraArgs(params.extraArgs),
  };
}

export function buildTokenStandardV1TransferCommand(params: BuildTokenStandardV1TransferCommandParams): Command {
  requireInputRecord(params, 'params');
  const choiceArgument = buildTokenStandardV1TransferChoiceArgument(params);
  return {
    ExerciseCommand: {
      templateId: TOKEN_STANDARD_V1_TRANSFER_FACTORY_INTERFACE_ID,
      contractId: requireNonEmpty(params.transferFactoryContractId, 'transferFactoryContractId'),
      choice: TokenStandardV1Choice.transfer,
      choiceArgument: choiceArgument as unknown as ExerciseCommand['ExerciseCommand']['choiceArgument'],
    },
  };
}
