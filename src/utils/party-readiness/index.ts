import { OperationError, OperationErrorCode, ValidationError } from '../../core/errors';
import { isRecord } from '../../core/utils';

export interface PartySynchronizerReadinessLedgerClient {
  readonly getConnectedSynchronizers: (params: {
    readonly party: string;
    readonly participantId?: string;
  }) => Promise<unknown>;
}

export interface CantonConnectedSynchronizer {
  readonly synchronizerId: string;
  readonly synchronizerAlias?: string;
  readonly permission?: string;
  readonly raw: unknown;
}

export interface PartyConnectedSynchronizers {
  readonly party: string;
  readonly synchronizerIds: readonly string[];
  readonly synchronizers: readonly CantonConnectedSynchronizer[];
  readonly raw: unknown;
}

export interface ListConnectedSynchronizerIdsOptions {
  readonly ledgerClient: PartySynchronizerReadinessLedgerClient;
  readonly party: string;
  readonly participantId?: string;
}

export interface PartySynchronizerReadinessOptions extends ListConnectedSynchronizerIdsOptions {
  readonly synchronizerId: string;
}

export interface PartySynchronizerReadiness {
  readonly party: string;
  readonly synchronizerId: string;
  readonly ready: boolean;
  readonly connected: boolean;
  readonly canSubmit: boolean;
  readonly connectedSynchronizerIds: readonly string[];
  readonly matchedSynchronizer?: CantonConnectedSynchronizer;
  readonly reason?: 'not-connected' | 'not-submit-capable';
  readonly raw: unknown;
}

export interface ResolveCommonSynchronizerIdsOptions {
  readonly ledgerClient: PartySynchronizerReadinessLedgerClient;
  readonly parties: readonly string[];
  readonly participantId?: string;
  /** When true, ignore connected synchronizers whose permission is explicitly observation-only. */
  readonly requireSubmitPermission?: boolean;
}

export interface CommonPartySynchronizers {
  readonly parties: readonly string[];
  readonly synchronizerIds: readonly string[];
  readonly partySynchronizers: readonly PartyConnectedSynchronizers[];
}

export interface AssertCommonSynchronizerReadyOptions extends ResolveCommonSynchronizerIdsOptions {
  readonly synchronizerId?: string;
}

export interface CommonPartySynchronizerReadiness extends CommonPartySynchronizers {
  readonly synchronizerId: string;
}

export interface ResolveActiveSubmissionSynchronizerOptions {
  readonly ledgerClient: PartySynchronizerReadinessLedgerClient;
  readonly anchorParty: string;
  readonly parties?: readonly string[];
  readonly participantId?: string;
}

export interface WaitForPartyCanSubmitOptions extends PartySynchronizerReadinessOptions {
  readonly delaysMs?: readonly number[];
  readonly onCheckError?: (
    error: unknown,
    context: {
      readonly party: string;
      readonly synchronizerId: string;
      readonly delayMs: number;
      readonly attempt: number;
    }
  ) => void | Promise<void>;
}

export async function listConnectedSynchronizerIds(
  options: ListConnectedSynchronizerIdsOptions
): Promise<PartyConnectedSynchronizers> {
  const party = validateRequiredString('party', options.party);
  const participantId =
    options.participantId === undefined ? undefined : validateRequiredString('participantId', options.participantId);
  const raw = await options.ledgerClient.getConnectedSynchronizers({
    party,
    ...(participantId !== undefined ? { participantId } : {}),
  });
  const synchronizers = readConnectedSynchronizers(raw);

  return {
    party,
    synchronizerIds: synchronizers.map((synchronizer) => synchronizer.synchronizerId),
    synchronizers,
    raw,
  };
}

