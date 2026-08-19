import { CantonError, type ErrorContext } from '../../core/errors';
import { isRecord, isString } from '../../core/utils';

export interface ParsedTemplateId {
  readonly packageId: string;
  readonly module: string;
  readonly templateName: string;
}

export interface ParsedCreatedEvent {
  readonly contractId: string;
  readonly templateId: string;
  readonly packageName?: string;
  readonly createArgument: Readonly<Record<string, unknown>>;
  readonly contractKey?: unknown;
  readonly witnessParties?: readonly string[];
  readonly signatories?: readonly string[];
  readonly observers?: readonly string[];
  readonly offset?: number;
  readonly nodeId?: number;
  readonly createdEventBlob?: string;
  readonly createdAt?: string;
  readonly interfaceViews?: readonly string[];
  readonly implementedInterfaces?: readonly string[];
  readonly synchronizerId?: string;
}

export interface ParsedArchivedEvent {
  readonly contractId: string;
  readonly templateId: string;
  readonly packageName?: string;
  readonly witnessParties?: readonly string[];
  readonly offset?: number;
  readonly nodeId?: number;
  readonly implementedInterfaces?: readonly string[];
  readonly synchronizerId?: string;
}

export interface ParsedExercisedEvent {
  readonly contractId: string;
  readonly templateId: string;
  readonly choice: string;
  readonly packageName?: string;
  readonly interfaceId?: string | null;
  readonly exerciseArgument?: unknown;
  readonly exerciseResult?: unknown;
  readonly actingParties?: readonly string[];
  readonly witnessParties?: readonly string[];
  readonly consuming?: boolean;
  readonly offset?: number;
  readonly nodeId?: number;
  readonly lastDescendantNodeId?: number;
  readonly implementedInterfaces?: readonly string[];
  readonly synchronizerId?: string;
}

export interface ParsedTransactionEvents {
  readonly created: ParsedCreatedEvent[];
  readonly archived: ParsedArchivedEvent[];
  readonly exercised: ParsedExercisedEvent[];
}

type EventVariant = 'created' | 'archived' | 'exercised';
type Mutable<T> = { -readonly [P in keyof T]: T[P] };

const VARIANT_KEYS: Record<EventVariant, readonly string[]> = {
  created: ['CreatedTreeEvent', 'CreatedEvent', 'createdEvent'],
  archived: ['ArchivedTreeEvent', 'ArchivedEvent', 'archivedEvent'],
  exercised: ['ExercisedTreeEvent', 'ExercisedEvent', 'exercisedEvent'],
};

