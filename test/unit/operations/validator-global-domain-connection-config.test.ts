import {
  GetDecentralizedSynchronizerConnectionConfig,
  type GetDecentralizedSynchronizerConnectionConfigResponse,
  GetDecentralizedSynchronizerConnectionConfigResponseSchema,
} from '../../../src/clients/validator-api';
import type { BaseClient } from '../../../src/core';

const response = {
  sequencer_connections: {
    connections: [
      {
        sequencer_alias: 'sequencer-1',
        endpoints: ['https://sequencer-1.example.com:443', 'https://sequencer-1-backup.example.com:443'],
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
} satisfies GetDecentralizedSynchronizerConnectionConfigResponse;

function createClient(makeGetRequest: jest.Mock): BaseClient {
  return {
    getApiUrl: (): string => 'https://validator.example',
    makeGetRequest,
  } as unknown as BaseClient;
}

describe('validator global synchronizer connection configuration', () => {
  it('gets the exact admin endpoint and returns the validated complete response', async (): Promise<void> => {
    const makeGetRequest = jest.fn().mockResolvedValue(response);

    await expect(
      new GetDecentralizedSynchronizerConnectionConfig(createClient(makeGetRequest)).execute(undefined)
    ).resolves.toEqual(response);

    expect(makeGetRequest).toHaveBeenCalledWith(
      'https://validator.example/api/validator/v0/admin/participant/global-domain-connection-config',
      {
        contentType: 'application/json',
        includeBearerToken: true,
      }
    );
  });

  it('validates every nested response field and rejects unknown wire fields', (): void => {
    expect(GetDecentralizedSynchronizerConnectionConfigResponseSchema.parse(response)).toEqual(response);

    expect(() =>
      GetDecentralizedSynchronizerConnectionConfigResponseSchema.parse({
        ...response,
        sequencer_connections: {
          ...response.sequencer_connections,
          connections: [
            {
              ...response.sequencer_connections.connections[0],
              endpoint: 'misspelled-field',
            },
          ],
        },
      })
    ).toThrow();

    expect(() =>
      GetDecentralizedSynchronizerConnectionConfigResponseSchema.parse({
        ...response,
        sequencer_connections: {
          ...response.sequencer_connections,
          submission_request_amplification: {
            factor: 3,
          },
        },
      })
    ).toThrow();
  });

  it('enforces the int32 wire format for synchronizer integer settings', (): void => {
    expect(() =>
      GetDecentralizedSynchronizerConnectionConfigResponseSchema.parse({
        ...response,
        sequencer_connections: {
          ...response.sequencer_connections,
          sequencer_trust_threshold: 1.5,
        },
      })
    ).toThrow();

    expect(() =>
      GetDecentralizedSynchronizerConnectionConfigResponseSchema.parse({
        ...response,
        sequencer_connections: {
          ...response.sequencer_connections,
          sequencer_liveness_margin: 2_147_483_648,
        },
      })
    ).toThrow();
  });
});
