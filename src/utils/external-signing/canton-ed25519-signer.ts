import { ValidationError } from '../../core/errors';
import {
  assertCantonPartyMatchesPublicKey,
  assertEd25519Signature,
  hashHexToBase64,
  normalizeEd25519PublicKeyForCanton,
} from './canton-protocol';

export const CantonEd25519SigningPurpose = {
  EXTERNAL_PARTY_TOPOLOGY: 'external-party-topology',
  INTERACTIVE_SUBMISSION: 'interactive-submission',
} as const;

export type CantonEd25519SigningPurposeType =
  (typeof CantonEd25519SigningPurpose)[keyof typeof CantonEd25519SigningPurpose];

export const DEFAULT_CANTON_ED25519_SIGNING_REQUEST_TTL_MS = 5 * 60 * 1_000;
export const MAX_CANTON_ED25519_SIGNING_REQUEST_TTL_MS = 15 * 60 * 1_000;

export type CantonEd25519SigningContextValue = string | number | boolean | null;
export type CantonEd25519SigningContext = Readonly<Record<string, CantonEd25519SigningContextValue>>;

/**
 * A provider-neutral Canton payload that must be signed by an externally held Ed25519 key.
 *
 * Signers should display or enforce policy using `purpose`, `operationId`, `partyId`, and `synchronizerId`. Only the
 * decoded bytes represented by `payloadHex`/`payloadBase64` are signed; the contextual fields are not part of the
 * signed payload.
 */
export interface CantonEd25519SigningRequest {
  readonly purpose: CantonEd25519SigningPurposeType;
  readonly operationId: string;
  readonly partyId: string;
  readonly publicKeyBase64: string;
  readonly publicKeyFingerprint: string;
  readonly synchronizerId: string;
  readonly payloadHex: string;
  readonly payloadBase64: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly context?: CantonEd25519SigningContext;
}

export type CantonEd25519Signature =
  | {
      readonly signatureBase64: string;
    }
  | {
      readonly signatureHex: string;
    }
  | {
      readonly signatureBytes: Uint8Array;
    };

/** Provider-neutral external key that can sign Canton topology and interactive-submission hashes. */
export interface CantonEd25519Signer {
  readonly publicKeyBase64: string;
  readonly signCantonPayload: (
    request: CantonEd25519SigningRequest,
    options?: { readonly signal?: AbortSignal }
  ) => CantonEd25519Signature | Promise<CantonEd25519Signature>;
}

export interface SignAndVerifyCantonEd25519PayloadOptions {
  readonly signer: CantonEd25519Signer;
  readonly purpose: CantonEd25519SigningPurposeType;
  readonly operationId: string;
  readonly partyId: string;
  readonly synchronizerId: string;
  readonly payloadHex: string;
  readonly context?: CantonEd25519SigningContext;
  readonly requestTtlMs?: number;
  readonly now?: () => number;
  readonly signal?: AbortSignal;
}

export interface SignedCantonEd25519Payload {
  readonly request: CantonEd25519SigningRequest;
  readonly signatureBase64: string;
}

/** Calls an external signer and independently verifies its response against the signer's declared public key. */
export async function signAndVerifyCantonEd25519Payload(
  options: SignAndVerifyCantonEd25519PayloadOptions
): Promise<SignedCantonEd25519Payload> {
  const purpose = validateSigningPurpose(options.purpose);
  const operationId = validateRequiredString('operationId', options.operationId);
  const synchronizerId = validateRequiredString('synchronizerId', options.synchronizerId);
  const payloadHex = normalizeHexPayload(options.payloadHex);
  const requestTtlMs = validateRequestTtlMs(options.requestTtlMs ?? DEFAULT_CANTON_ED25519_SIGNING_REQUEST_TTL_MS);
  const now = options.now ?? Date.now;
  const issuedAtMs = validateTimestamp(now());
  const issuedAt = new Date(issuedAtMs).toISOString();
  const expiresAt = new Date(issuedAtMs + requestTtlMs).toISOString();
  const context = options.context === undefined ? undefined : normalizeSigningContext(options.context);
  const publicKeyBase64 = normalizeEd25519PublicKeyForCanton(options.signer.publicKeyBase64);
  const publicKeyFingerprint = assertCantonPartyMatchesPublicKey({
    partyId: options.partyId,
    publicKeyBase64,
  });
  const request: CantonEd25519SigningRequest = {
    purpose,
    operationId,
    partyId: options.partyId,
    publicKeyBase64,
    publicKeyFingerprint,
    synchronizerId,
    payloadHex,
    payloadBase64: hashHexToBase64(payloadHex),
    issuedAt,
    expiresAt,
    ...(context !== undefined ? { context } : {}),
  };
  const signatureBase64 = normalizeCantonEd25519Signature(
    await waitForCantonSigner(options.signer, request, requestTtlMs, options.signal)
  );
  if (validateTimestamp(now()) >= issuedAtMs + requestTtlMs) {
    throw new ValidationError('Canton Ed25519 signing request expired before the signer completed', {
      operationId,
      expiresAt,
    });
  }

  assertEd25519Signature({
    publicKeyBase64,
    payload: Buffer.from(payloadHex, 'hex'),
    signatureBase64,
    failureMessage: 'External Canton signer returned an invalid Ed25519 signature',
  });

  return { request, signatureBase64 };
}

