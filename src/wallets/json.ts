/** JSON values as the Ledger JSON API and DA's registry API encode them, with guards for untrusted input. */
import { isRecord } from '../core/utils/type-guards';

/** A plain object (not an array, not null): the SDK's dependency-free guard, imported from its own file. */
export { isRecord };

export type JsonPrimitive = string | number | boolean | null;
export type JsonArray = readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

/** Whether `value` is a JSON value: finite numbers, no `undefined`, functions or class instances beyond plain data. */
export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  return Array.isArray(value) ? value.every(isJsonValue) : Object.values(value).every(isJsonValue);
}

export function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && isJsonValue(value);
}

/** A non-empty string, or undefined. */
export function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
