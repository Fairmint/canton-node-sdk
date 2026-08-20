import type { GetActiveContractsParams } from '../../../clients/ledger-json-api/operations/v2/state/get-active-contracts';
import type { JsGetActiveContractsResponse } from '../../../clients/ledger-json-api/schemas';
import { CantonError, type ErrorContext } from '../../../core/errors';
import { isNonEmptyString, isRecord } from '../../../core/utils';
import { isJsActiveContractItem, type JsActiveContractItem } from '../../contracts';
import { TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID } from './constants';
import type { TokenStandardV1InstrumentId, TokenStandardV1Metadata } from './transfer-factory';

export const TOKEN_STANDARD_V1_AMOUNT_DECIMALS = 10;

const ISO_8601_TIMESTAMP_PATTERN =
  /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const SIGNED_INTEGER_PATTERN = /^-?\d+$/;
const DECIMAL_AMOUNT_PATTERN = /^(\d+)(?:\.(\d+))?$/;
const TRAILING_ZEROS_PATTERN = /0+$/;
const NON_NEGATIVE_INTEGER_PATTERN = /^\d+$/;

export const TokenStandardV1HoldingErrorCode = {
  INPUT_INVALID: 'TOKEN_STANDARD_V1_HOLDING_INPUT_INVALID',
  INTERFACE_VIEW_INVALID: 'TOKEN_STANDARD_V1_HOLDING_INTERFACE_VIEW_INVALID',
  BALANCE_INSUFFICIENT: 'TOKEN_STANDARD_V1_HOLDING_BALANCE_INSUFFICIENT',
} as const;

export type TokenStandardV1HoldingErrorCode =
  (typeof TokenStandardV1HoldingErrorCode)[keyof typeof TokenStandardV1HoldingErrorCode];

export class TokenStandardV1HoldingError extends CantonError {
  public override readonly name: string;

  public constructor(code: TokenStandardV1HoldingErrorCode, message: string, context?: ErrorContext) {
    super(message, code, context);
    this.name = 'TokenStandardV1HoldingError';
  }
}

export interface TokenStandardV1HoldingActiveContractsClient {
  getActiveContracts(params: GetActiveContractsParams): Promise<JsGetActiveContractsResponse>;
}

export interface TokenStandardV1Lock {
  readonly holders: readonly string[];
  readonly expiresAt: string | null;
  /** Duration from the holding's createdAt ledger time after which the lock expires. */
  readonly expiresAfter: { readonly microseconds: string } | null;
  readonly context: string | null;
}

export interface TokenStandardV1Holding {
  readonly contractId: string;
  readonly templateId: string;
  readonly synchronizerId: string;
  /** ISO 8601 ledger effective time at which the active holding was created. */
  readonly createdAt: string;
  readonly owner: string;
  readonly instrumentId: TokenStandardV1InstrumentId;
  readonly amount: string;
  readonly amountBaseUnits: string;
  readonly lock: TokenStandardV1Lock | null;
  readonly meta: TokenStandardV1Metadata;
}

export interface ListTokenStandardV1HoldingsParams {
  readonly ledger: TokenStandardV1HoldingActiveContractsClient;
  readonly parties: readonly string[];
  readonly owner: string;
  readonly instrumentId: TokenStandardV1InstrumentId;
  readonly instrumentDecimals: number;
  readonly synchronizerId?: string;
  readonly activeAtOffset?: number;
  readonly holdingInterfaceId?: string;
}

export interface SelectTokenStandardV1HoldingsParams extends Omit<
  ListTokenStandardV1HoldingsParams,
  'synchronizerId' | 'activeAtOffset'
> {
  readonly synchronizerId: string;
  /** ACS snapshot offset. Requiring it keeps selection to one Canton network read. */
  readonly activeAtOffset: number;
  readonly amountBaseUnits: string;
  /**
   * Token-specific spendability policy. Use holding.createdAt with lock.expiresAfter to derive a relative lock's
   * absolute expiry. Defaults to holdings whose HoldingV1 lock is None.
   */
  readonly isSpendable?: (holding: TokenStandardV1Holding) => boolean;
}

export interface SelectedTokenStandardV1Holdings {
  readonly holdings: readonly TokenStandardV1Holding[];
  readonly contractIds: readonly string[];
  readonly totalBaseUnits: string;
}

