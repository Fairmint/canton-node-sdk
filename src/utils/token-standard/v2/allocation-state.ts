import type { GetActiveContractsParams } from '../../../clients/ledger-json-api/operations/v2/state/get-active-contracts';
import type { JsGetActiveContractsResponse } from '../../../clients/ledger-json-api/schemas';
import { CantonError, type ErrorContext } from '../../../core/errors';
import { isNonEmptyString, isRecord } from '../../../core/utils';
import { isJsActiveContractItem } from '../../contracts';
import type { TokenStandardV2AllocationChoiceArgument } from './allocation';
import type { TokenStandardV2Account, TokenStandardV2Metadata } from './types';

export const TOKEN_STANDARD_V2_ALLOCATION_INTERFACE_ID =
  '#splice-api-token-allocation-v2:Splice.Api.Token.AllocationV2:Allocation';
export const TOKEN_STANDARD_V2_ALLOCATION_INSTRUCTION_INTERFACE_ID =
  '#splice-api-token-allocation-instruction-v2:Splice.Api.Token.AllocationInstructionV2:AllocationInstruction';

export const TokenStandardV2AllocationStateErrorCode = {
  INPUT_INVALID: 'TOKEN_STANDARD_V2_ALLOCATION_STATE_INPUT_INVALID',
  INTERFACE_VIEW_INVALID: 'TOKEN_STANDARD_V2_ALLOCATION_STATE_INTERFACE_VIEW_INVALID',
  ACS_INCOMPLETE: 'TOKEN_STANDARD_V2_ALLOCATION_STATE_ACS_INCOMPLETE',
  AMBIGUOUS: 'TOKEN_STANDARD_V2_ALLOCATION_STATE_AMBIGUOUS',
  NOT_FOUND: 'TOKEN_STANDARD_V2_ALLOCATION_STATE_NOT_FOUND',
} as const;

export type TokenStandardV2AllocationStateErrorCode =
  (typeof TokenStandardV2AllocationStateErrorCode)[keyof typeof TokenStandardV2AllocationStateErrorCode];

/** Typed failure raised while recovering a Token Standard V2 allocation state from the ACS. */
export class TokenStandardV2AllocationStateError extends CantonError {
  public override readonly name: string;

  public constructor(code: TokenStandardV2AllocationStateErrorCode, message: string, context?: ErrorContext) {
    super(message, code, context);
    this.name = 'TokenStandardV2AllocationStateError';
  }
}

export interface TokenStandardV2AllocationStateClient {
  getActiveContracts(params: GetActiveContractsParams): Promise<JsGetActiveContractsResponse>;
}

/** The request identity that remains observable through the Allocation and AllocationInstruction interfaces. */
export interface TokenStandardV2AllocationStateRequest {
  readonly settlement: TokenStandardV2AllocationChoiceArgument['settlement'];
  readonly allocation: TokenStandardV2AllocationChoiceArgument['allocation'];
  readonly requestedAt: string;
  readonly inputHoldingCids: readonly string[];
}

export interface DiscoverTokenStandardV2AllocationStateParams {
  readonly ledger: TokenStandardV2AllocationStateClient;
  readonly parties: readonly string[];
  readonly synchronizerId: string;
  readonly request: TokenStandardV2AllocationStateRequest;
  /** ACS snapshot offset. Requiring it keeps recovery to one Canton network read. */
  readonly activeAtOffset: number;
}

export interface GetTokenStandardV2AllocationViewsByContractIdsParams {
  readonly ledger: TokenStandardV2AllocationStateClient;
  readonly parties: readonly string[];
  readonly synchronizerId: string;
  readonly allocationCids: readonly string[];
  /** ACS snapshot offset. Requiring it binds every returned view to one Canton read. */
  readonly activeAtOffset: number;
}

export interface TokenStandardV2AllocationView {
  readonly originalAllocationCid: string | null;
  readonly settlement: TokenStandardV2AllocationChoiceArgument['settlement'];
  readonly allocation: TokenStandardV2AllocationChoiceArgument['allocation'];
  readonly holdingCids: readonly string[];
  readonly createdAt: string;
  readonly numIterations: string;
  readonly expiresAt: string | null;
  readonly availableActions: unknown;
  readonly meta: TokenStandardV2Metadata;
}

