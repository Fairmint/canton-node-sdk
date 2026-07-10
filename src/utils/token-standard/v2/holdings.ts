import type { GetActiveContractsParams } from '../../../clients/ledger-json-api/operations/v2/state/get-active-contracts';
import type { JsGetActiveContractsResponse } from '../../../clients/ledger-json-api/schemas';
import { CantonError, type ErrorContext } from '../../../core/errors';
import { isNonEmptyString, isRecord } from '../../../core/utils';
import { isJsActiveContractItem, type JsActiveContractItem } from '../../contracts';
import type { TokenStandardV2Account, TokenStandardV2InstrumentId, TokenStandardV2Metadata } from './types';

export const TOKEN_STANDARD_V2_HOLDING_INTERFACE_ID = '#splice-api-token-holding-v2:Splice.Api.Token.HoldingV2:Holding';
export const TOKEN_STANDARD_V2_AMOUNT_DECIMALS = 10;

export const TokenStandardV2HoldingErrorCode = {
  INPUT_INVALID: 'TOKEN_STANDARD_V2_HOLDING_INPUT_INVALID',
  INTERFACE_VIEW_INVALID: 'TOKEN_STANDARD_V2_HOLDING_INTERFACE_VIEW_INVALID',
  BALANCE_INSUFFICIENT: 'TOKEN_STANDARD_V2_HOLDING_BALANCE_INSUFFICIENT',
} as const;

export type TokenStandardV2HoldingErrorCode =
  (typeof TokenStandardV2HoldingErrorCode)[keyof typeof TokenStandardV2HoldingErrorCode];

export class TokenStandardV2HoldingError extends CantonError {
  public override readonly name = 'TokenStandardV2HoldingError';

  public constructor(code: TokenStandardV2HoldingErrorCode, message: string, context?: ErrorContext) {
    super(message, code, context);
  }
}

export interface TokenStandardV2HoldingActiveContractsClient {
  getActiveContracts(params: GetActiveContractsParams): Promise<JsGetActiveContractsResponse>;
}

export interface TokenStandardV2Lock {
  readonly holders: readonly string[];
  readonly expiresAt: string | null;
  readonly expiresAfter: { readonly microseconds: string } | null;
  readonly context: string | null;
}

export interface TokenStandardV2Holding {
  readonly contractId: string;
  readonly templateId: string;
  readonly synchronizerId: string;
  readonly account: TokenStandardV2Account;
  readonly instrumentId: TokenStandardV2InstrumentId;
  readonly amount: string;
  readonly amountBaseUnits: string;
  readonly lock: TokenStandardV2Lock | null;
  readonly meta: TokenStandardV2Metadata;
}

export interface ListTokenStandardV2HoldingsParams {
  readonly ledger: TokenStandardV2HoldingActiveContractsClient;
  readonly parties: readonly string[];
  readonly account: TokenStandardV2Account;
  readonly instrumentId: TokenStandardV2InstrumentId;
  readonly instrumentDecimals: number;
  readonly synchronizerId?: string;
  readonly activeAtOffset?: number;
  readonly holdingInterfaceId?: string;
}

export interface SelectTokenStandardV2HoldingsParams extends Omit<ListTokenStandardV2HoldingsParams, 'synchronizerId'> {
  readonly synchronizerId: string;
  readonly amountBaseUnits: string;
  /** Defaults to holdings whose HoldingV2 lock is None. */
  readonly isSpendable?: (holding: TokenStandardV2Holding) => boolean;
}

export interface SelectedTokenStandardV2Holdings {
  readonly holdings: readonly TokenStandardV2Holding[];
  readonly contractIds: readonly string[];
  readonly totalBaseUnits: string;
}

function inputInvalid(message: string, context: ErrorContext): never {
  throw new TokenStandardV2HoldingError(TokenStandardV2HoldingErrorCode.INPUT_INVALID, message, context);
}

function interfaceViewInvalid(message: string, context: ErrorContext): never {
  throw new TokenStandardV2HoldingError(TokenStandardV2HoldingErrorCode.INTERFACE_VIEW_INVALID, message, context);
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
  if (!Number.isSafeInteger(value) || value < 0 || value > TOKEN_STANDARD_V2_AMOUNT_DECIMALS) {
    inputInvalid(`instrumentDecimals must be a safe integer between 0 and ${TOKEN_STANDARD_V2_AMOUNT_DECIMALS}.`, {
      field: 'instrumentDecimals',
      instrumentDecimals: value,
    });
  }
  return value;
}

function normalizeActiveAtOffset(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0) {
    inputInvalid('activeAtOffset must be a non-negative safe integer.', {
      field: 'activeAtOffset',
      activeAtOffset: value,
    });
  }
  return value;
}

function validateAccount(account: TokenStandardV2Account): void {
  if (
    !isRecord(account) ||
    (account.owner !== null && !isNonEmptyString(account.owner)) ||
    (account.provider !== null && !isNonEmptyString(account.provider)) ||
    typeof account.id !== 'string'
  ) {
    inputInvalid('account must be a valid Token Standard V2 Account.', {
      field: 'account',
    });
  }
}