export async function checkPartySynchronizerReadiness(
  options: PartySynchronizerReadinessOptions
): Promise<PartySynchronizerReadiness> {
  const synchronizerId = validateRequiredString('synchronizerId', options.synchronizerId);
  const connected = await listConnectedSynchronizerIds(options);
  const matchedSynchronizer = connected.synchronizers.find(
    (synchronizer) => synchronizer.synchronizerId === synchronizerId
  );
  const isConnected = matchedSynchronizer !== undefined;
  const canSubmit = matchedSynchronizer ? canSubmitWithPermission(matchedSynchronizer.permission) : false;
  const ready = isConnected && canSubmit;

  return {
    party: connected.party,
    synchronizerId,
    ready,
    connected: isConnected,
    canSubmit,
    connectedSynchronizerIds: connected.synchronizerIds,
    ...(matchedSynchronizer !== undefined ? { matchedSynchronizer } : {}),
    ...(!isConnected
      ? { reason: 'not-connected' as const }
      : !canSubmit
        ? { reason: 'not-submit-capable' as const }
        : {}),
    raw: connected.raw,
  };
}

export async function partyCanSubmitOnSynchronizer(options: PartySynchronizerReadinessOptions): Promise<boolean> {
  return (await checkPartySynchronizerReadiness(options)).ready;
}

export async function assertPartySynchronizerReady(
  options: PartySynchronizerReadinessOptions
): Promise<PartySynchronizerReadiness> {
  const readiness = await checkPartySynchronizerReadiness(options);
  if (readiness.ready) return readiness;

  throw new OperationError(
    readiness.connected
      ? 'Canton party is connected to the synchronizer without submit permission'
      : 'Canton party is not connected to the synchronizer',
    OperationErrorCode.MISSING_DOMAIN_ID,
    {
      party: readiness.party,
      synchronizerId: readiness.synchronizerId,
      connectedSynchronizerIds: readiness.connectedSynchronizerIds,
      ...(readiness.matchedSynchronizer?.permission ? { permission: readiness.matchedSynchronizer.permission } : {}),
      reason: readiness.reason,
    }
  );
}

export async function resolveCommonSynchronizerIds(
  options: ResolveCommonSynchronizerIdsOptions
): Promise<CommonPartySynchronizers> {
  const parties = normalizePartyList(options.parties);
  const partySynchronizers = await Promise.all(
    parties.map(async (party) =>
      listConnectedSynchronizerIds({
        ledgerClient: options.ledgerClient,
        party,
        ...(options.participantId !== undefined ? { participantId: options.participantId } : {}),
      })
    )
  );
  const commonIds = intersectSynchronizerIds(
    partySynchronizers.map((partyResult) =>
      options.requireSubmitPermission === false
        ? partyResult.synchronizers
        : partyResult.synchronizers.filter((synchronizer) => canSubmitWithPermission(synchronizer.permission))
    )
  );

  return {
    parties,
    synchronizerIds: commonIds,
    partySynchronizers,
  };
}

export async function assertCommonSynchronizerReady(
  options: AssertCommonSynchronizerReadyOptions
): Promise<CommonPartySynchronizerReadiness> {
  const common = await resolveCommonSynchronizerIds(options);
  const synchronizerId =
    options.synchronizerId === undefined
      ? common.synchronizerIds[0]
      : validateRequiredString('synchronizerId', options.synchronizerId);

  if (!synchronizerId) {
    throw new OperationError(
      'Canton parties do not share a connected synchronizer',
      OperationErrorCode.MISSING_DOMAIN_ID,
      {
        parties: common.parties,
        partySynchronizers: common.partySynchronizers.map((partyResult) => ({
          party: partyResult.party,
          synchronizerIds: partyResult.synchronizerIds,
        })),
      }
    );
  }

  const missingParties = common.partySynchronizers
    .filter((partyResult) => !partyResult.synchronizerIds.includes(synchronizerId))
    .map((partyResult) => partyResult.party);
  const nonSubmitParties =
    options.requireSubmitPermission === false
      ? []
      : common.partySynchronizers
          .filter((partyResult) => {
            const match = partyResult.synchronizers.find(
              (synchronizer) => synchronizer.synchronizerId === synchronizerId
            );
            return match !== undefined && !canSubmitWithPermission(match.permission);
          })
          .map((partyResult) => partyResult.party);

  if (missingParties.length > 0 || nonSubmitParties.length > 0) {
    throw new OperationError(
      'Canton parties are not ready on the requested synchronizer',
      OperationErrorCode.MISSING_DOMAIN_ID,
      {
        parties: common.parties,
        synchronizerId,
        missingParties,
        nonSubmitParties,
        partySynchronizers: common.partySynchronizers.map((partyResult) => ({
          party: partyResult.party,
          synchronizerIds: partyResult.synchronizerIds,
        })),
      }
    );
  }

  return {
    ...common,
    synchronizerId,
  };
}

