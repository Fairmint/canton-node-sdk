/**
 * Browser-safe Canton external-party discovery: "find every party this key controls". Import
 * `@fairmint/canton-node-sdk/external-parties` in a browser bundle (it loads `@noble/hashes` and none of the SDK's Node
 * dependencies); the package root also exports it as the `ExternalParties` namespace.
 *
 * - Identity: {@link deriveCantonEd25519PublicKeyFingerprint} (`1220` + hex(sha256(int32be(12) || rawKey))),
 *   {@link buildExternalPartyId} (`hint::fingerprint`), {@link readPartyNamespace}, {@link parseExternalPartyId},
 *   {@link normalizeEd25519PublicKeyForCanton} and {@link decodeEd25519PublicKey}.
 * - Discovery: {@link createExternalPartyDirectory} over a Ledger JSON API client (bounded, cached `GET /v2/parties` scans
 *   filtered to the key's namespace, exact `GET /v2/parties/{party}` lookups of the hints asked for), and
 *   {@link discoverExternalParties}, the same orchestration over any list and lookup callbacks.
 * - Hints for new parties: {@link suggestExternalPartyHint} and {@link validateExternalPartyHint}.
 * - Errors: {@link ExternalPartyError} and {@link isExternalPartyError}.
 */
export {
  createExternalPartyDirectory,
  type ExternalPartyDirectory,
  type ExternalPartyDirectoryLedgerClient,
  type ExternalPartyDirectoryOptions,
  type ExternalPartyDirectoryRequestConfig,
  type ExternalPartyFound,
  type ExternalPartyKey,
} from './directory';
export {
  discoverExternalParties,
  MAX_EXTERNAL_PARTY_LOOKUP_HINTS,
  type ExternalPartyDiscovery,
  type ExternalPartyEntry,
  type ExternalPartyListAnswer,
  type ExternalPartyListing,
  type ExternalPartyLookupAnswer,
} from './discovery';
export { ExternalPartyError, isExternalPartyError, type ExternalPartyErrorCode } from './errors';
export {
  DEFAULT_EXTERNAL_PARTY_HINT,
  MAX_NEW_EXTERNAL_PARTY_HINT_LENGTH,
  MAX_SUGGESTED_EXTERNAL_PARTY_HINT_BASE_LENGTH,
  suggestExternalPartyHint,
  validateExternalPartyHint,
  type ExternalPartyHintError,
} from './hints';
export {
  buildExternalPartyId,
  decodeEd25519PublicKey,
  deriveCantonEd25519PublicKeyFingerprint,
  fingerprintRawEd25519PublicKey,
  isCantonPublicKeyFingerprint,
  MAX_EXTERNAL_PARTY_ID_LENGTH,
  normalizeEd25519PublicKeyForCanton,
  parseExternalPartyId,
  readPartyNamespace,
} from './keys';
