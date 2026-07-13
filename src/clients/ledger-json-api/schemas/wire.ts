import { z } from 'zod';
import {
  ContractId as brandContractId,
  InterfaceId as brandInterfaceId,
  PackageId as brandPackageId,
  PackageName as brandPackageName,
  PartyId as brandPartyId,
  TemplateId as brandTemplateId,
  type ContractId,
  type InterfaceId,
  type PackageId,
  type PackageName,
  type PartyId,
  type TemplateId,
} from '../../../core';

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

/**
 * A pinned Canton V1 or V2 contract ID.
 *
 * V1 is `00`, a 32-byte discriminator, and at most 94 suffix bytes. V2 is `01`, a 12-byte local prefix, and at most 33
 * suffix bytes. Canton's parser accepts local, relative, and absolute IDs, so the suffix may be empty.
 */
export const LedgerContractIdSchema = z
  .string()
  .refine(isPinnedCantonContractId, {
    message: 'Expected a canonical lowercase Canton V1 or V2 contract ID',
  })
  .transform((value): ContractId => brandContractId(value));

/** Non-empty Daml-LF Party (ASCII letters, digits, space, colon, minus, and underscore; at most 255 characters). */
export const LedgerPartyIdSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9:_ -]+$/, { message: 'Expected a valid Daml-LF Party' })
  .transform((value): PartyId => brandPartyId(value));

/** Canonical lowercase 32-byte Daml-LF package hash. */
export const LedgerPackageIdSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, { message: 'Expected a canonical lowercase Daml-LF PackageId' })
  .transform((value): PackageId => brandPackageId(value));

/** Non-empty Daml-LF package name (ASCII letters, digits, minus, and underscore; at most 255 characters). */
export const LedgerPackageNameSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9_-]+$/, { message: 'Expected a valid Daml-LF PackageName' })
  .transform((value): PackageName => brandPackageName(value));

/** Package-ID-qualified Daml template identifier. */
export const LedgerTemplateIdSchema = z
  .string()
  .refine(isPackageIdQualifiedIdentifier, { message: 'Expected a package-ID-qualified Daml template identifier' })
  .transform((value): TemplateId => brandTemplateId(value));

/** Package-ID-qualified Daml interface identifier. */
export const LedgerInterfaceIdSchema = z
  .string()
  .refine(isPackageIdQualifiedIdentifier, { message: 'Expected a package-ID-qualified Daml interface identifier' })
  .transform((value): InterfaceId => brandInterfaceId(value));

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

function isPinnedCantonContractId(value: string): boolean {
  return /^00[0-9a-f]{64}(?:[0-9a-f]{2}){0,94}$/.test(value) || /^01[0-9a-f]{24}(?:[0-9a-f]{2}){0,33}$/.test(value);
}

function isPackageIdQualifiedIdentifier(value: string): boolean {
  const [packageId, moduleName, entityName, extra] = value.split(':');
  return (
    extra === undefined &&
    packageId !== undefined &&
    moduleName !== undefined &&
    entityName !== undefined &&
    /^[0-9a-f]{64}$/.test(packageId) &&
    isDamlDottedName(moduleName) &&
    isDamlDottedName(entityName)
  );
}

function isDamlDottedName(value: string): boolean {
  return value.length <= 1_000 && /^[A-Za-z$_][A-Za-z0-9$_]*(?:\.[A-Za-z$_][A-Za-z0-9$_]*)*$/.test(value);
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