function readString(value: unknown): string | undefined {
  return isString(value) ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readStringArray(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every(isString) ? value : undefined;
}

function readRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function readNullableString(value: unknown): string | null | undefined {
  return value === null || isString(value) ? value : undefined;
}

function unwrapVariant(event: unknown, variant: EventVariant): Readonly<Record<string, unknown>> | null {
  if (!isRecord(event)) return null;

  for (const key of VARIANT_KEYS[variant]) {
    const wrapper = event[key];
    if (!isRecord(wrapper)) continue;
    const { value } = wrapper;
    return readRecord(value) ?? wrapper;
  }

  return null;
}

function readSynchronizerId(event: unknown): string | undefined {
  if (!isRecord(event)) return undefined;
  return readString(event['synchronizerId']);
}

export function parseTemplateId(templateId: string): ParsedTemplateId {
  const parts = templateId.split(':');
  if (parts.length < 3 || parts.some((part) => part.length === 0)) {
    throw new Error(`Invalid templateId: ${templateId}`);
  }

  return {
    packageId: parts[0] as string,
    module: parts.slice(1, -1).join(':'),
    templateName: parts[parts.length - 1] as string,
  };
}

export function hasTemplateName(templateId: string, expectedTemplateName: string): boolean {
  try {
    return parseTemplateId(templateId).templateName === expectedTemplateName;
  } catch {
    return false;
  }
}

/** The `Module:Template` part of a template id, dropping the leading package id or `#package-name`. */
export function qualifiedTemplateName(templateId: string): string {
  const firstColon = templateId.indexOf(':');
  return firstColon === -1 ? templateId : templateId.slice(firstColon + 1);
}

/**
 * Match a template id from a ledger event against a filter, ignoring the package component.
 *
 * A create event always names the package _id_ that produced it, which a caller cannot know in advance; a filter is
 * usually written with a package _name_ (`#MyPackage:Module:Template`) or without a package at all (`Module:Template`,
 * or just `Template`). All three forms match here.
 */
export function matchesTemplateId(templateId: string, filter: string): boolean {
  if (templateId === filter) return true;

  const idSuffix = templateId.split(':').slice(1);
  if (idSuffix.length === 0) return false;

  const filterParts = filter.split(':');
  const filterSuffix = filterParts.length > idSuffix.length ? filterParts.slice(1) : filterParts;
  if (filterSuffix.length === 0 || filterSuffix.length > idSuffix.length) return false;

  const offset = idSuffix.length - filterSuffix.length;
  return filterSuffix.every((part, index) => part === idSuffix[offset + index]);
}

export function parseCreatedEvent(event: unknown): ParsedCreatedEvent | null {
  const value = unwrapVariant(event, 'created');
  if (!value) return null;

  const contractId = readString(value['contractId']);
  const templateId = readString(value['templateId']);
  if (!contractId || !templateId) return null;

  const result: Mutable<ParsedCreatedEvent> = {
    contractId,
    templateId,
    createArgument: readRecord(value['createArgument']) ?? readRecord(value['createArguments']) ?? {},
  };
  const packageName = readString(value['packageName']);
  const witnessParties = readStringArray(value['witnessParties']);
  const signatories = readStringArray(value['signatories']);
  const observers = readStringArray(value['observers']);
  const offset = readNumber(value['offset']);
  const nodeId = readNumber(value['nodeId']);
  const createdEventBlob = readString(value['createdEventBlob']);
  const createdAt = readString(value['createdAt']);
  const interfaceViews = readStringArray(value['interfaceViews']);
  const implementedInterfaces = readStringArray(value['implementedInterfaces']);
  const synchronizerId = readSynchronizerId(event);

  if (packageName !== undefined) result.packageName = packageName;
  if (value['contractKey'] !== undefined) result.contractKey = value['contractKey'];
  if (witnessParties !== undefined) result.witnessParties = witnessParties;
  if (signatories !== undefined) result.signatories = signatories;
  if (observers !== undefined) result.observers = observers;
  if (offset !== undefined) result.offset = offset;
  if (nodeId !== undefined) result.nodeId = nodeId;
  if (createdEventBlob !== undefined) result.createdEventBlob = createdEventBlob;
  if (createdAt !== undefined) result.createdAt = createdAt;
  if (interfaceViews !== undefined) result.interfaceViews = interfaceViews;
  if (implementedInterfaces !== undefined) result.implementedInterfaces = implementedInterfaces;
  if (synchronizerId !== undefined) result.synchronizerId = synchronizerId;

  return result;
}

export function parseArchivedEvent(event: unknown): ParsedArchivedEvent | null {
  const value = unwrapVariant(event, 'archived');
  if (!value) return null;

  const contractId = readString(value['contractId']);
  const templateId = readString(value['templateId']);
  if (!contractId || !templateId) return null;

  const result: Mutable<ParsedArchivedEvent> = {
    contractId,
    templateId,
  };
  const packageName = readString(value['packageName']);
  const witnessParties = readStringArray(value['witnessParties']);
  const offset = readNumber(value['offset']);
  const nodeId = readNumber(value['nodeId']);
  const implementedInterfaces = readStringArray(value['implementedInterfaces']);
  const synchronizerId = readSynchronizerId(event);

  if (packageName !== undefined) result.packageName = packageName;
  if (witnessParties !== undefined) result.witnessParties = witnessParties;
  if (offset !== undefined) result.offset = offset;
  if (nodeId !== undefined) result.nodeId = nodeId;
  if (implementedInterfaces !== undefined) result.implementedInterfaces = implementedInterfaces;
  if (synchronizerId !== undefined) result.synchronizerId = synchronizerId;

  return result;
}

export function parseExercisedEvent(event: unknown): ParsedExercisedEvent | null {
  const value = unwrapVariant(event, 'exercised');
  if (!value) return null;

  const contractId = readString(value['contractId']);
  const templateId = readString(value['templateId']);
  const choice = readString(value['choice']);
  if (!contractId || !templateId || !choice) return null;

  const result: Mutable<ParsedExercisedEvent> = {
    contractId,
    templateId,
    choice,
  };
  const packageName = readString(value['packageName']);
  const interfaceId = readNullableString(value['interfaceId']);
  const exerciseArgument =
    value['exerciseArgument'] !== undefined ? value['exerciseArgument'] : value['choiceArgument'];
  const { exerciseResult } = value;
  const actingParties = readStringArray(value['actingParties']);
  const witnessParties = readStringArray(value['witnessParties']);
  const consuming = readBoolean(value['consuming']);
  const offset = readNumber(value['offset']);
  const nodeId = readNumber(value['nodeId']);
  const lastDescendantNodeId = readNumber(value['lastDescendantNodeId']);
  const implementedInterfaces = readStringArray(value['implementedInterfaces']);
  const synchronizerId = readSynchronizerId(event);

  if (packageName !== undefined) result.packageName = packageName;
  if (interfaceId !== undefined) result.interfaceId = interfaceId;
  if (exerciseArgument !== undefined) result.exerciseArgument = exerciseArgument;
  if (exerciseResult !== undefined) result.exerciseResult = exerciseResult;
  if (actingParties !== undefined) result.actingParties = actingParties;
  if (witnessParties !== undefined) result.witnessParties = witnessParties;
  if (consuming !== undefined) result.consuming = consuming;
  if (offset !== undefined) result.offset = offset;
  if (nodeId !== undefined) result.nodeId = nodeId;
  if (lastDescendantNodeId !== undefined) result.lastDescendantNodeId = lastDescendantNodeId;
  if (implementedInterfaces !== undefined) result.implementedInterfaces = implementedInterfaces;
  if (synchronizerId !== undefined) result.synchronizerId = synchronizerId;

  return result;
}

function getNestedRecord(value: unknown, path: readonly string[]): Readonly<Record<string, unknown>> | null {
  let current = value;
  for (const segment of path) {
    if (!isRecord(current)) return null;
    current = current[segment];
  }
  return readRecord(current) ?? null;
}

function getNestedArray(value: unknown, path: readonly string[]): readonly unknown[] | null {
  let current = value;
  for (const segment of path) {
    if (!isRecord(current)) return null;
    current = current[segment];
  }
  return Array.isArray(current) ? current : null;
}

function getEventsById(transaction: unknown): Readonly<Record<string, unknown>> | null {
  const paths: ReadonlyArray<readonly string[]> = [
    ['eventsById'],
    ['eventTree'],
    ['transactionTree', 'eventsById'],
    ['transactionTree', 'eventTree'],
    ['transaction', 'eventsById'],
    ['transaction', 'eventTree'],
  ];

  for (const path of paths) {
    const eventsById = getNestedRecord(transaction, path);
    if (eventsById && Object.keys(eventsById).length > 0) return eventsById;
  }

  return null;
}

function getEventArray(transaction: unknown): readonly unknown[] | null {
  if (Array.isArray(transaction)) return transaction;

  const paths: ReadonlyArray<readonly string[]> = [
    ['events'],
    ['transactionTree', 'events'],
    ['transaction', 'events'],
  ];

  for (const path of paths) {
    const events = getNestedArray(transaction, path);
    if (events) return events;
  }

  return null;
}

/** Node ids are numeric strings, but a map preserves whatever order it was built with. */
function compareNodeIds(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * The raw events of a transaction in node-id order, from whichever shape the response used: a tree keyed by node id, or
 * a flat event array, wrapped in `transactionTree`, in `transaction`, or on its own.
 */
export function getTransactionEvents(transaction: unknown): readonly unknown[] {
  const eventsById = getEventsById(transaction);
  if (eventsById) {
    return Object.keys(eventsById)
      .sort(compareNodeIds)
      .map((key) => eventsById[key]);
  }
  return getEventArray(transaction) ?? [];
}

export function extractEventsFromTransaction(transaction: unknown): ParsedTransactionEvents {
  return getTransactionEvents(transaction).reduce<ParsedTransactionEvents>(
    (acc, event) => {
      const created = parseCreatedEvent(event);
      if (created) acc.created.push(created);

      const archived = parseArchivedEvent(event);
      if (archived) acc.archived.push(archived);

      const exercised = parseExercisedEvent(event);
      if (exercised) acc.exercised.push(exercised);

      return acc;
    },
    { created: [], archived: [], exercised: [] }
  );
}

export const TransactionParseErrorCode = {
  EXERCISE_RESULT_NOT_FOUND: 'TRANSACTION_EXERCISE_RESULT_NOT_FOUND',
  UPDATE_ID_NOT_FOUND: 'TRANSACTION_UPDATE_ID_NOT_FOUND',
} as const;

export type TransactionParseErrorCode = (typeof TransactionParseErrorCode)[keyof typeof TransactionParseErrorCode];

/** Thrown when a transaction response does not contain something the caller asserted it would. */
export class TransactionParseError extends CantonError {
  public override readonly name: string;

  public constructor(code: TransactionParseErrorCode, message: string, context?: ErrorContext) {
    super(message, code, context);
    this.name = 'TransactionParseError';
  }
}

/** The update id of a transaction response, or `undefined` when it names none. */
export function getTransactionUpdateId(transaction: unknown): string | undefined {
  const paths: ReadonlyArray<readonly string[]> = [
    ['updateId'],
    ['transactionTree', 'updateId'],
    ['transaction', 'updateId'],
  ];

  for (const path of paths) {
    let current: unknown = transaction;
    for (const segment of path) {
      if (!isRecord(current)) {
        current = undefined;
        break;
      }
      current = current[segment];
    }
    if (isString(current) && current.length > 0) return current;
  }

  return undefined;
}

/** The update id, for a caller that needs to correlate a submission with what the ledger did. */
export function requireTransactionUpdateId(transaction: unknown): string {
  const updateId = getTransactionUpdateId(transaction);
  if (updateId === undefined) {
    throw new TransactionParseError(
      TransactionParseErrorCode.UPDATE_ID_NOT_FOUND,
      'The transaction names no update id.'
    );
  }
  return updateId;
}

/** Every exercise of `choice` in the transaction, in node-id order. */
export function findExercisedEvents(transaction: unknown, choice: string): ParsedExercisedEvent[] {
  return extractEventsFromTransaction(transaction).exercised.filter((event) => event.choice === choice);
}

/** The first exercise of any of `choices`, in node-id order — the order the transaction produced them. */
export function findExercisedEvent(
  transaction: unknown,
  choices: string | readonly string[]
): ParsedExercisedEvent | undefined {
  const wanted = typeof choices === 'string' ? [choices] : choices;
  return extractEventsFromTransaction(transaction).exercised.find((event) => wanted.includes(event.choice));
}

/** The return value of the first exercise of `choice`, or `undefined` when the transaction contains none. */
export function findExerciseResult(transaction: unknown, choice: string | readonly string[]): unknown {
  return findExercisedEvent(transaction, choice)?.exerciseResult;
}

/**
 * The return value of the named choice. A caller asking for it is asserting the transaction contains it, so a
 * transaction without that exercise is reported rather than returned as `undefined`.
 */
export function requireExerciseResult(transaction: unknown, choice: string | readonly string[]): unknown {
  const exercised = findExercisedEvent(transaction, choice);
  if (!exercised) {
    const wanted = typeof choice === 'string' ? choice : choice.join(', ');
    throw new TransactionParseError(
      TransactionParseErrorCode.EXERCISE_RESULT_NOT_FOUND,
      `The transaction contains no ${wanted} exercise.`,
      { choice: wanted, updateId: getTransactionUpdateId(transaction) }
    );
  }
  return exercised.exerciseResult;
}

/**
 * Contract ids created by the transaction, in node-id order, optionally narrowed to one template. The filter is matched
 * package-agnostically by {@link matchesTemplateId}.
 */
export function findCreatedContractIds(transaction: unknown, templateFilter?: string): string[] {
  return extractEventsFromTransaction(transaction)
    .created.filter((created) => templateFilter === undefined || matchesTemplateId(created.templateId, templateFilter))
    .map((created) => created.contractId);
}
