/**
 * Core value types from the Ledger API protobufs. These types correspond to com.daml.ledger.api.v2.value.proto
 *
 * @see https://docs.digitalasset.com/build/3.4/reference/lapi-proto-docs.html
 */

/** Unique identifier for a Daml template or interface. */
export interface Identifier {
  /** The package ID containing the template. */
  packageId: string;
  /** The module name (e.g., "Main"). */
  moduleName: string;
  /** The entity name (e.g., "Asset"). */
  entityName: string;
}

/** A single field in a DamlRecord. */
export interface RecordField {
  /** Optional field label. */
  label?: string;
  /** The field value. */
  value: Value;
}

/** A Record value (product type in Daml). Named DamlRecord to avoid conflict with TypeScript's Record utility type. */
export interface DamlRecord {
  /** Optional type identifier. */
  recordId?: Identifier;
  /** The record fields. */
  fields: RecordField[];
}

/** A Variant value (sum type in Daml). */
export interface Variant {
  /** Optional type identifier. */
  variantId?: Identifier;
  /** The constructor name. */
  constructor: string;
  /** The constructor argument. */
  value: Value;
}

/** An Enum value. */
export interface DamlEnum {
  /** Optional type identifier. */
  enumId?: Identifier;
  /** The enum constructor. */
  constructor: string;
}

/** A List value. */
export interface DamlList {
  /** The list elements. */
  elements: Value[];
}

/** An Optional value. */
export interface DamlOptional {
  /** The optional value, if present. */
  value?: Value | undefined;
}

/** A Map with text keys. */
export interface TextMap {
  /** The map entries. */
  entries: TextMapEntry[];
}

/** An entry in a TextMap. */
export interface TextMapEntry {
  /** The key. */
  key: string;
  /** The value. */
  value: Value;
}

/** A Map with arbitrary keys. */
export interface GenMap {
  /** The map entries. */
  entries: GenMapEntry[];
}

/** An entry in a GenMap. */
export interface GenMapEntry {
  /** The key. */
  key: Value;
  /** The value. */
  value: Value;
}

/** A Daml value. This is a discriminated union of all possible value types. Only one field should be set at a time. */
export interface Value {
  record?: DamlRecord;
  variant?: Variant;
  contractId?: string;
  list?: DamlList;
  int64?: string; // String to preserve precision
  numeric?: string;
  text?: string;
  timestamp?: string; // Microseconds since epoch as string
  party?: string;
  bool?: boolean;
  unit?: object; // Empty object for unit
  date?: number; // Days since epoch
  optional?: DamlOptional;
  textMap?: TextMap;
  genMap?: GenMap;
  enum?: DamlEnum;
}

/**
 * Helper to create an Identifier from a qualified string.
 *
 * @param qualifiedName - Format: "packageId:moduleName:entityName"
 */
export function parseIdentifier(qualifiedName: string): Identifier {
  const parts = qualifiedName.split(':');
  if (parts.length !== 3) {
    throw new Error(`Invalid identifier format: ${qualifiedName}. Expected "packageId:moduleName:entityName"`);
  }
  // parts.length === 3 is guaranteed here, so all indices are valid
  return {
    packageId: parts[0] as string,
    moduleName: parts[1] as string,
    entityName: parts[2] as string,
  };
}

/** Helper to format an Identifier as a qualified string. */
export function formatIdentifier(id: Identifier): string {
  return `${id.packageId}:${id.moduleName}:${id.entityName}`;
}

/** Helper to create a DamlRecord value from a plain object. */
export function createDamlRecord(fields: Record<string, Value>, recordId?: Identifier): DamlRecord {
  const record: DamlRecord = {
    fields: Object.entries(fields).map(([label, value]) => ({ label, value })),
  };
  if (recordId !== undefined) {
    record.recordId = recordId;
  }
  return record;
}

/** Helper to create common Value types. */
export const Values = {
  text: (value: string): Value => ({ text: value }),
  int64: (value: bigint | number): Value => ({ int64: value.toString() }),
  numeric: (value: string | number): Value => ({ numeric: value.toString() }),
  bool: (value: boolean): Value => ({ bool: value }),
  party: (value: string): Value => ({ party: value }),
  contractId: (value: string): Value => ({ contractId: value }),
  unit: (): Value => ({ unit: {} }),
  list: (elements: Value[]): Value => ({ list: { elements } }),
  optional: (value?: Value): Value => ({ optional: { value } }),
  record: (fields: Record<string, Value>, recordId?: Identifier): Value => ({
    record: createDamlRecord(fields, recordId),
  }),
};