export interface TokenStandardV2AllocationInstructionView {
  readonly originalInstructionCid: string | null;
  readonly settlement: TokenStandardV2AllocationChoiceArgument['settlement'];
  readonly allocation: TokenStandardV2AllocationChoiceArgument['allocation'];
  readonly requestedAt: string;
  readonly inputHoldingCids: readonly string[];
  readonly expiresAt: string | null;
  readonly availableActions: unknown;
  readonly meta: TokenStandardV2Metadata;
}

export interface TokenStandardV2AllocationStateCompleted {
  readonly type: 'Completed';
  readonly allocationCid: string;
  readonly view: TokenStandardV2AllocationView;
}

export interface TokenStandardV2AllocationContract {
  readonly allocationCid: string;
  readonly view: TokenStandardV2AllocationView;
}

export interface TokenStandardV2AllocationStatePending {
  readonly type: 'Pending';
  readonly allocationInstructionCid: string;
  readonly view: TokenStandardV2AllocationInstructionView;
}

/**
 * No matching active contract is visible. This does not imply failure: a Failed result can only be recovered from the
 * original transaction tree or command completion, not from absence in the active contract set.
 */
export interface TokenStandardV2AllocationStateUnknown {
  readonly type: 'Unknown';
}

export type TokenStandardV2AllocationState =
  | TokenStandardV2AllocationStateCompleted
  | TokenStandardV2AllocationStatePending
  | TokenStandardV2AllocationStateUnknown;

type InvalidValueHandler = (message: string, context: ErrorContext) => never;

function inputInvalid(message: string, context: ErrorContext): never {
  throw new TokenStandardV2AllocationStateError(
    TokenStandardV2AllocationStateErrorCode.INPUT_INVALID,
    message,
    context
  );
}

function interfaceViewInvalid(message: string, context: ErrorContext): never {
  throw new TokenStandardV2AllocationStateError(
    TokenStandardV2AllocationStateErrorCode.INTERFACE_VIEW_INVALID,
    message,
    context
  );
}

function acsIncomplete(message: string, context: ErrorContext): never {
  throw new TokenStandardV2AllocationStateError(
    TokenStandardV2AllocationStateErrorCode.ACS_INCOMPLETE,
    message,
    context
  );
}

function notFound(message: string, context: ErrorContext): never {
  throw new TokenStandardV2AllocationStateError(TokenStandardV2AllocationStateErrorCode.NOT_FOUND, message, context);
}

function requireTrimmedNonEmpty(value: unknown, field: string, invalid: InvalidValueHandler): string {
  if (!isNonEmptyString(value)) {
    invalid(`${field} must be a non-empty string.`, { field, value });
  }
  return value.trim();
}

function requireText(value: unknown, field: string, invalid: InvalidValueHandler): string {
  if (typeof value !== 'string') {
    invalid(`${field} must be a string.`, { field, value });
  }
  return value;
}

function readNullableNonEmptyString(value: unknown, field: string, invalid: InvalidValueHandler): string | null {
  return value === null || value === undefined ? null : requireTrimmedNonEmpty(value, field, invalid);
}

function readStringArray(
  value: unknown,
  field: string,
  invalid: InvalidValueHandler,
  options: { readonly allowEmpty: boolean; readonly trim: boolean }
): string[] {
  if (!Array.isArray(value) || (!options.allowEmpty && value.length === 0)) {
    invalid(`${field} must be ${options.allowEmpty ? 'an array' : 'a non-empty array'}.`, { field, value });
  }
  return value.map((item, index) => {
    const itemField = `${field}[${index}]`;
    return options.trim ? requireTrimmedNonEmpty(item, itemField, invalid) : requireText(item, itemField, invalid);
  });
}

