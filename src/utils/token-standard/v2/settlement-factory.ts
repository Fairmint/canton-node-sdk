import { CantonError, type ErrorContext } from '../../../core/errors';
import { isNonEmptyString, isRecord } from '../../../core/utils';
import type { TokenStandardV2Metadata } from './types';

/** Token Standard V2 interface used to execute atomic allocation settlement. */
export const TOKEN_STANDARD_V2_SETTLEMENT_FACTORY_INTERFACE_ID =
  '#splice-api-token-allocation-v2:Splice.Api.Token.AllocationV2:SettlementFactory';

export const TokenStandardV2SettlementFactoryErrorCode = {
  INPUT_INVALID: 'TOKEN_STANDARD_V2_SETTLEMENT_FACTORY_INPUT_INVALID',
  NOT_FOUND: 'TOKEN_STANDARD_V2_SETTLEMENT_FACTORY_NOT_FOUND',
  AMBIGUOUS: 'TOKEN_STANDARD_V2_SETTLEMENT_FACTORY_AMBIGUOUS',
  ACS_ENTRY_INVALID: 'TOKEN_STANDARD_V2_SETTLEMENT_FACTORY_ACS_ENTRY_INVALID',
} as const;

export type TokenStandardV2SettlementFactoryErrorCode =
  (typeof TokenStandardV2SettlementFactoryErrorCode)[keyof typeof TokenStandardV2SettlementFactoryErrorCode];

/** Typed failure raised while resolving a Token Standard V2 SettlementFactory. */
export class TokenStandardV2SettlementFactoryError extends CantonError {
  public override readonly name = 'TokenStandardV2SettlementFactoryError';

  constructor(code: TokenStandardV2SettlementFactoryErrorCode, message: string, context?: ErrorContext) {
    super(message, code, context);
  }
}

export interface TokenStandardV2SettlementFactoryView {
  readonly admin: string;
  readonly meta: TokenStandardV2Metadata;
}

export interface ResolvedTokenStandardV2SettlementFactory {
  readonly contractId: string;
  readonly synchronizerId: string;
  readonly view: TokenStandardV2SettlementFactoryView;
}

export interface TokenStandardV2ActiveContractsQuery {
  readonly parties: string[];
  readonly interfaceIds: string[];
  readonly includeInterfaceView: boolean;
  readonly includeCreatedEventBlob: boolean;
  readonly activeAtOffset?: number;
}

/** Minimal Ledger JSON API surface needed by the resolver. */
export interface TokenStandardV2ActiveContractsClient {
  getActiveContracts(params: TokenStandardV2ActiveContractsQuery): Promise<readonly unknown[]>;
}

export interface ResolveTokenStandardV2SettlementFactoryParams {
  readonly ledger: TokenStandardV2ActiveContractsClient;
  readonly parties: readonly string[];
  readonly admin: string;
  readonly synchronizerId?: string;
  readonly activeAtOffset?: number;
}

function inputInvalid(message: string, context: ErrorContext): never {
  throw new TokenStandardV2SettlementFactoryError(
    TokenStandardV2SettlementFactoryErrorCode.INPUT_INVALID,
    message,
    context
  );
}

function acsEntryInvalid(message: string, entryIndex: number, context: ErrorContext = {}): never {
  throw new TokenStandardV2SettlementFactoryError(
    TokenStandardV2SettlementFactoryErrorCode.ACS_ENTRY_INVALID,
    message,
    { entryIndex, ...context }
  );
}

function normalizeParties(parties: readonly string[]): string[] {
  if (!Array.isArray(parties)) {
    inputInvalid('parties must be an array of explicit read parties.', { field: 'parties' });
  }

  const normalized = new Set<string>();
  for (const [index, party] of parties.entries()) {
    if (typeof party !== 'string') {
      inputInvalid('parties must contain only strings.', { field: 'parties', index });
    }
    const value = party.trim();
    if (value.length > 0) normalized.add(value);
  }

  if (normalized.size === 0) {
    inputInvalid('parties must contain at least one read party.', { field: 'parties' });
  }
  return [...normalized];
}

function normalizeRequiredString(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    inputInvalid(`${field} must be a non-empty string.`, { field });
  }
  return value.trim();
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

function identifierModuleEntitySuffix(identifier: string): string | undefined {
  const separator = identifier.indexOf(':');
  return separator === -1 ? undefined : identifier.slice(separator + 1);
}

