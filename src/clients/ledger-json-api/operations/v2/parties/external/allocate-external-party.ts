import { z } from 'zod';
import { type BaseClient, createApiOperation } from '../../../../../../core';
import type { paths } from '../../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

// Type aliases for better readability
type GeneratedRequest = paths['/v2/parties/external/allocate']['post']['requestBody']['content']['application/json'];
type GeneratedResponse = paths['/v2/parties/external/allocate']['post']['responses']['200']['content']['application/json'];

// Schema for signature
const SignatureSchema = z.object({
  format: z.string(),
  signature: z.string(),
  signedBy: z.string(),
  signingAlgorithmSpec: z.string(),
});

// Schema for signed transaction (signatures must be present or omitted, not undefined)
const SignedTransactionSchema = z.union([
  z.object({
    transaction: z.string(),
    signatures: z.array(SignatureSchema),
  }),
  z.object({
    transaction: z.string(),
  }),
]);

// Schema for the parameters
export const AllocateExternalPartyParamsSchema = z.object({
  /** Synchronizer ID on which to onboard the party */
  synchronizer: z.string(),
  /** Topology transactions to onboard the external party (from generate-topology endpoint) */
  onboardingTransactions: z.array(SignedTransactionSchema).optional(),
  /** Signatures for the multi-hash (alternative to signing each individual transaction) */
  multiHashSignatures: z.array(SignatureSchema).optional(),
  /** Identity provider ID. If not set, assume the party is managed by the default identity provider. */
  identityProviderId: z.string(),
});

export type AllocateExternalPartyParams = z.infer<typeof AllocateExternalPartyParamsSchema>;

export type AllocateExternalPartyResponse = GeneratedResponse;

/**
 * Allocate a new external party
 *
 * This endpoint completes the onboarding of an external party by submitting the signed topology
 * transactions or multi-hash signatures. The topology transactions and multi-hash should be
 * obtained from the generate-topology endpoint and signed with the external party's private key.
 *
 * @example
 *   ```typescript
 *   // Option 1: Using multi-hash signatures (recommended)
 *   const result = await client.allocateExternalParty({
 *     synchronizer: 'global-synchronizer',
 *     identityProviderId: 'default',
 *     multiHashSignatures: [{
 *       format: 'SIGNATURE_FORMAT_RAW',
 *       signature: 'base64-encoded-signature',
 *       signedBy: 'public-key-fingerprint',
 *       signingAlgorithmSpec: 'SIGNING_KEY_SPEC_EC_CURVE25519'
 *     }]
 *   });
 *
 *   // Option 2: Using signed transactions
 *   const result = await client.allocateExternalParty({
 *     synchronizer: 'global-synchronizer',
 *     identityProviderId: 'default',
 *     onboardingTransactions: [{
 *       transaction: 'serialized-transaction',
 *       signatures: [{ ... }]
 *     }]
 *   });
 *   ```;
 */
export const AllocateExternalParty = createApiOperation<
  AllocateExternalPartyParams,
  AllocateExternalPartyResponse
>({
  paramsSchema: AllocateExternalPartyParamsSchema,
  method: 'POST',
  buildUrl: (_params: AllocateExternalPartyParams, apiUrl: string) =>
    `${apiUrl}/v2/parties/external/allocate`,
  buildRequestData: (params: AllocateExternalPartyParams, _client: BaseClient): GeneratedRequest => ({
    synchronizer: params.synchronizer,
    identityProviderId: params.identityProviderId,
    ...(params.onboardingTransactions && {
      onboardingTransactions: params.onboardingTransactions,
    }),
    ...(params.multiHashSignatures && {
      multiHashSignatures: params.multiHashSignatures,
    }),
  }),
});