function createReadonlyStringRecord(
  entries: ReadonlyArray<readonly [string, string]>
): Readonly<Record<string, string>> {
  const result = Object.create(null) as Record<string, string>;
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

function readMetadata(value: unknown, field: string, invalid: InvalidValueHandler): TokenStandardV2Metadata {
  if (!isRecord(value) || !isRecord(value['values'])) {
    invalid(`${field} must contain a values record.`, { field, value });
  }
  const entries = Object.entries(value['values']).map(([key, metadataValue]) => {
    if (typeof metadataValue !== 'string') {
      invalid(`${field}.values must contain only strings.`, { field, key, value: metadataValue });
    }
    return [key, metadataValue] as const;
  });
  return { values: createReadonlyStringRecord(entries) };
}

function readAccount(value: unknown, field: string, invalid: InvalidValueHandler): TokenStandardV2Account {
  if (!isRecord(value)) {
    invalid(`${field} must be a Token Standard V2 account.`, { field, value });
  }
  return {
    owner: readNullableNonEmptyString(value['owner'], `${field}.owner`, invalid),
    provider: readNullableNonEmptyString(value['provider'], `${field}.provider`, invalid),
    id: requireText(value['id'], `${field}.id`, invalid),
  };
}

function readDecimal(value: unknown, field: string, invalid: InvalidValueHandler, allowZero: boolean): string {
  const text = requireText(value, field, invalid);
  const match = /^(\d{1,28})(?:\.(\d{1,10}))?$/.exec(text);
  if (!match || (!allowZero && /^0+$/.test(`${match[1]}${match[2] ?? ''}`))) {
    invalid(`${field} must be a ${allowZero ? 'non-negative' : 'positive'} Daml Decimal string.`, {
      field,
      value,
    });
  }
  return text;
}

function readDecimalMap(
  value: unknown,
  field: string,
  invalid: InvalidValueHandler
): Readonly<Record<string, string>> | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) {
    invalid(`${field} must be null or a decimal map.`, { field, value });
  }
  return createReadonlyStringRecord(
    Object.entries(value).map(([key, amount]) => [key, readDecimal(amount, `${field}.${key}`, invalid, false)])
  );
}

function readSettlement(
  value: unknown,
  field: string,
  invalid: InvalidValueHandler
): TokenStandardV2AllocationChoiceArgument['settlement'] {
  if (!isRecord(value)) {
    invalid(`${field} must be a settlement record.`, { field, value });
  }
  return {
    executors: readStringArray(value['executors'], `${field}.executors`, invalid, {
      allowEmpty: false,
      trim: true,
    }),
    id: requireText(value['id'], `${field}.id`, invalid),
    cid: readNullableNonEmptyString(value['cid'], `${field}.cid`, invalid),
    meta: readMetadata(value['meta'], `${field}.meta`, invalid),
  };
}

function readAllocation(
  value: unknown,
  field: string,
  invalid: InvalidValueHandler
): TokenStandardV2AllocationChoiceArgument['allocation'] {
  if (!isRecord(value) || !Array.isArray(value['transferLegSides'])) {
    invalid(`${field} must be an allocation record.`, { field, value });
  }
  const transferLegSides = value['transferLegSides'].map((transferLegSide, index) => {
    const legField = `${field}.transferLegSides[${index}]`;
    if (!isRecord(transferLegSide)) {
      invalid(`${legField} must be a transfer-leg side.`, { field: legField, value: transferLegSide });
    }
    const { side } = transferLegSide;
    if (side !== 'SenderSide' && side !== 'ReceiverSide') {
      invalid(`${legField}.side must be SenderSide or ReceiverSide.`, {
        field: `${legField}.side`,
        value: side,
      });
    }
    const normalizedSide: 'SenderSide' | 'ReceiverSide' = side === 'SenderSide' ? 'SenderSide' : 'ReceiverSide';
    return {
      transferLegId: requireText(transferLegSide['transferLegId'], `${legField}.transferLegId`, invalid),
      side: normalizedSide,
      otherside: readAccount(transferLegSide['otherside'], `${legField}.otherside`, invalid),
      amount: readDecimal(transferLegSide['amount'], `${legField}.amount`, invalid, false),
      instrumentId: requireText(transferLegSide['instrumentId'], `${legField}.instrumentId`, invalid),
      meta: readMetadata(transferLegSide['meta'], `${legField}.meta`, invalid),
    };
  });
  const transferLegSideKeys = transferLegSides.map(({ side, transferLegId }) => JSON.stringify([transferLegId, side]));
  if (new Set(transferLegSideKeys).size !== transferLegSideKeys.length) {
    invalid(`${field}.transferLegSides must not contain duplicate transfer-leg sides.`, {
      field: `${field}.transferLegSides`,
    });
  }
  const nextIterationFunding = readDecimalMap(value['nextIterationFunding'], `${field}.nextIterationFunding`, invalid);
  if (transferLegSides.length === 0 && nextIterationFunding === null) {
    invalid(`${field}.transferLegSides may be empty only when iterated settlement is enabled.`, {
      field: `${field}.transferLegSides`,
    });
  }
  if (typeof value['committed'] !== 'boolean') {
    invalid(`${field}.committed must be a boolean.`, { field: `${field}.committed`, value: value['committed'] });
  }
  return {
    admin: requireTrimmedNonEmpty(value['admin'], `${field}.admin`, invalid),
    authorizer: readAccount(value['authorizer'], `${field}.authorizer`, invalid),
    transferLegSides,
    settlementDeadline: readNullableNonEmptyString(value['settlementDeadline'], `${field}.settlementDeadline`, invalid),
    nextIterationFunding,
    committed: value['committed'],
    meta: readMetadata(value['meta'], `${field}.meta`, invalid),
  };
}