function inputInvalid(message: string, context: ErrorContext): never {
  throw new TokenStandardV1HoldingError(TokenStandardV1HoldingErrorCode.INPUT_INVALID, message, context);
}

function interfaceViewInvalid(message: string, context: ErrorContext): never {
  throw new TokenStandardV1HoldingError(TokenStandardV1HoldingErrorCode.INTERFACE_VIEW_INVALID, message, context);
}

function normalizeRequiredString(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    inputInvalid(`${field} must be a non-empty string.`, { field });
  }
  return value.trim();
}

function normalizeParties(parties: readonly string[]): string[] {
  if (!Array.isArray(parties)) {
    inputInvalid('parties must be an array of explicit read parties.', {
      field: 'parties',
    });
  }
  const normalized = new Set<string>();
  for (const [index, party] of parties.entries()) {
    if (typeof party !== 'string') {
      inputInvalid('parties must contain only strings.', {
        field: 'parties',
        index,
      });
    }
    if (party.trim().length > 0) normalized.add(party.trim());
  }
  if (normalized.size === 0) {
    inputInvalid('parties must contain at least one read party.', {
      field: 'parties',
    });
  }
  return [...normalized];
}

function normalizeInstrumentDecimals(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > TOKEN_STANDARD_V1_AMOUNT_DECIMALS) {
    inputInvalid(`instrumentDecimals must be a safe integer between 0 and ${TOKEN_STANDARD_V1_AMOUNT_DECIMALS}.`, {
      field: 'instrumentDecimals',
      instrumentDecimals: value,
    });
  }
  return value;
}

function normalizeActiveAtOffset(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    inputInvalid('activeAtOffset must be a non-negative safe integer.', {
      field: 'activeAtOffset',
      activeAtOffset: value,
    });
  }
  return value;
}

function normalizeRequiredActiveAtOffset(value: unknown): number {
  if (value === undefined) {
    inputInvalid('activeAtOffset is required for Token Standard V1 holding selection.', {
      field: 'activeAtOffset',
    });
  }
  if (typeof value !== 'number') {
    inputInvalid('activeAtOffset must be a non-negative safe integer.', {
      field: 'activeAtOffset',
      activeAtOffset: value,
    });
  }
  return normalizeActiveAtOffset(value);
}

function validateOwner(owner: string): void {
  if (!isNonEmptyString(owner)) {
    inputInvalid('owner must be a non-empty party.', { field: 'owner' });
  }
}

function validateInstrumentId(instrumentId: TokenStandardV1InstrumentId): void {
  if (!isRecord(instrumentId) || !isNonEmptyString(instrumentId.admin) || !isNonEmptyString(instrumentId.id)) {
    inputInvalid('instrumentId must be a valid Token Standard V1 InstrumentId.', { field: 'instrumentId' });
  }
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return isNonEmptyString(value) ? value : undefined;
}

function readCreatedAt(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = ISO_8601_TIMESTAMP_PATTERN.exec(value);
  if (!match || Number.isNaN(Date.parse(value))) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = month === 2 ? (isLeapYear ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return day <= daysInMonth ? value : undefined;
}

function requireCreatedAt(value: unknown, context: ErrorContext): string {
  const createdAt = readCreatedAt(value);
  if (createdAt === undefined) {
    interfaceViewInvalid('Active Holding contract is missing a valid createdAt ledger timestamp.', {
      ...context,
      createdAt: value,
    });
  }
  return createdAt;
}

function readRawActiveContract(item: unknown): Readonly<Record<string, unknown>> | undefined {
  if (!isRecord(item)) return undefined;
  const { contractEntry } = item;
  if (!isRecord(contractEntry)) return undefined;
  const activeContract = contractEntry['JsActiveContract'];
  return isRecord(activeContract) ? activeContract : undefined;
}

function readInstrumentId(value: unknown): TokenStandardV1InstrumentId | undefined {
  if (!isRecord(value)) return undefined;
  const admin = isNonEmptyString(value['admin']) ? value['admin'] : undefined;
  const id = isNonEmptyString(value['id']) ? value['id'] : undefined;
  return admin && id ? { admin, id } : undefined;
}

function readMetadata(value: unknown): TokenStandardV1Metadata | undefined {
  if (!isRecord(value) || !isRecord(value['values'])) return undefined;
  const values = Object.create(null) as Record<string, string>;
  for (const [key, metadataValue] of Object.entries(value['values'])) {
    if (typeof metadataValue !== 'string') return undefined;
    Object.defineProperty(values, key, {
      value: metadataValue,
      enumerable: true,
      configurable: true,
      writable: false,
    });
  }
  return { values };
}

function readLock(value: unknown): TokenStandardV1Lock | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !Array.isArray(value['holders'])) return undefined;
  const { holders } = value;
  if (!holders.every(isNonEmptyString)) return undefined;

  const expiresAt = readNullableString(value['expiresAt']);
  const context = readNullableString(value['context']);
  const rawExpiresAfter = value['expiresAfter'];
  let expiresAfter: TokenStandardV1Lock['expiresAfter'];
  if (rawExpiresAfter === null) {
    expiresAfter = null;
  } else if (
    isRecord(rawExpiresAfter) &&
    typeof rawExpiresAfter['microseconds'] === 'string' &&
    SIGNED_INTEGER_PATTERN.test(rawExpiresAfter['microseconds'])
  ) {
    expiresAfter = { microseconds: rawExpiresAfter['microseconds'] };
  } else {
    return undefined;
  }
  if (expiresAt === undefined || context === undefined) return undefined;
  return { holders, expiresAt, expiresAfter, context };
}