function validateInstrumentId(instrumentId: TokenStandardV2InstrumentId): void {
  if (!isRecord(instrumentId) || !isNonEmptyString(instrumentId.admin) || !isNonEmptyString(instrumentId.id)) {
    inputInvalid('instrumentId must be a valid Token Standard V2 InstrumentId.', { field: 'instrumentId' });
  }
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return isNonEmptyString(value) ? value : undefined;
}

function readAccount(value: unknown): TokenStandardV2Account | undefined {
  if (!isRecord(value)) return undefined;
  const owner = readNullableString(value['owner']);
  const provider = readNullableString(value['provider']);
  const id = typeof value['id'] === 'string' ? value['id'] : undefined;
  if (owner === undefined || provider === undefined || id === undefined) {
    return undefined;
  }
  return { owner, provider, id };
}

function readInstrumentId(value: unknown): TokenStandardV2InstrumentId | undefined {
  if (!isRecord(value)) return undefined;
  const admin = isNonEmptyString(value['admin']) ? value['admin'] : undefined;
  const id = isNonEmptyString(value['id']) ? value['id'] : undefined;
  return admin && id ? { admin, id } : undefined;
}

function readMetadata(value: unknown): TokenStandardV2Metadata | undefined {
  if (!isRecord(value) || !isRecord(value['values'])) return undefined;
  const values: Record<string, string> = {};
  for (const [key, metadataValue] of Object.entries(value['values'])) {
    if (typeof metadataValue !== 'string') return undefined;
    values[key] = metadataValue;
  }
  return { values };
}

function readLock(value: unknown): TokenStandardV2Lock | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !Array.isArray(value['holders'])) return undefined;
  const { holders } = value;
  if (!holders.every(isNonEmptyString)) return undefined;

  const expiresAt = readNullableString(value['expiresAt']);
  const context = readNullableString(value['context']);
  const rawExpiresAfter = value['expiresAfter'];
  let expiresAfter: TokenStandardV2Lock['expiresAfter'];
  if (rawExpiresAfter === null) {
    expiresAfter = null;
  } else if (
    isRecord(rawExpiresAfter) &&
    typeof rawExpiresAfter['microseconds'] === 'string' &&
    /^-?\d+$/.test(rawExpiresAfter['microseconds'])
  ) {
    expiresAfter = { microseconds: rawExpiresAfter['microseconds'] };
  } else {
    return undefined;
  }
  if (expiresAt === undefined || context === undefined) return undefined;
  return { holders, expiresAt, expiresAfter, context };
}

function accountsEqual(left: TokenStandardV2Account, right: TokenStandardV2Account): boolean {
  return left.owner === right.owner && left.provider === right.provider && left.id === right.id;
}

function instrumentIdsEqual(left: TokenStandardV2InstrumentId, right: TokenStandardV2InstrumentId): boolean {
  return left.admin === right.admin && left.id === right.id;
}

function identifierModuleEntitySuffix(identifier: string): string | undefined {
  const separator = identifier.indexOf(':');
  return separator === -1 ? undefined : identifier.slice(separator + 1);
}

function interfaceIdsMatch(left: string, right: string): boolean {
  return identifierModuleEntitySuffix(left) === identifierModuleEntitySuffix(right);
}

function decimalAmountToBaseUnits(amount: string, decimals: number): string {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(amount.trim());
  if (!match) throw new Error('amount must be a non-negative decimal');

  const whole = match[1] ?? '0';
  const fractional = (match[2] ?? '').replace(/0+$/, '');
  if (fractional.length > decimals) {
    throw new Error(`amount exceeds ${decimals} decimal places`);
  }
  const scale = 10n ** BigInt(decimals);
  return (BigInt(whole) * scale + BigInt(fractional.padEnd(decimals, '0') || '0')).toString();
}