function readRequest(value: unknown): TokenStandardV2AllocationStateRequest {
  if (!isRecord(value)) {
    inputInvalid('request must be a Token Standard V2 allocation request.', { field: 'request', value });
  }
  return {
    settlement: readSettlement(value['settlement'], 'request.settlement', inputInvalid),
    allocation: readAllocation(value['allocation'], 'request.allocation', inputInvalid),
    requestedAt: requireTrimmedNonEmpty(value['requestedAt'], 'request.requestedAt', inputInvalid),
    inputHoldingCids: readStringArray(value['inputHoldingCids'], 'request.inputHoldingCids', inputInvalid, {
      allowEmpty: true,
      trim: true,
    }),
  };
}

function readNonNegativeInteger(value: unknown, field: string, invalid: InvalidValueHandler): string {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value.toString();
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value).toString();
  invalid(`${field} must be a non-negative integer.`, { field, value });
}

interface DecodedAllocationViewIdentity {
  readonly value: Record<string, unknown>;
  readonly settlement: TokenStandardV2AllocationChoiceArgument['settlement'];
  readonly allocation: TokenStandardV2AllocationChoiceArgument['allocation'];
}

interface DecodedAllocationInstructionViewIdentity extends DecodedAllocationViewIdentity {
  readonly requestedAt: string;
  readonly inputHoldingCids: readonly string[];
}

function readAllocationViewIdentity(value: unknown, context: ErrorContext): DecodedAllocationViewIdentity {
  if (!isRecord(value)) {
    interfaceViewInvalid('AllocationV2 interface view must be a record.', context);
  }
  const invalid: InvalidValueHandler = (message, fieldContext) =>
    interfaceViewInvalid(message, { ...context, ...fieldContext });
  return {
    value,
    settlement: readSettlement(value['settlement'], 'view.settlement', invalid),
    allocation: readAllocation(value['allocation'], 'view.allocation', invalid),
  };
}

function readAllocationView(
  identity: DecodedAllocationViewIdentity,
  context: ErrorContext
): TokenStandardV2AllocationView {
  const { value } = identity;
  if (!('availableActions' in value)) {
    interfaceViewInvalid('AllocationV2 interface view is missing availableActions.', context);
  }
  const invalid: InvalidValueHandler = (message, fieldContext) =>
    interfaceViewInvalid(message, { ...context, ...fieldContext });
  return {
    originalAllocationCid: readNullableNonEmptyString(
      value['originalAllocationCid'],
      'view.originalAllocationCid',
      invalid
    ),
    settlement: identity.settlement,
    allocation: identity.allocation,
    holdingCids: readStringArray(value['holdingCids'], 'view.holdingCids', invalid, {
      allowEmpty: true,
      trim: true,
    }),
    createdAt: requireTrimmedNonEmpty(value['createdAt'], 'view.createdAt', invalid),
    numIterations: readNonNegativeInteger(value['numIterations'], 'view.numIterations', invalid),
    expiresAt: readNullableNonEmptyString(value['expiresAt'], 'view.expiresAt', invalid),
    availableActions: value['availableActions'],
    meta: readMetadata(value['meta'], 'view.meta', invalid),
  };
}

function readAllocationInstructionViewIdentity(
  value: unknown,
  context: ErrorContext
): DecodedAllocationInstructionViewIdentity {
  if (!isRecord(value)) {
    interfaceViewInvalid('AllocationInstructionV2 interface view must be a record.', context);
  }
  const invalid: InvalidValueHandler = (message, fieldContext) =>
    interfaceViewInvalid(message, { ...context, ...fieldContext });
  return {
    value,
    settlement: readSettlement(value['settlement'], 'view.settlement', invalid),
    allocation: readAllocation(value['allocation'], 'view.allocation', invalid),
    requestedAt: requireTrimmedNonEmpty(value['requestedAt'], 'view.requestedAt', invalid),
    inputHoldingCids: readStringArray(value['inputHoldingCids'], 'view.inputHoldingCids', invalid, {
      allowEmpty: true,
      trim: true,
    }),
  };
}