function instrumentIdsEqual(left: TokenStandardV1InstrumentId, right: TokenStandardV1InstrumentId): boolean {
  return left.admin === right.admin && left.id === right.id;
}

function locksEqual(left: TokenStandardV1Lock | null, right: TokenStandardV1Lock | null): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.expiresAt === right.expiresAt &&
    left.expiresAfter?.microseconds === right.expiresAfter?.microseconds &&
    left.context === right.context &&
    left.holders.length === right.holders.length &&
    left.holders.every((holder, index) => holder === right.holders[index])
  );
}

function metadataEqual(left: TokenStandardV1Metadata, right: TokenStandardV1Metadata): boolean {
  const leftEntries = Object.entries(left.values);
  return (
    leftEntries.length === Object.keys(right.values).length &&
    leftEntries.every(([key, value]) => right.values[key] === value)
  );
}

function identifierModuleEntitySuffix(identifier: string): string | undefined {
  const separator = identifier.indexOf(':');
  return separator === -1 ? undefined : identifier.slice(separator + 1);
}

function interfaceIdsMatch(left: string, right: string): boolean {
  return identifierModuleEntitySuffix(left) === identifierModuleEntitySuffix(right);
}

function failedInterfaceView(params: {
  readonly itemIndex: number;
  readonly contractId: unknown;
  readonly interfaceId: unknown;
  readonly statusCode: number;
  readonly statusMessage: unknown;
}): never {
  interfaceViewInvalid('HoldingV1 interface view request failed.', {
    itemIndex: params.itemIndex,
    contractId: params.contractId,
    interfaceId: params.interfaceId,
    viewStatusCode: params.statusCode,
    viewStatusMessage: params.statusMessage,
  });
}

function decimalAmountToBaseUnits(amount: string, decimals: number): string {
  const match = DECIMAL_AMOUNT_PATTERN.exec(amount.trim());
  if (!match) throw new Error('amount must be a non-negative decimal');

  const whole = match[1] ?? '0';
  const fractional = (match[2] ?? '').replace(TRAILING_ZEROS_PATTERN, '');
  if (fractional.length > decimals) {
    throw new Error(`amount exceeds ${decimals} decimal places`);
  }
  const scale = 10n ** BigInt(decimals);
  return (BigInt(whole) * scale + BigInt(fractional.padEnd(decimals, '0') || '0')).toString();
}

function normalizeBaseUnitAmount(value: string): string {
  if (typeof value !== 'string' || !NON_NEGATIVE_INTEGER_PATTERN.test(value.trim())) {
    inputInvalid('amountBaseUnits must be a non-negative integer string.', {
      field: 'amountBaseUnits',
    });
  }
  return BigInt(value.trim()).toString();
}

