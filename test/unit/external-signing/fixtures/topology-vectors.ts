/**
 * External-party onboarding topology from a real participant. Test data only (not published: `files` ships
 * `build/src`). Copied from `@fairmint/canton-protocol`'s `test/fixtures/topology-vectors.ts`.
 *
 * Source: https://github.com/canton-network/wallet/tree/91627a6901d6360426b8169f3a7e0d2b3f994c4a/core/tx-visualizer/src
 * (`__tests__/fixtures/generate-topology-3.7.2.json`). Apache-2.0, Copyright Digital Asset (Switzerland) GmbH and/or
 * its affiliates.
 */

/** The party of both generate-topology vectors: `alice` and the fingerprint of {@link GENERATED_TOPOLOGY_PUBLIC_KEY}. */
export const GENERATED_TOPOLOGY_PARTY_ID =
  'alice::12205a50eb9b9d64bb30ac4125afa1aeea7bcae51792ac2d174a6132ceec9290d062';
/** The party's Ed25519 key, canonical DER base64. */
export const GENERATED_TOPOLOGY_PUBLIC_KEY = 'MCowBQYDK2VwAyEAA5ufeUjSCCrbYVs4FipJRBhJQIFYKL++qE2t8lEccgo=';
/** The participant that generated them. */
export const GENERATED_TOPOLOGY_PARTICIPANT_UID =
  'participant1::1220d44fc1c3ba0b5bdf7b956ee71bc94ebe2d23258dc268fdf0824fbaeff2c61424';

/**
 * `/v2/parties/external/generate-topology` answers of a Canton 3.7.2 participant on a protocol version 37 synchronizer:
 * proto v31 by default, v30 with protocol version 36. `multiHash` is the participant's, base64. Both host the party on
 * {@link GENERATED_TOPOLOGY_PARTICIPANT_UID} with `CONFIRMATION`, threshold 1, and give the key the usages `NAMESPACE`,
 * `PROTOCOL` and `PROOF_OF_OWNERSHIP`.
 */
export const GENERATED_TOPOLOGY = Object.freeze({
  v31: Object.freeze({
    topologyTransactions: Object.freeze([
      'CvABCAEQARrpAUrmAQpLYWxpY2U6OjEyMjA1YTUwZWI5YjlkNjRiYjMwYWM0MTI1YWZhMWFlZWE3YmNhZTUxNzkyYWMyZDE3NGE2MTMyY2VlYzkyOTBkMDYyEAEaWApScGFydGljaXBhbnQxOjoxMjIwZDQ0ZmMxYzNiYTBiNWJkZjdiOTU2ZWU3MWJjOTRlYmUyZDIzMjU4ZGMyNjhmZGYwODI0ZmJhZWZmMmM2MTQyNBACGAQiOwo3EAQaLDAqMAUGAytlcAMhAAObn3lI0ggq22FbOBYqSUQYSUCBWCi/vqhNrfJRHHIKKgMBBQQwARABEB8=',
    ]),
    multiHash: 'EiBuhfF+AOEyl1XK1niN4DCvOR1ll+kx8Mrs5+oNzVXSKQ==',
  }),
  v30: Object.freeze({
    topologyTransactions: Object.freeze([
      'Cu4BCAEQARrnAUrkAQpLYWxpY2U6OjEyMjA1YTUwZWI5YjlkNjRiYjMwYWM0MTI1YWZhMWFlZWE3YmNhZTUxNzkyYWMyZDE3NGE2MTMyY2VlYzkyOTBkMDYyEAEaVgpScGFydGljaXBhbnQxOjoxMjIwZDQ0ZmMxYzNiYTBiNWJkZjdiOTU2ZWU3MWJjOTRlYmUyZDIzMjU4ZGMyNjhmZGYwODI0ZmJhZWZmMmM2MTQyNBACMjsKNxAEGiwwKjAFBgMrZXADIQADm595SNIIKtthWzgWKklEGElAgVgov76oTa3yURxyCioDAQUEMAEQARAe',
    ]),
    multiHash: 'EiCvbxn+nvPOxtx7I0MDgjvYjf0gBgOGtPhTmbKzHt9U1g==',
  }),
});