function readAllocationInstructionView(
  identity: DecodedAllocationInstructionViewIdentity,
  context: ErrorContext
): TokenStandardV2AllocationInstructionView {
  const { value } = identity;
  if (!('availableActions' in value)) {
    interfaceViewInvalid('AllocationInstructionV2 interface view is missing availableActions.', context);
  }
  const invalid: InvalidValueHandler = (message, fieldContext) =>
    interfaceViewInvalid(message, { ...context, ...fieldContext });
  return {
    originalInstructionCid: readNullableNonEmptyString(
      value['originalInstructionCid'],
      'view.originalInstructionCid',
      invalid
    ),
    settlement: identity.settlement,
    allocation: identity.allocation,
    requestedAt: identity.requestedAt,
    inputHoldingCids: identity.inputHoldingCids,
    expiresAt: readNullableNonEmptyString(value['expiresAt'], 'view.expiresAt', invalid),
    availableActions: value['availableActions'],
    meta: readMetadata(value['meta'], 'view.meta', invalid),
  };
}

function identifierModuleEntitySuffix(identifier: string): string | undefined {
  const separator = identifier.indexOf(':');
  return separator === -1 ? undefined : identifier.slice(separator + 1);
}

function interfaceIdsMatch(left: string, right: string): boolean {
  return identifierModuleEntitySuffix(left) === identifierModuleEntitySuffix(right);
}

function arraysEqual<T>(left: readonly T[], right: readonly T[], equal: (a: T, b: T) => boolean): boolean {
  return left.length === right.length && left.every((value, index) => equal(value, right[index] as T));
}

function stringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return arraysEqual(left, right, (a, b) => a === b);
}

function metadataEqual(left: TokenStandardV2Metadata, right: TokenStandardV2Metadata): boolean {
  const leftKeys = Object.keys(left.values).sort();
  const rightKeys = Object.keys(right.values).sort();
  return stringArraysEqual(leftKeys, rightKeys) && leftKeys.every((key) => left.values[key] === right.values[key]);
}

function canonicalDecimal(value: string): string | undefined {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return undefined;
  const whole = (match[1] ?? '').replace(/^0+(?=\d)/, '');
  const fraction = (match[2] ?? '').replace(/0+$/, '');
  return fraction.length === 0 ? whole : `${whole}.${fraction}`;
}

function decimalsEqual(left: string, right: string): boolean {
  const canonicalLeft = canonicalDecimal(left);
  const canonicalRight = canonicalDecimal(right);
  return canonicalLeft !== undefined && canonicalLeft === canonicalRight;
}

function decimalMapsEqual(
  left: Readonly<Record<string, string>> | null,
  right: Readonly<Record<string, string>> | null
): boolean {
  if (left === null || right === null) return left === right;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    stringArraysEqual(leftKeys, rightKeys) &&
    leftKeys.every((key) => right[key] !== undefined && decimalsEqual(left[key] as string, right[key]))
  );
}

function canonicalTimestamp(value: string): bigint | undefined {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z$/.exec(value);
  if (!match) return undefined;
  const milliseconds = Date.parse(`${match[1]}Z`);
  if (!Number.isFinite(milliseconds)) return undefined;
  const microseconds = match[2]?.padEnd(6, '0') ?? '000000';
  return BigInt(milliseconds) * 1000n + BigInt(microseconds);
}

function timestampsEqual(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return left === right;
  const canonicalLeft = canonicalTimestamp(left);
  const canonicalRight = canonicalTimestamp(right);
  return canonicalLeft === undefined || canonicalRight === undefined
    ? left === right
    : canonicalLeft === canonicalRight;
}

function accountsEqual(left: TokenStandardV2Account, right: TokenStandardV2Account): boolean {
  return left.owner === right.owner && left.provider === right.provider && left.id === right.id;
}

function settlementsEqual(
  left: TokenStandardV2AllocationChoiceArgument['settlement'],
  right: TokenStandardV2AllocationChoiceArgument['settlement']
): boolean {
  return (
    stringArraysEqual(left.executors, right.executors) &&
    left.id === right.id &&
    left.cid === right.cid &&
    metadataEqual(left.meta, right.meta)
  );
}