export async function resolveActiveSubmissionSynchronizer(
  options: ResolveActiveSubmissionSynchronizerOptions
): Promise<string> {
  const anchorParty = validateRequiredString('anchorParty', options.anchorParty);
  const parties = normalizeOptionalPartyList(options.parties);
  const participantId =
    options.participantId === undefined ? undefined : validateRequiredString('participantId', options.participantId);
  const anchorSynchronizers = await listConnectedSynchronizerIds({
    ledgerClient: options.ledgerClient,
    party: anchorParty,
    ...(participantId !== undefined ? { participantId } : {}),
  });
  const anchorSubmissionSynchronizerIds = anchorSynchronizers.synchronizers
    .filter((synchronizer) => canSubmitWithPermission(synchronizer.permission))
    .map((synchronizer) => synchronizer.synchronizerId);

  if (anchorSubmissionSynchronizerIds.length === 0) {
    throw new OperationError(
      'Canton anchor party is not connected to a submission-capable synchronizer',
      OperationErrorCode.MISSING_DOMAIN_ID,
      {
        anchorParty,
        connectedSynchronizerIds: anchorSynchronizers.synchronizerIds,
      }
    );
  }

  const uniqueParties = parties.filter((party) => party !== anchorParty);
  const partySynchronizers = await Promise.all(
    uniqueParties.map(async (party) =>
      listConnectedSynchronizerIds({
        ledgerClient: options.ledgerClient,
        party,
        ...(participantId !== undefined ? { participantId } : {}),
      })
    )
  );
  const partySubmissionSynchronizerIdSets = partySynchronizers.map(
    (partyResult) =>
      new Set(
        partyResult.synchronizers
          .filter((synchronizer) => canSubmitWithPermission(synchronizer.permission))
          .map((synchronizer) => synchronizer.synchronizerId)
      )
  );
  const synchronizerId = anchorSubmissionSynchronizerIds.find((candidate) =>
    partySubmissionSynchronizerIdSets.every((ids) => ids.has(candidate))
  );

  if (!synchronizerId) {
    throw new OperationError(
      'Canton parties do not share a submission-capable synchronizer with the anchor party',
      OperationErrorCode.MISSING_DOMAIN_ID,
      {
        anchorParty,
        parties,
        anchorSynchronizerIds: anchorSynchronizers.synchronizerIds,
        partySynchronizers: partySynchronizers.map((partyResult) => ({
          party: partyResult.party,
          synchronizerIds: partyResult.synchronizerIds,
        })),
      }
    );
  }

  return synchronizerId;
}

export async function waitForPartyCanSubmit(options: WaitForPartyCanSubmitOptions): Promise<boolean> {
  const party = validateRequiredString('party', options.party);
  const synchronizerId = validateRequiredString('synchronizerId', options.synchronizerId);
  const delaysMs = normalizeWaitDelays(options.delaysMs);

  for (let attempt = 0; attempt < delaysMs.length; attempt += 1) {
    const delayMs = delaysMs[attempt] ?? 0;
    if (delayMs > 0) await delay(delayMs);
    try {
      if (
        await partyCanSubmitOnSynchronizer({
          ledgerClient: options.ledgerClient,
          party,
          synchronizerId,
          ...(options.participantId !== undefined ? { participantId: options.participantId } : {}),
        })
      ) {
        return true;
      }
    } catch (error) {
      await options.onCheckError?.(error, {
        party,
        synchronizerId,
        delayMs,
        attempt,
      });
    }
  }

  return false;
}

export function assertSingleConnectedSynchronizerId(raw: unknown): string {
  const synchronizerId = readSingleConnectedSynchronizerId(raw);
  if (synchronizerId) return synchronizerId;
  throw new OperationError(
    'Canton party did not report a connected synchronizer',
    OperationErrorCode.MISSING_DOMAIN_ID
  );
}

