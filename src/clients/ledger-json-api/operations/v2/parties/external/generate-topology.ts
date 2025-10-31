import { z } from 'zod';
import { type BaseClient, createApiOperation } from '../../../../../../core';
import type { paths } from '../../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

// Type aliases for better readability
type GeneratedRequest =
  paths['/v2/parties/external/generate-topology']['post']['requestBody']['content']['application/json'];
type GeneratedResponse =
  paths['/v2/parties/external/generate-topology']['post']['responses']['200']['content']['application/json'];

// Schema for signing public key
const SigningPublicKeySchema = z.object({
  format: z.string(),
  keyData: z.string(),
  keySpec: z.string(),
});

// Schema for the parameters
export const GenerateExternalPartyTopologyParamsSchema = z.object({
  /** Synchronizer ID on which to onboard the party */
  synchronizer: z.string(),
  /** Party ID hint - actual party ID will be constructed from this hint and a fingerprint of the public key */
  partyHint: z.string(),
  /** Public key in base64 format */
  publicKey: SigningPublicKeySchema,
  /** If true, then the local participant will only be observing, not confirming. Default false. */
  localParticipantObservationOnly: z.boolean().default(false).optional(),
  /** Other participant ids which should be confirming for this party */
  otherConfirmingParticipantUids: z.array(z.string()).optional(),
  /** Confirmation threshold >= 1 for the party. Defaults to all available confirmers (or if set to 0). */
  confirmationThreshold: z.number().int().default(0).optional(),
  /** Other observing participant ids for this party */
  observingParticipantUids: z.array(z.string()).optional(),
});

export type GenerateExternalPartyTopologyParams = z.infer<typeof GenerateExternalPartyTopologyParamsSchema>;

export type GenerateExternalPartyTopologyResponse = GeneratedResponse;

/**
 * Generate a topology for an external party
 *
 * This endpoint generates the topology transactions and multi-hash needed to onboard an external party. The multi-hash
 * should be signed using the external party's private key and then submitted to the allocate endpoint along with the
 * generated topology transactions.
 *
 * @example
 *   ```typescript
 *   const result = await client.generateExternalPartyTopology({
 *     synchronizer: 'global-synchronizer',
 *     partyHint: 'alice',
 *     publicKey: {
 *       format: 'CRYPTO_KEY_FORMAT_DER_X509_SUBJECT_PUBLIC_KEY_INFO',
 *       keyData: 'base64-encoded-public-key',
 *       keySpec: 'SIGNING_KEY_SPEC_EC_CURVE25519'
 *     }
 *   });
 *   // result.multiHash - sign this with the external party's private key
 *   // result.topologyTransactions - pass these to allocate endpoint
 *   // result.partyId - the generated party ID
 *   ```;
 */
export const GenerateExternalPartyTopology = createApiOperation<
  GenerateExternalPartyTopologyParams,
  GenerateExternalPartyTopologyResponse
>({
  paramsSchema: GenerateExternalPartyTopologyParamsSchema,
  method: 'POST',
  buildUrl: (_params: GenerateExternalPartyTopologyParams, apiUrl: string) =>
    `${apiUrl}/v2/parties/external/generate-topology`,
  buildRequestData: (params: GenerateExternalPartyTopologyParams, _client: BaseClient): GeneratedRequest => ({
    synchronizer: params.synchronizer,
    partyHint: params.partyHint,
    publicKey: params.publicKey,
    localParticipantObservationOnly: params.localParticipantObservationOnly ?? false,
    confirmationThreshold: params.confirmationThreshold ?? 0,
    ...(params.otherConfirmingParticipantUids && {
      otherConfirmingParticipantUids: params.otherConfirmingParticipantUids,
    }),
    ...(params.observingParticipantUids && {
      observingParticipantUids: params.observingParticipantUids,
    }),
  }),
});