function allocationsEqual(
  left: TokenStandardV2AllocationChoiceArgument['allocation'],
  right: TokenStandardV2AllocationChoiceArgument['allocation']
): boolean {
  return (
    left.admin === right.admin &&
    accountsEqual(left.authorizer, right.authorizer) &&
    arraysEqual(left.transferLegSides, right.transferLegSides, (leftLeg, rightLeg) =>
      Boolean(
        leftLeg.transferLegId === rightLeg.transferLegId &&
        leftLeg.side === rightLeg.side &&
        accountsEqual(leftLeg.otherside, rightLeg.otherside) &&
        decimalsEqual(leftLeg.amount, rightLeg.amount) &&
        leftLeg.instrumentId === rightLeg.instrumentId &&
        metadataEqual(leftLeg.meta, rightLeg.meta)
      )
    ) &&
    timestampsEqual(left.settlementDeadline, right.settlementDeadline) &&
    decimalMapsEqual(left.nextIterationFunding, right.nextIterationFunding) &&
    left.committed === right.committed &&
    metadataEqual(left.meta, right.meta)
  );
}

function unknownValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && arraysEqual(left, right, unknownValuesEqual);
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return stringArraysEqual(leftKeys, rightKeys) && leftKeys.every((key) => unknownValuesEqual(left[key], right[key]));
}

function setConsistentState<T extends TokenStandardV2AllocationStateCompleted | TokenStandardV2AllocationStatePending>(
  states: Map<string, T>,
  contractId: string,
  state: T
): void {
  const existing = states.get(contractId);
  if (existing && !unknownValuesEqual(existing, state)) {
    interfaceViewInvalid('Duplicate allocation-state rows contain inconsistent data.', { contractId });
  }
  if (!existing) states.set(contractId, state);
}

function allocationRequestCoreMatches(
  request: TokenStandardV2AllocationStateRequest,
  view: Pick<TokenStandardV2AllocationView, 'settlement' | 'allocation'>
): boolean {
  return settlementsEqual(request.settlement, view.settlement) && allocationsEqual(request.allocation, view.allocation);
}

function normalizeParties(parties: readonly string[]): string[] {
  if (!Array.isArray(parties)) {
    inputInvalid('parties must be an array of explicit read parties.', { field: 'parties' });
  }
  const normalized = new Set<string>();
  for (const [index, party] of parties.entries()) {
    normalized.add(requireTrimmedNonEmpty(party, `parties[${index}]`, inputInvalid));
  }
  if (normalized.size === 0) {
    inputInvalid('parties must contain at least one explicit read party.', { field: 'parties' });
  }
  return [...normalized];
}

function normalizeActiveAtOffset(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    inputInvalid('activeAtOffset must be a non-negative safe integer.', {
      field: 'activeAtOffset',
      activeAtOffset: value,
    });
  }
  return value;
}

function normalizeAllocationCids(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    inputInvalid('allocationCids must be a non-empty array.', {
      field: 'allocationCids',
      allocationCids: value,
    });
  }
  const allocationCids = value.map((contractId, index) =>
    requireTrimmedNonEmpty(contractId, `allocationCids[${index}]`, inputInvalid)
  );
  if (new Set(allocationCids).size !== allocationCids.length) {
    inputInvalid('allocationCids must not contain duplicates.', {
      field: 'allocationCids',
      allocationCids,
    });
  }
  return allocationCids;
}

function handleNonActiveContractItem(item: unknown, itemIndex: number, synchronizerId: string): void {
  if (!isRecord(item) || !isRecord(item['contractEntry'])) {
    interfaceViewInvalid('ACS response contains an invalid contract row.', { itemIndex });
  }
  const { contractEntry } = item;
  if ('JsEmpty' in contractEntry) return;

  const incompleteAssigned = contractEntry['JsIncompleteAssigned'];
  if (isRecord(incompleteAssigned) && isRecord(incompleteAssigned['assignedEvent'])) {
    const { assignedEvent } = incompleteAssigned;
    if (assignedEvent['source'] !== synchronizerId && assignedEvent['target'] !== synchronizerId) return;
    acsIncomplete('Allocation state is incomplete while its contract is being reassigned.', {
      itemIndex,
      contractId: assignedEvent['contractId'],
      source: assignedEvent['source'],
      target: assignedEvent['target'],
    });
  }

  const incompleteUnassigned = contractEntry['JsIncompleteUnassigned'];
  if (isRecord(incompleteUnassigned) && isRecord(incompleteUnassigned['unassignedEvent'])) {
    const { unassignedEvent } = incompleteUnassigned;
    if (unassignedEvent['source'] !== synchronizerId && unassignedEvent['target'] !== synchronizerId) return;
    acsIncomplete('Allocation state is incomplete while its contract is being reassigned.', {
      itemIndex,
      contractId: unassignedEvent['contractId'],
      source: unassignedEvent['source'],
      target: unassignedEvent['target'],
    });
  }

  interfaceViewInvalid('ACS response contains an unsupported contract row.', { itemIndex });
}

