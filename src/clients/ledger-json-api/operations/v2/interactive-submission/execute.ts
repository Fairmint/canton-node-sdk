import { z } from 'zod';
import { type BaseClient, createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

// Type aliases for better readability
type GeneratedRequest =
  paths['/v2/interactive-submission/execute']['post']['requestBody']['content']['application/json'];
type GeneratedResponse =
  paths['/v2/interactive-submission/execute']['post']['responses']['200']['content']['application/json'];

// Schema for a single signature
const SignatureSchema = z.object({
  /** Signature format */
  format: z.string(),
  /** Base64-encoded signature */
  signature: z.string(),
  /** Public key fingerprint that signed */
  signedBy: z.string(),
  /** Signing algorithm specification */
  signingAlgorithmSpec: z.string(),
});

// Schema for single party signatures
const SinglePartySignaturesSchema = z.object({
  /** Party that provided these signatures */
  party: z.string(),
  /** Array of signatures from this party */
  signatures: z.array(SignatureSchema),
});

// Schema for party signatures
const PartySignaturesSchema = z.object({
  /** Signatures provided by all parties */
  signatures: z.array(SinglePartySignaturesSchema),
});

// Schema for deduplication period - simplified for user input
const DeduplicationPeriodSchema = z.any(); // Accept any structure, will be transformed

// Schema for the parameters
export const ExecuteSubmissionParamsSchema = z.object({
  /** User ID for the submission (optional if using user token) */
  userId: z.string().optional(),
  /** The prepared transaction from prepare endpoint */
  preparedTransaction: z.string(),
  /** Party signatures authorizing the transaction */
  partySignatures: PartySignaturesSchema,
  /** Deduplication period */
  deduplicationPeriod: DeduplicationPeriodSchema,
  /** Unique submission identifier (typically a UUID) */
  submissionId: z.string(),
  /** Hashing scheme version from prepare response */
  hashingSchemeVersion: z.union([
    z.literal('HASHING_SCHEME_VERSION_UNSPECIFIED'),
    z.literal('HASHING_SCHEME_VERSION_V2'),
  ]),
  /** Application ID (optional) */
  applicationId: z.string().optional(),
});

export type ExecuteSubmissionParams = z.infer<typeof ExecuteSubmissionParamsSchema>;

export type ExecuteSubmissionResponse = GeneratedResponse;

/**
 * Execute a prepared transaction with external signatures
 *
 * This endpoint submits a prepared transaction along with signatures from external parties.
 * The prepared transaction should come from the prepare endpoint, and the hash from that
 * response should have been signed by the party's external key.
 *
 * @example
 *   ```typescript
 *   const result = await client.executeSubmission({
 *     preparedTransaction: prepared.preparedTransaction,
 *     partySignatures: {
 *       signatures: [{
 *         party: 'alice::12abc...',
 *         signatures: [{
 *           format: 'SIGNATURE_FORMAT_RAW',
 *           signature: 'base64-encoded-signature',
 *           signedBy: 'public-key-fingerprint',
 *           signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_ED25519'
 *         }]
 *       }]
 *     },
 *     deduplicationPeriod: {
 *       DeduplicationDuration: { duration: '30s' }
 *     },
 *     submissionId: 'sub-123',
 *     hashingSchemeVersion: prepared.hashingSchemeVersion,
 *   });
 *   ```;
 */
export const ExecuteSubmission = createApiOperation<ExecuteSubmissionParams, ExecuteSubmissionResponse>({
  paramsSchema: ExecuteSubmissionParamsSchema,
  method: 'POST',
  buildUrl: (_params: ExecuteSubmissionParams, apiUrl: string) => `${apiUrl}/v2/interactive-submission/execute`,
  buildRequestData: (params: ExecuteSubmissionParams, _client: BaseClient): GeneratedRequest => ({
    userId: params.userId ?? '',
    preparedTransaction: params.preparedTransaction,
    partySignatures: params.partySignatures,
    deduplicationPeriod: params.deduplicationPeriod as any,
    submissionId: params.submissionId,
    hashingSchemeVersion: params.hashingSchemeVersion as any,
    ...(params.applicationId && { applicationId: params.applicationId }),
  }),
});