function readHolding(params: {
  readonly item: JsActiveContractItem;
  readonly itemIndex: number;
  readonly holdingInterfaceId: string;
  readonly owner: string;
  readonly instrumentId: TokenStandardV1InstrumentId;
  readonly instrumentDecimals: number;
  readonly synchronizerId?: string;
}): TokenStandardV1Holding | undefined {
  const activeContract = params.item.contractEntry.JsActiveContract;
  if (params.synchronizerId !== undefined && activeContract.synchronizerId !== params.synchronizerId) {
    return undefined;
  }

  const { createdEvent } = activeContract;
  const matchingViews = createdEvent.interfaceViews.filter((view) =>
    interfaceIdsMatch(view.interfaceId, params.holdingInterfaceId)
  );
  if (matchingViews.length !== 1) {
    interfaceViewInvalid('Active Holding contract must contain exactly one HoldingV1 interface view.', {
      itemIndex: params.itemIndex,
      contractId: createdEvent.contractId,
      matchingViewCount: matchingViews.length,
    });
  }

  const interfaceView = matchingViews[0];
  if (!interfaceView) {
    interfaceViewInvalid('HoldingV1 interface view is missing.', {
      itemIndex: params.itemIndex,
      contractId: createdEvent.contractId,
    });
  }
  const viewValue = isRecord(interfaceView.viewValue) ? interfaceView.viewValue : undefined;
  const owner = viewValue && isNonEmptyString(viewValue['owner']) ? viewValue['owner'] : undefined;
  const instrumentId = viewValue ? readInstrumentId(viewValue['instrumentId']) : undefined;
  if ((owner && owner !== params.owner) || (instrumentId && !instrumentIdsEqual(instrumentId, params.instrumentId))) {
    return undefined;
  }

  if (interfaceView.viewStatus.code !== 0) {
    failedInterfaceView({
      itemIndex: params.itemIndex,
      contractId: createdEvent.contractId,
      interfaceId: interfaceView.interfaceId,
      statusCode: interfaceView.viewStatus.code,
      statusMessage: interfaceView.viewStatus.message,
    });
  }
  if (!viewValue) {
    interfaceViewInvalid('HoldingV1 interface view is missing viewValue.', {
      itemIndex: params.itemIndex,
      contractId: createdEvent.contractId,
    });
  }

  if (!owner || !instrumentId) {
    interfaceViewInvalid('HoldingV1 interface view is missing a valid owner or instrumentId.', {
      itemIndex: params.itemIndex,
      contractId: createdEvent.contractId,
    });
  }
  const createdAt = requireCreatedAt(createdEvent.createdAt, {
    itemIndex: params.itemIndex,
    contractId: createdEvent.contractId,
  });

  const lock = readLock(viewValue['lock']);
  const meta = readMetadata(viewValue['meta']);
  if (lock === undefined || !meta) {
    interfaceViewInvalid('HoldingV1 interface view has an invalid lock or metadata value.', {
      itemIndex: params.itemIndex,
      contractId: createdEvent.contractId,
    });
  }

  const { amount } = viewValue;
  if (!isNonEmptyString(amount)) {
    interfaceViewInvalid('HoldingV1 interface view is missing amount.', {
      itemIndex: params.itemIndex,
      contractId: createdEvent.contractId,
    });
  }
  let amountBaseUnits: string;
  try {
    amountBaseUnits = decimalAmountToBaseUnits(amount, params.instrumentDecimals);
  } catch {
    interfaceViewInvalid('HoldingV1 amount is invalid for the configured instrument decimals.', {
      itemIndex: params.itemIndex,
      contractId: createdEvent.contractId,
      amount,
      instrumentDecimals: params.instrumentDecimals,
    });
  }

  return {
    contractId: createdEvent.contractId,
    templateId: createdEvent.templateId,
    synchronizerId: activeContract.synchronizerId,
    createdAt,
    owner,
    instrumentId,
    amount,
    amountBaseUnits,
    lock,
    meta,
  };
}