/**
 * Reads exact active AllocationV2 contracts from one ACS snapshot.
 *
 * Contract IDs and decoded views are returned together so callers cannot validate an off-ledger allocation snapshot and
 * later submit a different contract ID.
 */
export async function getTokenStandardV2AllocationViewsByContractIds(
  params: GetTokenStandardV2AllocationViewsByContractIdsParams
): Promise<TokenStandardV2AllocationContract[]> {
  if (!isRecord(params)) {
    inputInvalid('params must be an exact allocation-view request.', { field: 'params' });
  }
  if (!isRecord(params.ledger) || typeof params.ledger.getActiveContracts !== 'function') {
    inputInvalid('ledger must provide getActiveContracts.', { field: 'ledger' });
  }
  const parties = normalizeParties(params.parties);
  const synchronizerId = requireTrimmedNonEmpty(params.synchronizerId, 'synchronizerId', inputInvalid);
  const allocationCids = normalizeAllocationCids(params.allocationCids);
  const requestedCids = new Set(allocationCids);
  const activeAtOffset = normalizeActiveAtOffset(params.activeAtOffset);

  const response = await params.ledger.getActiveContracts({
    parties,
    interfaceIds: [TOKEN_STANDARD_V2_ALLOCATION_INTERFACE_ID],
    includeInterfaceView: true,
    includeCreatedEventBlob: false,
    activeAtOffset,
  });
  const allocations = new Map<string, TokenStandardV2AllocationStateCompleted>();

  for (const [itemIndex, item] of response.entries()) {
    if (!isJsActiveContractItem(item)) {
      handleNonActiveContractItem(item, itemIndex, synchronizerId);
      continue;
    }
    const activeContract = item.contractEntry.JsActiveContract;
    if (activeContract.synchronizerId !== synchronizerId) continue;

    const { createdEvent } = activeContract;
    if (!isNonEmptyString(createdEvent.contractId) || !requestedCids.has(createdEvent.contractId)) continue;

    for (const [viewIndex, interfaceView] of createdEvent.interfaceViews.entries()) {
      if (!interfaceIdsMatch(interfaceView.interfaceId, TOKEN_STANDARD_V2_ALLOCATION_INTERFACE_ID)) continue;
      const context = {
        itemIndex,
        viewIndex,
        contractId: createdEvent.contractId,
        interfaceId: interfaceView.interfaceId,
      };
      if (interfaceView.viewStatus.code !== 0) {
        interfaceViewInvalid('Token Standard V2 allocation interface view request failed.', {
          ...context,
          viewStatusCode: interfaceView.viewStatus.code,
          viewStatusMessage: interfaceView.viewStatus.message,
        });
      }
      const identity = readAllocationViewIdentity(interfaceView.viewValue, context);
      setConsistentState(allocations, createdEvent.contractId, {
        type: 'Completed',
        allocationCid: createdEvent.contractId,
        view: readAllocationView(identity, context),
      });
    }
  }

  const missingAllocationCids = allocationCids.filter((contractId) => !allocations.has(contractId));
  if (missingAllocationCids.length > 0) {
    notFound('One or more requested Token Standard V2 allocations are not active and visible.', {
      allocationCids,
      missingAllocationCids,
      synchronizerId,
      activeAtOffset,
    });
  }

  return allocationCids.map((allocationCid) => {
    const allocation = allocations.get(allocationCid);
    if (!allocation) {
      notFound('A requested Token Standard V2 allocation disappeared while reading the ACS snapshot.', {
        allocationCid,
        activeAtOffset,
      });
    }
    return { allocationCid, view: allocation.view };
  });
}

/**
 * Recovers the active Completed or Pending state for a Token Standard V2 allocation request.
 *
 * Unknown means only that no matching active contract is visible at the requested ACS snapshot. It must not be
 * interpreted as Failed; recover Failed from the original transaction tree or command completion.
 */
