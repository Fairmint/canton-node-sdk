import { createHash } from 'crypto';

/**
 * Creates a SHA-256 hash for a string value.
 */
export function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