export function readSingleConnectedSynchronizerId(raw: unknown): string | null {
  const synchronizerIds = readConnectedSynchronizers(raw).map((synchronizer) => synchronizer.synchronizerId);
  const uniqueSynchronizerIds = [...new Set(synchronizerIds)];
  if (uniqueSynchronizerIds.length > 1) {
    throw new OperationError(
      'Canton party reported multiple connected synchronizers',
      OperationErrorCode.MISSING_DOMAIN_ID,
      { synchronizerIds }
    );
  }
  return uniqueSynchronizerIds[0] ?? null;
}

export function readConnectedSynchronizers(raw: unknown): readonly CantonConnectedSynchronizer[] {
  const items = readConnectedSynchronizerItems(raw);
  const synchronizers: CantonConnectedSynchronizer[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const synchronizer = readConnectedSynchronizer(item);
    if (!synchronizer || seen.has(synchronizer.synchronizerId)) continue;
    seen.add(synchronizer.synchronizerId);
    synchronizers.push(synchronizer);
  }

  return synchronizers;
}

export function canSubmitWithPermission(permission: string | null | undefined): boolean {
  if (!permission?.trim()) return true;
  const normalized = normalizePermission(permission);
  if (normalized.includes('observation') || normalized.includes('observer')) return false;
  return normalized.includes('submission') || normalized.includes('confirmation');
}

function readConnectedSynchronizerItems(raw: unknown): readonly unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!isRecord(raw)) return [];
  for (const key of ['connectedSynchronizers', 'connected_synchronizers', 'items', 'synchronizers']) {
    const value = raw[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function readConnectedSynchronizer(item: unknown): CantonConnectedSynchronizer | null {
  if (typeof item === 'string' && item.trim()) {
    return {
      synchronizerId: item.trim(),
      raw: item,
    };
  }
  if (!isRecord(item)) return null;

  const synchronizerId = readFirstString(item, [
    'synchronizerId',
    'synchronizer_id',
    'synchronizer',
    'domainId',
    'domain_id',
    'id',
  ]);
  if (!synchronizerId) return null;
  const synchronizerAlias = readFirstString(item, ['synchronizerAlias', 'synchronizer_alias', 'alias']);
  const permission = readFirstString(item, ['permission', 'participantPermission', 'participant_permission']);

  return {
    synchronizerId,
    ...(synchronizerAlias ? { synchronizerAlias } : {}),
    ...(permission ? { permission } : {}),
    raw: item,
  };
}

function normalizePartyList(parties: readonly string[]): readonly string[] {
  const normalized = [...new Set(parties.map((party) => validateRequiredString('parties', party)))];
  if (normalized.length === 0) {
    throw new ValidationError('parties must include at least one party');
  }
  return normalized;
}

function normalizeOptionalPartyList(parties: readonly string[] | undefined): readonly string[] {
  if (parties === undefined) return [];
  return [...new Set(parties.map((party) => validateRequiredString('parties', party)))];
}

function intersectSynchronizerIds(synchronizerGroups: ReadonlyArray<readonly CantonConnectedSynchronizer[]>): string[] {
  const [firstGroup, ...restGroups] = synchronizerGroups;
  if (!firstGroup) return [];
  const common = new Set(firstGroup.map((synchronizer) => synchronizer.synchronizerId));

  for (const group of restGroups) {
    const groupIds = new Set(group.map((synchronizer) => synchronizer.synchronizerId));
    for (const synchronizerId of [...common]) {
      if (!groupIds.has(synchronizerId)) common.delete(synchronizerId);
    }
  }

  return [...common].sort();
}

function normalizeWaitDelays(delaysMs: readonly number[] | undefined): readonly number[] {
  const delays = delaysMs ?? [0, 1_000, 2_000, 4_000];
  if (delays.length === 0) {
    throw new ValidationError('delaysMs must include at least one delay');
  }
  for (const delayMs of delays) {
    if (!Number.isSafeInteger(delayMs) || delayMs < 0) {
      throw new ValidationError('delaysMs entries must be non-negative safe integers', { delayMs });
    }
  }
  return delays;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateRequiredString(name: string, value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new ValidationError(`${name} is required`, { [name]: value });
  }
  return normalized;
}

function readFirstString(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function normalizePermission(permission: string): string {
  return permission.toLowerCase().replace(/[^a-z]/g, '');
}
