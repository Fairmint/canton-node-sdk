import { type GetDecentralizedSynchronizerConnectionConfigResponse, type ValidatorApiClient } from '../../src';
import type { operations } from '../../src/generated/apps/validator/src/main/openapi/validator-internal';

type GeneratedResponse =
  operations['getDecentralizedSynchronizerConnectionConfig']['responses']['200']['content']['application/json'];
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Assert<Condition extends true> = Condition;

export type ResponseMatchesGeneratedContract = Assert<
  Equal<GetDecentralizedSynchronizerConnectionConfigResponse, GeneratedResponse>
>;

type ClientResponse = Awaited<ReturnType<ValidatorApiClient['getDecentralizedSynchronizerConnectionConfig']>>;
export type ClientMethodReturnsPublicResponse = Assert<
  Equal<ClientResponse, GetDecentralizedSynchronizerConnectionConfigResponse>
>;

const response: GetDecentralizedSynchronizerConnectionConfigResponse = {
  sequencer_connections: {
    connections: [
      {
        sequencer_alias: 'sequencer-1',
        endpoints: ['https://sequencer.example.com:443'],
        transport_security: true,
      },
    ],
    sequencer_trust_threshold: 1,
    sequencer_liveness_margin: 2,
    submission_request_amplification: {
      factor: 3,
      patience_seconds: 5,
    },
  },
};

const missingPatience: GetDecentralizedSynchronizerConnectionConfigResponse = {
  sequencer_connections: {
    connections: [],
    sequencer_trust_threshold: 1,
    sequencer_liveness_margin: 2,
    // @ts-expect-error The complete nested amplification shape is required.
    submission_request_amplification: { factor: 3 },
  },
};

const wrongCase: GetDecentralizedSynchronizerConnectionConfigResponse = {
  // @ts-expect-error The endpoint returns snake_case wire keys.
  sequencerConnections: response.sequencer_connections,
};

void response;
void missingPatience;
void wrongCase;