export async function listTokenStandardV1Holdings(
  params: ListTokenStandardV1HoldingsParams
): Promise<readonly TokenStandardV1Holding[]> {
  if (!isRecord(params.ledger) || typeof params.ledger.getActiveContracts !== 'function') {
    inputInvalid('ledger must provide getActiveContracts.', { field: 'ledger' });
  }
  validateOwner(params.owner);
  validateInstrumentId(params.instrumentId);
  const parties = normalizeParties(params.parties);
  const instrumentDecimals = normalizeInstrumentDecimals(params.instrumentDecimals);
  const holdingInterfaceId = normalizeRequiredString(
    params.holdingInterfaceId ?? TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID,
    'holdingInterfaceId'
  );
  const synchronizerId =
    params.synchronizerId === undefined ? undefined : normalizeRequiredString(params.synchronizerId, 'synchronizerId');
  const activeAtOffset =
    params.activeAtOffset === undefined ? undefined : normalizeActiveAtOffset(params.activeAtOffset);
  const response = await params.ledger.getActiveContracts({
    parties,
    interfaceIds: [holdingInterfaceId],
    includeInterfaceView: true,
    includeCreatedEventBlob: false,
    ...(activeAtOffset === undefined ? {} : { activeAtOffset }),
  });

  const holdings = new Map<string, TokenStandardV1Holding>();
  for (const [itemIndex, item] of response.entries()) {
    if (!isJsActiveContractItem(item)) {
      const activeContract = readRawActiveContract(item);
      if (activeContract && (synchronizerId === undefined || activeContract['synchronizerId'] === synchronizerId)) {
        const { createdEvent } = activeContract;
        requireCreatedAt(isRecord(createdEvent) ? createdEvent['createdAt'] : undefined, {
          itemIndex,
          contractId: isRecord(createdEvent) ? createdEvent['contractId'] : undefined,
        });
      }
      continue;
    }
    const holding = readHolding({
      item,
      itemIndex,
      holdingInterfaceId,
      owner: params.owner,
      instrumentId: params.instrumentId,
      instrumentDecimals,
      ...(synchronizerId === undefined ? {} : { synchronizerId }),
    });
    if (!holding) continue;

    const existing = holdings.get(holding.contractId);
    if (
      existing &&
      (existing.templateId !== holding.templateId ||
        existing.synchronizerId !== holding.synchronizerId ||
        existing.createdAt !== holding.createdAt ||
        existing.owner !== holding.owner ||
        existing.amount !== holding.amount ||
        existing.amountBaseUnits !== holding.amountBaseUnits ||
        !locksEqual(existing.lock, holding.lock) ||
        !metadataEqual(existing.meta, holding.meta))
    ) {
      interfaceViewInvalid('Duplicate HoldingV1 contract rows contain inconsistent data.', {
        contractId: holding.contractId,
      });
    }
    if (!existing) holdings.set(holding.contractId, holding);
  }
  return [...holdings.values()];
}

export async function selectTokenStandardV1Holdings(
  params: SelectTokenStandardV1HoldingsParams
): Promise<SelectedTokenStandardV1Holdings> {
  const activeAtOffset = normalizeRequiredActiveAtOffset(params.activeAtOffset);
  const required = BigInt(normalizeBaseUnitAmount(params.amountBaseUnits));
  if (required <= 0n) {
    inputInvalid('amountBaseUnits must be positive.', {
      field: 'amountBaseUnits',
      amountBaseUnits: params.amountBaseUnits,
    });
  }

  const isSpendable = params.isSpendable ?? ((holding: TokenStandardV1Holding) => holding.lock === null);
  const holdings = [...(await listTokenStandardV1Holdings({ ...params, activeAtOffset }))]
    .filter((holding) => isSpendable(holding) && BigInt(holding.amountBaseUnits) > 0n)
    .sort((left, right) => {
      const difference = BigInt(right.amountBaseUnits) - BigInt(left.amountBaseUnits);
      if (difference !== 0n) return difference > 0n ? 1 : -1;
      return left.contractId.localeCompare(right.contractId);
    });

  const selected: TokenStandardV1Holding[] = [];
  let total = 0n;
  for (const holding of holdings) {
    selected.push(holding);
    total += BigInt(holding.amountBaseUnits);
    if (total >= required) break;
  }

  if (total < required) {
    throw new TokenStandardV1HoldingError(
      TokenStandardV1HoldingErrorCode.BALANCE_INSUFFICIENT,
      'Available spendable Token Standard V1 holdings do not cover the requested amount.',
      {
        requiredBaseUnits: required.toString(),
        availableBaseUnits: total.toString(),
        owner: params.owner,
        instrumentId: params.instrumentId,
      }
    );
  }

  return {
    holdings: selected,
    contractIds: selected.map((holding) => holding.contractId),
    totalBaseUnits: total.toString(),
  };
}
