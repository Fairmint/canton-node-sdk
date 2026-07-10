import { z } from 'zod';

/** Any losslessly representable JSON value carried by the Ledger JSON API. */
export type LedgerJsonValue = string | number | boolean | null | LedgerJsonValue[] | { [key: string]: LedgerJsonValue };

/** A present Ledger JSON value. Nested JSON nulls remain valid. */
export type LedgerNonNullJsonValue = Exclude<LedgerJsonValue, null>;

/** Strict JSON value schema that rejects values which JSON serialization would change or lose. */
export const LedgerJsonValueSchema: z.ZodType<LedgerJsonValue> = z
  .custom<LedgerJsonValue>((value) => isLosslessJsonValue(value), {
    message: 'Expected a JSON-serializable value',
  })
  .transform(cloneLedgerJsonValue);

/**
 * Optional Daml JSON field as represented on the wire.
 *
 * Scala `Option.None` is encoded as JSON null. Normalize that transport representation to an absent property while
 * continuing to allow nested JSON nulls inside present values.
 */
export const LedgerNullableOptionalJsonValueSchema: z.ZodType<LedgerNonNullJsonValue | undefined> =
  LedgerJsonValueSchema.nullish().transform((value): LedgerNonNullJsonValue | undefined => value ?? undefined);

/** Accept a wire-null Scala `Option.None`, then expose the generated optional-property shape. */
export const ledgerNullableOptionalResponseField = <Schema extends z.ZodType>(
  schema: Schema
): z.ZodType<z.output<Schema> | undefined, z.input<Schema> | null | undefined> =>
  schema.nullish().transform((value): z.output<Schema> | undefined => value ?? undefined);

/** Canonical padded Base64 used by protobuf JSON `bytes` fields. Base64url and non-canonical padding are rejected. */
export const LedgerBase64BytesSchema = z.string().refine(isCanonicalStandardBase64, {
  message: 'Expected canonical padded standard Base64',
});

/** Canonical Base64 for byte fields whose endpoint contract requires meaningful, non-empty bytes. */
export const LedgerNonEmptyBase64BytesSchema = LedgerBase64BytesSchema.refine((value) => value.length > 0, {
  message: 'Expected non-empty Base64 bytes',
});

/** RFC 3339 timestamp with an explicit UTC or numeric offset. */
export const LedgerRfc3339TimestampSchema = z.iso
  .datetime({ offset: true })
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/, {
    message: 'Expected an RFC 3339 timestamp with seconds and at most 9 fractional digits',
  });

/** Canonical lowercase Canton SHA-256 multihash (`0x12 0x20` plus 32 digest bytes). */
export const CantonSha256HashHexSchema = z.string().regex(/^1220[0-9a-f]{64}$/, {
  message: 'Expected a canonical lowercase Canton SHA-256 hash',
});

/** Non-empty Daml-LF LedgerString (ASCII, at most 255 characters). */
export const LedgerStringSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9._:#/ \-]+$/, { message: 'Expected a valid Daml-LF LedgerString' });

/** Daml-LF Name used for choices (Java-like ASCII identifier, at most 1,000 characters). */
export const LedgerNameSchema = z
  .string()
  .min(1)
  .max(1_000)
  .regex(/^[A-Za-z$_][A-Za-z0-9$_]*$/, { message: 'Expected a valid Daml-LF Name' });

function isCanonicalStandardBase64(value: string): boolean {
  if (value.length === 0) return true;
  if (value.length % 4 !== 0) return false;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false;

  try {
    return Buffer.from(value, 'base64').toString('base64') === value;
  } catch {
    return false;
  }
}

function cloneLedgerJsonValue(value: LedgerJsonValue): LedgerJsonValue {
  if (Array.isArray(value)) {
    return value.map(cloneLedgerJsonValue);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneLedgerJsonValue(nested)]));
  }
  return value;
}

function isLosslessJsonValue(value: unknown, ancestors: Set<object> = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) && !Object.is(value, -0);
  }
  if (typeof value !== 'object') {
    return false;
  }

  if (ancestors.has(value)) {
    return false;
  }
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length || Reflect.ownKeys(value).length !== value.length + 1) {
        return false;
      }
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value) || !isLosslessJsonValue(value[index], ancestors)) {
          return false;
        }
      }
      return true;
    }

    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return false;
    }

    const keys = Object.keys(value);
    if (Reflect.ownKeys(value).length !== keys.length) {
      return false;
    }
    return keys.every((key) => isLosslessJsonValue((value as Record<string, unknown>)[key], ancestors));
  } catch {
    return false;
  } finally {
    ancestors.delete(value);
  }
}
