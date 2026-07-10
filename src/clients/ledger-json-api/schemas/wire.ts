import { z } from 'zod';

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
