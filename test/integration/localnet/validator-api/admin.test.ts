/** ValidatorApiClient integration tests: Admin Operations */

import { GetDecentralizedSynchronizerConnectionConfigResponseSchema } from '../../../../src';
import { getClient } from './setup';

describe('ValidatorApiClient / Admin', () => {
  test('dumpParticipantIdentities returns identities', async () => {
    const client = getClient();
    const response = await client.dumpParticipantIdentities();

    expect(response).toBeDefined();
    expect(response.id).toBeDefined();
  });

  test('listUsers returns user list', async () => {
    const client = getClient();
    const response = await client.listUsers();

    expect(response).toBeDefined();
    expect(Array.isArray(response.usernames)).toBe(true);
  });

  test('getDecentralizedSynchronizerConnectionConfig returns the complete live wire shape', async () => {
    const response = await getClient().getDecentralizedSynchronizerConnectionConfig();

    expect(GetDecentralizedSynchronizerConnectionConfigResponseSchema.parse(response)).toEqual(response);
    expect(Object.keys(response)).toEqual(['sequencer_connections']);

    const config = response.sequencer_connections;
    expect(Object.keys(config).sort()).toEqual([
      'connections',
      'sequencer_liveness_margin',
      'sequencer_trust_threshold',
      'submission_request_amplification',
    ]);
    expect(config.connections.length).toBeGreaterThan(0);
    expect(Number.isInteger(config.sequencer_trust_threshold)).toBe(true);
    expect(Number.isInteger(config.sequencer_liveness_margin)).toBe(true);

    for (const connection of config.connections) {
      expect(Object.keys(connection).sort()).toEqual(['endpoints', 'sequencer_alias', 'transport_security']);
      expect(connection.sequencer_alias.length).toBeGreaterThan(0);
      expect(connection.endpoints.length).toBeGreaterThan(0);
      for (const endpoint of connection.endpoints) {
        expect(endpoint.length).toBeGreaterThan(0);
      }
      expect(typeof connection.transport_security).toBe('boolean');
    }

    const amplification = config.submission_request_amplification;
    expect(Object.keys(amplification).sort()).toEqual(['factor', 'patience_seconds']);
    expect(Number.isFinite(amplification.factor)).toBe(true);
    expect(Number.isFinite(amplification.patience_seconds)).toBe(true);
  });
});
