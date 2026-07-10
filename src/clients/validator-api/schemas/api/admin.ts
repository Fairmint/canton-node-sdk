import { z } from 'zod';
import {
  type components,
  type operations,
} from '../../../../generated/apps/validator/src/main/openapi/validator-internal';

export type SequencerAliasToConnections = components['schemas']['SequencerAliasToConnections'];
export type SequencerSubmissionRequestAmplification = components['schemas']['SequencerSubmissionRequestAmplification'];
export type SequencerConnections = components['schemas']['SequencerConnections'];
export type GetDecentralizedSynchronizerConnectionConfigResponse =
  operations['getDecentralizedSynchronizerConnectionConfig']['responses']['200']['content']['application/json'];

/** Exact wire schema for one sequencer alias and its network endpoints. */
export const SequencerAliasToConnectionsSchema: z.ZodType<SequencerAliasToConnections> = z.strictObject({
  sequencer_alias: z.string(),
  endpoints: z.array(z.string()),
  transport_security: z.boolean(),
});

/** Exact wire schema for submission amplification settings. */
export const SequencerSubmissionRequestAmplificationSchema: z.ZodType<SequencerSubmissionRequestAmplification> =
  z.strictObject({
    factor: z.number(),
    patience_seconds: z.number(),
  });

/** Exact wire schema for the validator's global synchronizer sequencer configuration. */
export const SequencerConnectionsSchema: z.ZodType<SequencerConnections> = z.strictObject({
  connections: z.array(SequencerAliasToConnectionsSchema),
  sequencer_trust_threshold: z.int32(),
  sequencer_liveness_margin: z.int32(),
  submission_request_amplification: SequencerSubmissionRequestAmplificationSchema,
});

/** Exact response schema for the global synchronizer connection configuration endpoint. */
export const GetDecentralizedSynchronizerConnectionConfigResponseSchema: z.ZodType<GetDecentralizedSynchronizerConnectionConfigResponse> =
  z.strictObject({
    sequencer_connections: SequencerConnectionsSchema,
  });
