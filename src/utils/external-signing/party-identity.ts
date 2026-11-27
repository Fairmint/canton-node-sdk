/**
 * Node-sdk's use of `@fairmint/canton-protocol/party` on caller input. Internal: not exported from the package.
 *
 * The key, fingerprint, party-ID and hash rules are canton-protocol's. These wrappers keep node-sdk's error contract
 * for its own functions: input canton-protocol refuses (`INVALID_INPUT`) becomes a {@link ValidationError} carrying the
 * refusal as `cause`, and a party/key mismatch keeps the SDK's messages.
 */
import {
  buildExternalPartyId,
  decodeEd25519PublicKey,
  fingerprintEd25519PublicKey,
  isCantonHash,
  isCantonProtocolError,
  normalizeEd25519PublicKeyForCanton,
  parsePartyId,
} from '@fairmint/canton-protocol/party';
import { ValidationError } from '../../core/errors';

/** A party ID, the Ed25519 public key that should control it, and optionally the key's fingerprint as the caller has it. */
export interface PartyKeyInput {
  readonly partyId: string;
  readonly publicKeyBase64: string;
  readonly publicKeyFingerprint?: string | null;
}

/** Runs a canton-protocol call on caller input: its `INVALID_INPUT` refusal becomes a {@link ValidationError}. */
export function onCallerInput<T>(call: () => T): T {
  try {
    return call();
  } catch (error) {
    throw callerInputError(error);
  }
}

/**
 * The error to throw for `error`, raised by canton-protocol on caller input: its `INVALID_INPUT` refusal becomes a
 * {@link ValidationError} carrying it as `cause`; anything else is returned as it is.
 */
export function callerInputError(error: unknown): unknown {
  if (isCantonProtocolError(error, 'INVALID_INPUT')) {
    const validation = new ValidationError(error.message, error.field === undefined ? {} : { field: error.field });
    Object.defineProperty(validation, 'cause', { value: error, enumerable: false, writable: true });
    return validation;
  }
  return error;
}

/** Canton's encoding (DER X.509 SubjectPublicKeyInfo, base64) of a raw or DER Ed25519 public key. */
export function cantonPublicKeyBase64(publicKeyBase64: string): string {
  return onCallerInput(() => normalizeEd25519PublicKeyForCanton(publicKeyBase64));
}

/** The raw 32 bytes of a raw or DER Ed25519 public key. */
export function rawEd25519PublicKey(publicKeyBase64: string): Uint8Array {
  return onCallerInput(() => decodeEd25519PublicKey(publicKeyBase64));
}

/** The Canton fingerprint of a raw or DER Ed25519 public key. */
export function publicKeyFingerprintOf(publicKeyBase64: string): string {
  return onCallerInput(() => fingerprintEd25519PublicKey(publicKeyBase64));
}

/** The external party ID `hint::fingerprint`. */
export function externalPartyIdOf(partyHint: string, publicKeyFingerprint: string): string {
  return onCallerInput(() => buildExternalPartyId(partyHint, publicKeyFingerprint));
}

/**
 * The party ID Canton allocates for `partyHint` on `publicKeyBase64` (`hint::fingerprint`), built from the request so a
 * participant's answer can be compared with it. Canton uses the hint exactly as sent, so a hint with leading or
 * trailing whitespace is refused rather than trimmed, as is any hint canton-protocol's `buildExternalPartyId` refuses.
 */
export function requestedExternalPartyId(partyHint: string, publicKeyBase64: string): string {
  if (typeof partyHint === 'string' && partyHint !== partyHint.trim()) {
    throw new ValidationError('partyHint must not start or end with whitespace', { partyHint });
  }
  return externalPartyIdOf(partyHint, publicKeyFingerprintOf(publicKeyBase64));
}

/**
 * Whether `partyId` has whitespace around it or around its `::`. A party ID is never trimmed, and a space is a Daml-LF
 * Party character, so such an ID would otherwise parse: a leading space, or one before `::`, as part of the hint.
 */
export function hasSurroundingWhitespace(partyId: string): boolean {
  if (partyId !== partyId.trim()) return true;
  const separator = partyId.indexOf('::');
  if (separator === -1) return false;
  const hint = partyId.slice(0, separator);
  const namespace = partyId.slice(separator + 2);
  return hint !== hint.trim() || namespace !== namespace.trim();
}

/**
 * Checks that `partyId` is an external party of `publicKeyBase64` (its namespace is the key's fingerprint) and that a
 * caller-supplied fingerprint, if any, is the key's; returns the key's fingerprint. An ID with whitespace around it or
 * around its `::` is refused, never trimmed ({@link hasSurroundingWhitespace}).
 */
export function assertPartyKey(input: PartyKeyInput): string {
  if (typeof input.partyId === 'string' && hasSurroundingWhitespace(input.partyId)) {
    throw new ValidationError('Canton party ID must not have whitespace around it or around its namespace', {
      partyId: input.partyId,
    });
  }
  const parsed = parsePartyId(input.partyId);
  if (parsed === null) {
    throw new ValidationError('Expected a Canton party ID with one public key fingerprint suffix', {
      partyId: input.partyId,
    });
  }
  const keyFingerprint = publicKeyFingerprintOf(input.publicKeyBase64);
  const suppliedFingerprint = input.publicKeyFingerprint?.trim();
  if (suppliedFingerprint && suppliedFingerprint !== keyFingerprint) {
    throw new ValidationError('Submitted public key fingerprint does not match the public key', {
      suppliedFingerprint,
      keyFingerprint,
    });
  }
  if (parsed.namespace !== keyFingerprint) {
    throw new ValidationError('Canton party ID does not match the submitted public key', {
      partyFingerprint: parsed.namespace,
      keyFingerprint,
    });
  }
  return keyFingerprint;
}

/** A Canton hash (`1220` and 64 hex characters, either case) the caller passed as hex, in canonical lowercase form. */
export function cantonHashHexOf(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!isCantonHash(normalized)) {
    throw new ValidationError('Expected a Canton SHA-256 multihash hex string', { value });
  }
  return normalized;
}
