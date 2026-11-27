/**
 * Signatures over a Canton hash that every SDK call site must refuse (fail closed), and the check of how it refused.
 *
 * `bad` signatures are well formed but do not verify (canton-protocol's `verifyCantonHashSignature` resolves `false`):
 * the SDK throws `ValidationError` with its "invalid signature" message. `malformed` ones are refused before or by
 * canton-protocol (`verifyCantonHashSignature` rejects with `INVALID_INPUT`): the SDK throws `ValidationError`, with
 * canton-protocol's refusal as `cause` where it made it.
 */
import { isCantonProtocolError } from '@fairmint/canton-protocol/signature';
import { ValidationError } from '../../../../src/core/errors';

export interface SignatureSources {
  /** A valid base64 signature over the hash, by the party's key. */
  readonly valid: string;
  /** A valid base64 signature over the same hash, by another key. */
  readonly otherKey: string;
}

export interface RefusedSignature {
  readonly name: string;
  readonly kind: 'bad' | 'malformed';
  /** For a malformed signature: canton-protocol's refusal is the `cause` (else the SDK refused it first). */
  readonly cantonProtocolCode?: 'INVALID_INPUT';
  /** For a malformed signature the SDK refuses itself: its message. */
  readonly message?: string;
  readonly make: (sources: SignatureSources) => string;
}

function flipBit(signatureBase64: string): string {
  const bytes = Buffer.from(signatureBase64, 'base64');
  bytes[40] = (bytes[40] ?? 0) ^ 0x01;
  return bytes.toString('base64');
}

export const REFUSED_SIGNATURES: readonly RefusedSignature[] = [
  { name: 'signed by another key', kind: 'bad', make: (s) => s.otherKey },
  { name: 'with one bit flipped', kind: 'bad', make: (s) => flipBit(s.valid) },
  {
    name: 'of 63 bytes',
    kind: 'malformed',
    cantonProtocolCode: 'INVALID_INPUT',
    make: (s) => Buffer.from(s.valid, 'base64').subarray(0, 63).toString('base64'),
  },
  {
    // A hex signature is read as base64 (96 bytes), never as hex: the field is signatureBase64.
    name: 'spelled as hex',
    kind: 'malformed',
    cantonProtocolCode: 'INVALID_INPUT',
    make: (s) => Buffer.from(s.valid, 'base64').toString('hex'),
  },
  {
    name: 'that is not base64',
    kind: 'malformed',
    message: 'signatureBase64 must be base64-encoded',
    make: () => 'not*base64',
  },
];

/** Asserts `promise` rejects the way `refusal` must be refused. */
export async function expectSignatureRefused(
  promise: Promise<unknown>,
  refusal: RefusedSignature,
  badMessage = 'Invalid Canton hash signature'
): Promise<void> {
  let error: unknown;
  try {
    await promise;
  } catch (caught: unknown) {
    error = caught;
  }
  expect(error).toBeInstanceOf(ValidationError);
  const { message } = error as ValidationError;
  if (refusal.kind === 'bad') {
    expect(message).toBe(badMessage);
    return;
  }
  expect(message).not.toBe(badMessage);
  if (refusal.message !== undefined) expect(message).toBe(refusal.message);
  if (refusal.cantonProtocolCode !== undefined) {
    expect(isCantonProtocolError((error as { cause?: unknown }).cause, refusal.cantonProtocolCode)).toBe(true);
  }
}