function isSettlementFactoryInterfaceId(interfaceId: string): boolean {
  return (
    identifierModuleEntitySuffix(interfaceId) ===
    identifierModuleEntitySuffix(TOKEN_STANDARD_V2_SETTLEMENT_FACTORY_INTERFACE_ID)
  );
}

function readViewStatus(view: Readonly<Record<string, unknown>>, entryIndex: number, contractId: string): void {
  const status = view['viewStatus'];
  if (!isRecord(status) || typeof status['code'] !== 'number' || typeof status['message'] !== 'string') {
    acsEntryInvalid('SettlementFactory interface view is missing a valid view status.', entryIndex, {
      contractId,
    });
  }
  if (status['details'] !== undefined && !Array.isArray(status['details'])) {
    acsEntryInvalid('SettlementFactory interface view has malformed status details.', entryIndex, {
      contractId,
    });
  }
  if (status['code'] !== 0) {
    acsEntryInvalid('SettlementFactory interface view could not be computed successfully.', entryIndex, {
      contractId,
      viewStatus: status,
    });
  }
}

function decodeSettlementFactoryView(
  value: unknown,
  entryIndex: number,
  contractId: string
): TokenStandardV2SettlementFactoryView {
  if (!isRecord(value) || !isNonEmptyString(value['admin'])) {
    acsEntryInvalid('SettlementFactory interface view is missing a valid admin.', entryIndex, { contractId });
  }

  const { admin, meta } = value;
  const values = isRecord(meta) ? meta['values'] : undefined;
  if (!isRecord(values)) {
    acsEntryInvalid('SettlementFactory interface view is missing valid metadata.', entryIndex, { contractId });
  }

  const decodedValues: Record<string, string> = {};
  for (const [key, metadataValue] of Object.entries(values)) {
    if (typeof metadataValue !== 'string') {
      acsEntryInvalid('SettlementFactory interface view is missing valid metadata.', entryIndex, { contractId });
    }
    decodedValues[key] = metadataValue;
  }

  return {
    admin: admin.trim(),
    meta: {
      values: decodedValues,
    },
  };
}

function readCandidate(params: {
  readonly item: unknown;
  readonly entryIndex: number;
  readonly admin: string;
  readonly synchronizerId?: string;
}): ResolvedTokenStandardV2SettlementFactory | undefined {
  if (!isRecord(params.item) || !isRecord(params.item['contractEntry'])) {
    acsEntryInvalid('Active-contract response row is missing contractEntry.', params.entryIndex);
  }

  const { contractEntry } = params.item;
  const entryKinds = Object.keys(contractEntry);
  if (entryKinds.length !== 1 || entryKinds[0] !== 'JsActiveContract') {
    acsEntryInvalid('Expected a complete JsActiveContract entry.', params.entryIndex, { entryKinds });
  }

  const activeContract = contractEntry['JsActiveContract'];
  if (!isRecord(activeContract) || !isNonEmptyString(activeContract['synchronizerId'])) {
    acsEntryInvalid('JsActiveContract is missing a valid synchronizerId.', params.entryIndex);
  }
  const { synchronizerId } = activeContract;

  // A failed view on another synchronizer must not poison resolution on the requested synchronizer.
  if (params.synchronizerId !== undefined && synchronizerId !== params.synchronizerId) {
    return undefined;
  }

  const { createdEvent } = activeContract;
  if (!isRecord(createdEvent) || !isNonEmptyString(createdEvent['contractId'])) {
    acsEntryInvalid('JsActiveContract is missing a valid created event or contract id.', params.entryIndex);
  }
  const { contractId, interfaceViews } = createdEvent;
  if (!Array.isArray(interfaceViews)) {
    acsEntryInvalid('SettlementFactory active contract is missing interface views.', params.entryIndex, { contractId });
  }

  const matchingViews: Array<Readonly<Record<string, unknown>>> = [];
  for (const interfaceView of interfaceViews) {
    if (!isRecord(interfaceView) || !isNonEmptyString(interfaceView['interfaceId'])) {
      acsEntryInvalid('Active contract contains a malformed interface view.', params.entryIndex, { contractId });
    }
    if (isSettlementFactoryInterfaceId(interfaceView['interfaceId'])) matchingViews.push(interfaceView);
  }
  if (matchingViews.length !== 1) {
    acsEntryInvalid('Active contract must contain exactly one SettlementFactory interface view.', params.entryIndex, {
      contractId,
      matchingViewCount: matchingViews.length,
    });
  }

  const interfaceView = matchingViews[0];
  if (!interfaceView) {
    acsEntryInvalid('SettlementFactory interface view is missing.', params.entryIndex, { contractId });
  }
  readViewStatus(interfaceView, params.entryIndex, contractId);
  const view = decodeSettlementFactoryView(interfaceView['viewValue'], params.entryIndex, contractId);
  if (view.admin !== params.admin) return undefined;

  return { contractId, synchronizerId, view };
}