function normalizeBaseUnitAmount(value: string): string {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
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
  readonly account: TokenStandardV2Account;
  readonly instrumentId: TokenStandardV2InstrumentId;
  readonly instrumentDecimals: number;
  readonly synchronizerId?: string;
}): TokenStandardV2Holding | undefined {
  const activeContract = params.item.contractEntry.JsActiveContract;
  if (params.synchronizerId !== undefined && activeContract.synchronizerId !== params.synchronizerId) {
    return undefined;
  }

  const { createdEvent } = activeContract;
  const matchingViews = createdEvent.interfaceViews.filter((view) =>
    interfaceIdsMatch(view.interfaceId, params.holdingInterfaceId)
  );
  if (matchingViews.length !== 1) {
    interfaceViewInvalid('Active Holding contract must contain exactly one HoldingV2 interface view.', {
      itemIndex: params.itemIndex,
      contractId: createdEvent.contractId,
      matchingViewCount: matchingViews.length,
    });
  }

  const interfaceView = matchingViews[0];
  if (!interfaceView) {
    interfaceViewInvalid('HoldingV2 interface view is missing.', {
      itemIndex: params.itemIndex,
      contractId: createdEvent.contractId,
    });
  }
  if (interfaceView.viewStatus.code !== 0) {
    return undefined;
  }
  if (!isRecord(interfaceView.viewValue)) {
    interfaceViewInvalid('HoldingV2 interface view is missing viewValue.', {
      itemIndex: params.itemIndex,
      contractId: createdEvent.contractId,
    });
  }

  const account = readAccount(interfaceView.viewValue['account']);
  const instrumentId = readInstrumentId(interfaceView.viewValue['instrumentId']);
  if (!account || !instrumentId) {
    interfaceViewInvalid('HoldingV2 interface view is missing a valid account or instrumentId.', {
      itemIndex: params.itemIndex,
      contractId: createdEvent.contractId,
    });
  }
  if (!accountsEqual(account, params.account) || !instrumentIdsEqual(instrumentId, params.instrumentId)) {
    return undefined;
  }

  const lock = readLock(interfaceView.viewValue['lock']);
  const meta = readMetadata(interfaceView.viewValue['meta']);
  if (lock === undefined || !meta) {
    interfaceViewInvalid('HoldingV2 interface view has an invalid lock or metadata value.', {
      itemIndex: params.itemIndex,
      contractId: createdEvent.contractId,
    });
  }

  const { amount } = interfaceView.viewValue;
  if (!isNonEmptyString(amount)) {
    interfaceViewInvalid('HoldingV2 interface view is missing amount.', {
      itemIndex: params.itemIndex,
      contractId: createdEvent.contractId,
    });
  }
  let amountBaseUnits: string;
  try {
    amountBaseUnits = decimalAmountToBaseUnits(amount, params.instrumentDecimals);
  } catch {
    interfaceViewInvalid('HoldingV2 amount is invalid for the configured instrument decimals.', {
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
    account,
    instrumentId,
    amount,
    amountBaseUnits,
    lock,
    meta,
  };
}

export async function listTokenStandardV2Holdings(
  params: ListTokenStandardV2HoldingsParams
): Promise<readonly TokenStandardV2Holding[]> {
  if (!isRecord(params.ledger) || typeof params.ledger.getActiveContracts !== 'function') {
    inputInvalid('ledger must provide getActiveContracts.', { field: 'ledger' });
  }
  validateAccount(params.account);
  validateInstrumentId(params.instrumentId);
  const parties = normalizeParties(params.parties);
  const instrumentDecimals = normalizeInstrumentDecimals(params.instrumentDecimals);
  const holdingInterfaceId = normalizeRequiredString(
    params.holdingInterfaceId ?? TOKEN_STANDARD_V2_HOLDING_INTERFACE_ID,
    'holdingInterfaceId'
  );
  const synchronizerId =
    params.synchronizerId === undefined ? undefined : normalizeRequiredString(params.synchronizerId, 'synchronizerId');
  const activeAtOffset = normalizeActiveAtOffset(params.activeAtOffset);
  const response = await params.ledger.getActiveContracts({
    parties,
    interfaceIds: [holdingInterfaceId],
    includeInterfaceView: true,
    includeCreatedEventBlob: false,
    ...(activeAtOffset === undefined ? {} : { activeAtOffset }),
  });

  const holdings = new Map<string, TokenStandardV2Holding>();
  for (const [itemIndex, item] of response.entries()) {
    if (!isJsActiveContractItem(item)) continue;
    const holding = readHolding({
      item,
      itemIndex,
      holdingInterfaceId,
      account: params.account,
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
        existing.amount !== holding.amount)
    ) {
      interfaceViewInvalid('Duplicate HoldingV2 contract rows contain inconsistent data.', {
        contractId: holding.contractId,
      });
    }
    if (!existing) holdings.set(holding.contractId, holding);
  }
  return [...holdings.values()];
}

export async function selectTokenStandardV2Holdings(
  params: SelectTokenStandardV2HoldingsParams
): Promise<SelectedTokenStandardV2Holdings> {
  const required = BigInt(normalizeBaseUnitAmount(params.amountBaseUnits));
  if (required <= 0n) {
    inputInvalid('amountBaseUnits must be positive.', {
      field: 'amountBaseUnits',
      amountBaseUnits: params.amountBaseUnits,
    });
  }

  const isSpendable = params.isSpendable ?? ((holding: TokenStandardV2Holding) => holding.lock === null);
  const holdings = [...(await listTokenStandardV2Holdings(params))]
    .filter((holding) => isSpendable(holding) && BigInt(holding.amountBaseUnits) > 0n)
    .sort((left, right) => {
      const difference = BigInt(right.amountBaseUnits) - BigInt(left.amountBaseUnits);
      if (difference !== 0n) return difference > 0n ? 1 : -1;
      return left.contractId.localeCompare(right.contractId);
    });

  const selected: TokenStandardV2Holding[] = [];
  let total = 0n;
  for (const holding of holdings) {
    selected.push(holding);
    total += BigInt(holding.amountBaseUnits);
    if (total >= required) break;
  }

  if (total < required) {
    throw new TokenStandardV2HoldingError(
      TokenStandardV2HoldingErrorCode.BALANCE_INSUFFICIENT,
      'Available spendable Token Standard V2 holdings do not cover the requested amount.',
      {
        requiredBaseUnits: required.toString(),
        availableBaseUnits: total.toString(),
        account: params.account,
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
