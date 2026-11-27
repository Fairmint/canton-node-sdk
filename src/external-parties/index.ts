/**
 * Browser-safe Canton external-party directory: "find every party this key controls" on one participant, over the
 * Ledger JSON API. Import `@fairmint/canton-node-sdk/external-parties` in a browser bundle (it loads
 * `@fairmint/canton-protocol/party` and none of the SDK's Node dependencies); the package root also exports it as the
 * `ExternalParties` namespace.
 *
 * The directory throws canton-protocol's `CantonProtocolError` (match it with `isCantonProtocolError`, from
 * `@fairmint/canton-protocol/party` as your own dependency: any 0.1.x copy matches, the brand is registered). Key
 * fingerprints, party IDs and `discoverExternalParties` over any list and lookup callbacks are canton-protocol's:
 * import them from `@fairmint/canton-protocol/party`.
 */
export {
  createExternalPartyDirectory,
  type ExternalPartyDirectory,
  type ExternalPartyDirectoryEntry,
  type ExternalPartyDirectoryListing,
  type ExternalPartyDirectoryLedgerClient,
  type ExternalPartyDirectoryOptions,
  type ExternalPartyDirectoryRequestConfig,
  type ExternalPartyFound,
  type ExternalPartyKey,
} from './directory';