async function waitForCantonSigner(
  signer: CantonEd25519Signer,
  request: CantonEd25519SigningRequest,
  requestTtlMs: number,
  externalSignal?: AbortSignal
): Promise<CantonEd25519Signature> {
  if (externalSignal?.aborted) {
    throw signingAborted(request.operationId);
  }
  const controller = new AbortController();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = (): void => {
      // Preserve a signer result that settled before abort but whose promise handler is already queued.
      queueMicrotask(() => finish(() => reject(signingAborted(request.operationId))));
      controller.abort();
    };
    const timeout = setTimeout(() => {
      controller.abort();
      finish(() =>
        reject(
          new ValidationError('Canton Ed25519 signing request expired before the signer completed', {
            operationId: request.operationId,
            expiresAt: request.expiresAt,
          })
        )
      );
    }, requestTtlMs);
    externalSignal?.addEventListener('abort', onAbort, { once: true });
    if (externalSignal?.aborted) {
      onAbort();
      return;
    }

    queueMicrotask(() => {
      if (settled || controller.signal.aborted) {
        finish(() => reject(signingAborted(request.operationId)));
        return;
      }
      let pending: CantonEd25519Signature | Promise<CantonEd25519Signature>;
      try {
        pending = signer.signCantonPayload(request, { signal: controller.signal });
      } catch (error) {
        finish(() => reject(error));
        return;
      }
      Promise.resolve(pending).then(
        (signature) => finish(() => resolve(signature)),
        (error: unknown) => finish(() => reject(error))
      );
    });
  });
}

function signingAborted(operationId: string): ValidationError {
  return new ValidationError('Canton Ed25519 signing request was aborted', { operationId });
}

/** Normalizes supported signer outputs into canonical, padded base64. */
export function normalizeCantonEd25519Signature(signature: CantonEd25519Signature): string {
  if ('signatureBase64' in signature) {
    return encodeSignatureBytes(decodeBase64Signature(signature.signatureBase64));
  }
  if ('signatureHex' in signature) {
    return encodeSignatureBytes(decodeHexSignature(signature.signatureHex));
  }
  return encodeSignatureBytes(Buffer.from(signature.signatureBytes));
}

function decodeBase64Signature(value: string): Buffer {
  const normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 === 1) {
    throw invalidCantonEd25519Signature();
  }
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const decoded = Buffer.from(padded, 'base64');
  if (decoded.toString('base64').replace(/=+$/, '') !== normalized.replace(/=+$/, '')) {
    throw invalidCantonEd25519Signature();
  }
  return decoded;
}

function decodeHexSignature(value: string): Buffer {
  const normalized = value.trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw invalidCantonEd25519Signature();
  }
  return Buffer.from(normalized, 'hex');
}

function encodeSignatureBytes(signature: Buffer): string {
  if (signature.length !== 64) {
    throw invalidCantonEd25519Signature(signature.length);
  }
  return signature.toString('base64');
}

function invalidCantonEd25519Signature(actualLength?: number): ValidationError {
  return new ValidationError('External Canton signer must return a 64-byte Ed25519 signature', {
    ...(actualLength !== undefined ? { actualLength } : {}),
    expectedLength: 64,
  });
}

function normalizeHexPayload(value: string): string {
  const normalized = value.trim();
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(normalized)) {
    throw new ValidationError('payloadHex must be non-empty, even-length hexadecimal bytes', { payloadHex: value });
  }
  return normalized.toLowerCase();
}

function validateRequiredString(name: string, value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new ValidationError(`${name} is required`, { [name]: value });
  }
  return normalized;
}

function validateRequestTtlMs(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_CANTON_ED25519_SIGNING_REQUEST_TTL_MS) {
    throw new ValidationError(
      `requestTtlMs must be a positive safe integer no greater than ${MAX_CANTON_ED25519_SIGNING_REQUEST_TTL_MS}`,
      { requestTtlMs: value, maxRequestTtlMs: MAX_CANTON_ED25519_SIGNING_REQUEST_TTL_MS }
    );
  }
  return value;
}

function validateTimestamp(value: number): number {
  const latestIssuedAtMs = 8_640_000_000_000_000 - MAX_CANTON_ED25519_SIGNING_REQUEST_TTL_MS;
  if (!Number.isSafeInteger(value) || value < 0 || value > latestIssuedAtMs) {
    throw new ValidationError('now must return a non-negative, valid Unix timestamp in milliseconds', { now: value });
  }
  return value;
}

function normalizeSigningContext(context: unknown): CantonEd25519SigningContext {
  if (typeof context !== 'object' || context === null || Array.isArray(context)) {
    throw new ValidationError('Canton signing context must be an object of primitive JSON values');
  }
  const entries: Array<readonly [string, CantonEd25519SigningContextValue]> = [];
  for (const [key, value] of Object.entries(context)) {
    if (!key.trim()) {
      throw new ValidationError('Canton signing context keys must not be empty');
    }
    if (
      value !== null &&
      typeof value !== 'string' &&
      typeof value !== 'boolean' &&
      (typeof value !== 'number' || !Number.isFinite(value))
    ) {
      throw new ValidationError('Canton signing context values must be primitive JSON values', { key });
    }
    entries.push([key, value]);
  }
  // Object.fromEntries defines `__proto__` as an own data property instead of invoking Object.prototype's setter.
  return Object.fromEntries(entries);
}

function validateSigningPurpose(value: unknown): CantonEd25519SigningPurposeType {
  if (
    value !== CantonEd25519SigningPurpose.EXTERNAL_PARTY_TOPOLOGY &&
    value !== CantonEd25519SigningPurpose.INTERACTIVE_SUBMISSION
  ) {
    throw new ValidationError('Unsupported Canton Ed25519 signing purpose', { purpose: value });
  }
  return value;
}