export async function discoverTokenStandardV2AllocationState(
  params: DiscoverTokenStandardV2AllocationStateParams
): Promise<TokenStandardV2AllocationState> {
  if (!isRecord(params)) {
    inputInvalid('params must be an allocation-state discovery request.', { field: 'params' });
  }
  if (!isRecord(params.ledger) || typeof params.ledger.getActiveContracts !== 'function') {
    inputInvalid('ledger must provide getActiveContracts.', { field: 'ledger' });
  }
  const parties = normalizeParties(params.parties);
  const synchronizerId = requireTrimmedNonEmpty(params.synchronizerId, 'synchronizerId', inputInvalid);
  const request = readRequest(params.request);
  const activeAtOffset = normalizeActiveAtOffset(params.activeAtOffset);

  const response = await params.ledger.getActiveContracts({
    parties,
    interfaceIds: [TOKEN_STANDARD_V2_ALLOCATION_INTERFACE_ID, TOKEN_STANDARD_V2_ALLOCATION_INSTRUCTION_INTERFACE_ID],
    includeInterfaceView: true,
    includeCreatedEventBlob: false,
    activeAtOffset,
  });

  const completed = new Map<string, TokenStandardV2AllocationStateCompleted>();
  const pending = new Map<string, TokenStandardV2AllocationStatePending>();
  const allocationRows = new Map<string, TokenStandardV2AllocationStateCompleted>();
  const instructionRows = new Map<string, TokenStandardV2AllocationStatePending>();

  for (const [itemIndex, item] of response.entries()) {
    if (!isJsActiveContractItem(item)) {
      handleNonActiveContractItem(item, itemIndex, synchronizerId);
      continue;
    }
    const activeContract = item.contractEntry.JsActiveContract;
    if (activeContract.synchronizerId !== synchronizerId) continue;

    const { createdEvent } = activeContract;
    for (const [viewIndex, interfaceView] of createdEvent.interfaceViews.entries()) {
      const isAllocation = interfaceIdsMatch(interfaceView.interfaceId, TOKEN_STANDARD_V2_ALLOCATION_INTERFACE_ID);
      const isInstruction = interfaceIdsMatch(
        interfaceView.interfaceId,
        TOKEN_STANDARD_V2_ALLOCATION_INSTRUCTION_INTERFACE_ID
      );
      if (!isAllocation && !isInstruction) continue;

      const context = {
        itemIndex,
        viewIndex,
        contractId: createdEvent.contractId,
        interfaceId: interfaceView.interfaceId,
      };
      if (interfaceView.viewStatus.code !== 0) {
        interfaceViewInvalid('Token Standard V2 allocation interface view request failed.', {
          ...context,
          viewStatusCode: interfaceView.viewStatus.code,
          viewStatusMessage: interfaceView.viewStatus.message,
        });
      }
      if (!isNonEmptyString(createdEvent.contractId)) {
        interfaceViewInvalid('Matching active contract is missing contractId.', context);
      }

      if (isAllocation) {
        const identity = readAllocationViewIdentity(interfaceView.viewValue, context);
        const state: TokenStandardV2AllocationStateCompleted = {
          type: 'Completed',
          allocationCid: createdEvent.contractId,
          view: readAllocationView(identity, context),
        };
        setConsistentState(allocationRows, createdEvent.contractId, state);
        if (allocationRequestCoreMatches(request, identity)) {
          setConsistentState(completed, createdEvent.contractId, state);
        }
      }

      if (isInstruction) {
        const identity = readAllocationInstructionViewIdentity(interfaceView.viewValue, context);
        const state: TokenStandardV2AllocationStatePending = {
          type: 'Pending',
          allocationInstructionCid: createdEvent.contractId,
          view: readAllocationInstructionView(identity, context),
        };
        setConsistentState(instructionRows, createdEvent.contractId, state);
        if (
          allocationRequestCoreMatches(request, identity) &&
          timestampsEqual(request.requestedAt, identity.requestedAt) &&
          stringArraysEqual(request.inputHoldingCids, identity.inputHoldingCids)
        ) {
          setConsistentState(pending, createdEvent.contractId, state);
        }
      }
    }
  }

  if (completed.size > 1 || pending.size > 1 || (completed.size > 0 && pending.size > 0)) {
    throw new TokenStandardV2AllocationStateError(
      TokenStandardV2AllocationStateErrorCode.AMBIGUOUS,
      'Multiple active contracts match the Token Standard V2 allocation request.',
      {
        completedCids: [...completed.keys()].sort(),
        pendingCids: [...pending.keys()].sort(),
      }
    );
  }

  const completedState = completed.values().next().value;
  if (completedState) return completedState;
  const pendingState = pending.values().next().value;
  if (pendingState) return pendingState;
  return { type: 'Unknown' };
}
