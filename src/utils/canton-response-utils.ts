import { OperationError, OperationErrorCode } from '../core/errors';
import { isRecord } from '../core/utils';

export type CantonContractCreateArgument =
  | readonly unknown[]
  | Record<string, unknown>
  | string
  | number
  | boolean
  | null;

export interface CantonNormalizedContract {
  readonly contractId: string;
  readonly templateId: string;
  readonly createArgument: CantonContractCreateArgument;
  readonly createdEventBlob: string | null;
  readonly createdAt: string | null;
}

export interface CantonContractWithStateLike {
  readonly contract?: {
    readonly contract_id?: string;
    readonly [key: string]: unknown;
  };
  readonly [key: string]: unknown;
}

export interface CantonInstrumentId {
  readonly admin: string;
  readonly id: string;
}

export interface CantonUnlockedUtxo {
  readonly contractId: string;
  readonly amount: string;
  readonly metadata?: Record<string, unknown>;
}

export interface CantonLockedUtxo {
  readonly contractId: string;
  readonly amount: string;
  readonly lock?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
}

export interface CantonTokenBalance {
  readonly instrumentId: CantonInstrumentId;
  readonly totalUnlockedBalance: string;
  readonly totalLockedBalance: string;
  readonly totalBalance: string;
  readonly unlockedUtxos: readonly CantonUnlockedUtxo[];
  readonly lockedUtxos: readonly CantonLockedUtxo[];
}

export interface CantonWalletBalances {
  readonly partyId: string;
  readonly fetchedAt: string;
  readonly tokens: readonly CantonTokenBalance[];
}

export interface CantonCoinBalanceLookupOptions {
  readonly expectedAdmin: string;
}

export function readRequiredString(source: unknown, key: string, operation: string): string {
  if (isRecord(source) && key in source) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  throw new OperationError(
    `Canton ${operation} response did not include ${key}`,
    OperationErrorCode.TRANSACTION_FAILED
  );
}

export function readContractWithStateContractId(contractWithState: unknown): string | null {
  if (!isRecord(contractWithState)) return null;
  const { contract } = contractWithState;
  if (!isRecord(contract)) return null;
  const contractId = contract['contract_id'];
  return typeof contractId === 'string' && contractId.trim() ? contractId : null;
}

export function readOptionalCantonUpdateId(source: unknown): string | null {
  if (!isRecord(source)) return null;
  for (const key of ['updateId', 'update_id', 'transaction_id', 'transactionId']) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return readOptionalCantonUpdateId(source['transactionTree']);
}

export function objectOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function normalizeCantonContractItem(item: unknown): CantonNormalizedContract {
  if (!isRecord(item)) {
    return emptyNormalizedContract();
  }

  return contractFromCreatedEvent(findCreatedEventPayload(item));
}

export function findCantonCoinBalance(
  balances: CantonWalletBalances | null | undefined,
  options: CantonCoinBalanceLookupOptions
): CantonTokenBalance | null {
  const expectedAdmin = options.expectedAdmin.trim();
  if (!expectedAdmin) return null;

  let partialMatch: CantonTokenBalance | null = null;
  for (const token of balances?.tokens ?? []) {
    if (token.instrumentId.admin !== expectedAdmin) continue;

    const instrumentId = token.instrumentId.id;
    if (instrumentId === 'Amulet') return token;
    if (!partialMatch && instrumentId.toLowerCase() === 'amulet') {
      partialMatch = token;
    }
  }
  return partialMatch;
}

function findCreatedEventPayload(item: Record<string, unknown>): Record<string, unknown> {
  const contractEntry = toRecord(item['contractEntry']);
  const activeContract = toRecord(contractEntry?.['JsActiveContract']);
  const createdEvent = toRecord(activeContract?.['createdEvent']);
  return createdEvent ?? item;
}

function contractFromCreatedEvent(createdEvent: Record<string, unknown>): CantonNormalizedContract {
  return {
    contractId: toStringField(createdEvent['contractId']),
    templateId: toStringField(createdEvent['templateId']),
    createArgument: toCreateArgument(createdEvent['createArgument']),
    createdEventBlob: toNullableStringField(createdEvent['createdEventBlob']),
    createdAt: toNullableStringField(createdEvent['createdAt']),
  };
}

function emptyNormalizedContract(): CantonNormalizedContract {
  return {
    contractId: '',
    templateId: '',
    createArgument: null,
    createdEventBlob: null,
    createdAt: null,
  };
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function toCreateArgument(value: unknown): CantonContractCreateArgument {
  if (value == null) return null;
  if (Array.isArray(value)) return value;
  if (isRecord(value)) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return null;
}

function toStringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toNullableStringField(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