function viewsEqual(left: TokenStandardV2SettlementFactoryView, right: TokenStandardV2SettlementFactoryView): boolean {
  if (left.admin !== right.admin) return false;
  const leftEntries = Object.entries(left.meta.values);
  const rightValues = right.meta.values;
  return (
    leftEntries.length === Object.keys(rightValues).length &&
    leftEntries.every(([key, value]) => value === rightValues[key])
  );
}

/**
 * Resolve the one visible Token Standard V2 SettlementFactory for an admin and optional synchronizer.
 *
 * An empty result means the factory is not visible to the explicit read parties. Resolution never substitutes an
 * AllocationFactory contract id or consults a registry URL.
 */
export async function resolveTokenStandardV2SettlementFactory(
  params: ResolveTokenStandardV2SettlementFactoryParams
): Promise<ResolvedTokenStandardV2SettlementFactory> {
  if (!isRecord(params.ledger) || typeof params.ledger.getActiveContracts !== 'function') {
    inputInvalid('ledger must provide getActiveContracts.', { field: 'ledger' });
  }
  const parties = normalizeParties(params.parties);
  const admin = normalizeRequiredString(params.admin, 'admin');
  const synchronizerId =
    params.synchronizerId === undefined ? undefined : normalizeRequiredString(params.synchronizerId, 'synchronizerId');
  const activeAtOffset = normalizeActiveAtOffset(params.activeAtOffset);

  const response = await params.ledger.getActiveContracts({
    parties,
    interfaceIds: [TOKEN_STANDARD_V2_SETTLEMENT_FACTORY_INTERFACE_ID],
    includeInterfaceView: true,
    includeCreatedEventBlob: false,
    ...(activeAtOffset === undefined ? {} : { activeAtOffset }),
  });

  const matches = new Map<string, ResolvedTokenStandardV2SettlementFactory>();
  for (const [entryIndex, item] of response.entries()) {
    const candidate = readCandidate({
      item,
      entryIndex,
      admin,
      ...(synchronizerId === undefined ? {} : { synchronizerId }),
    });
    if (!candidate) continue;

    const duplicate = matches.get(candidate.contractId);
    if (
      duplicate &&
      (duplicate.synchronizerId !== candidate.synchronizerId || !viewsEqual(duplicate.view, candidate.view))
    ) {
      acsEntryInvalid('Duplicate contract visibility returned inconsistent SettlementFactory data.', entryIndex, {
        contractId: candidate.contractId,
      });
    }
    if (!duplicate) matches.set(candidate.contractId, candidate);
  }

  if (matches.size === 0) {
    throw new TokenStandardV2SettlementFactoryError(
      TokenStandardV2SettlementFactoryErrorCode.NOT_FOUND,
      'No visible Token Standard V2 SettlementFactory matches the requested admin and synchronizer.',
      { admin, parties, ...(synchronizerId === undefined ? {} : { synchronizerId }) }
    );
  }

  if (matches.size > 1) {
    const candidates = [...matches.values()]
      .map(({ contractId, synchronizerId: candidateSynchronizerId }) => ({
        contractId,
        synchronizerId: candidateSynchronizerId,
      }))
      .sort((left, right) => left.contractId.localeCompare(right.contractId));
    throw new TokenStandardV2SettlementFactoryError(
      TokenStandardV2SettlementFactoryErrorCode.AMBIGUOUS,
      'Multiple visible Token Standard V2 SettlementFactory contracts match the requested admin and synchronizer.',
      { admin, candidates, ...(synchronizerId === undefined ? {} : { synchronizerId }) }
    );
  }

  const [resolved] = matches.values();
  if (!resolved) {
    throw new Error('SettlementFactory match invariant violated.');
  }
  return resolved;
}
