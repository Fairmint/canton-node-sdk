import * as http from 'http';
import { ScanApiClient } from '../../../src';

interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

function json(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

// Mock responses that match the OpenAPI spec
const mockResponses = {
  version: {
    version: '0.5.4',
  },
  healthStatus: {
    status: 'serving',
  },
  dsoInfo: {
    sv_user: 'sv-user-1',
    sv_party_id: 'PAR::sv-party::1234567890abcdef',
    dso_party_id: 'PAR::dso-party::fedcba0987654321',
    voting_threshold: 3,
    latest_open_mining_round: {
      contract: {
        contract_id: 'contract-id-open-round',
        template_id: 'Splice.Round:OpenMiningRound',
        payload: {
          round: { number: 42 },
          amulet_price: '1.5',
        },
      },
      domain_id: 'domain-1',
    },
    amulet_rules: {
      contract: {
        contract_id: 'contract-id-amulet-rules',
        template_id: 'Splice.AmuletRules:AmuletRules',
        payload: {},
      },
      domain_id: 'domain-1',
    },
    sv_node_states: {},
  },
  dsoPartyId: {
    dso_party_id: 'PAR::dso-party::fedcba0987654321',
  },
  listDsoScans: {
    scans: {
      'domain::1234567890abcdef': [
        { public_url: 'https://scan.sv-1.example.com', sv_name: 'SV-1' },
        { public_url: 'https://scan.sv-2.example.com', sv_name: 'SV-2' },
      ],
    },
  },
  listDsoSequencers: {
    sequencers: {
      'domain::1234567890abcdef': [
        { sequencer_id: 'sequencer-1', url: 'https://sequencer-1.example.com' },
      ],
    },
  },
  openAndIssuingRounds: {
    open_mining_rounds: {
      '42': {
        contract: {
          contract_id: 'open-round-42',
          template_id: 'Splice.Round:OpenMiningRound',
          payload: { round: { number: 42 } },
        },
        domain_id: 'domain-1',
      },
    },
    issuing_mining_rounds: {
      '41': {
        contract: {
          contract_id: 'issuing-round-41',
          template_id: 'Splice.Round:IssuingMiningRound',
          payload: { round: { number: 41 } },
        },
        domain_id: 'domain-1',
      },
    },
    amulet_rules: {
      contract: { contract_id: 'amulet-rules-1', template_id: 'Splice.AmuletRules:AmuletRules', payload: {} },
      domain_id: 'domain-1',
    },
  },
  aggregatedRounds: {
    rounds: [
      { round_number: 40, total_amulet_balance: '1000.0' },
      { round_number: 41, total_amulet_balance: '1050.0' },
    ],
  },
  closedRounds: {
    closed_rounds: [
      {
        round: { number: 39 },
        closed_at: '2024-01-01T00:00:00Z',
      },
    ],
  },
  roundOfLatestData: {
    round: 42,
  },
  rewardsCollected: {
    app_rewards: '100.0',
    validator_rewards: '50.0',
    sv_rewards: '25.0',
  },
  totalAmuletBalance: {
    total_balance: '10000.5',
    as_of_round: 42,
  },
  amuletRules: {
    amulet_rules: {
      contract: {
        contract_id: 'amulet-rules-contract-id',
        template_id: 'Splice.AmuletRules:AmuletRules',
        payload: {},
      },
      domain_id: 'domain-1',
    },
  },
  memberTrafficStatus: {
    traffic_state: {
      extra_traffic_purchased: 1000000,
      extra_traffic_consumed: 500000,
      base_traffic_remainder: 100000,
      last_consumed_cost: 1000,
      timestamp: '2024-01-15T12:00:00Z',
      serial: 42,
    },
  },
  featuredAppRights: {
    featured_app_rights: [
      { provider: 'provider-1', app_url: 'https://app1.example.com' },
    ],
  },
  ansRules: {
    ans_rules: {
      contract: {
        contract_id: 'ans-rules-contract-id',
        template_id: 'Splice.Ans:AnsRules',
        payload: {},
      },
      domain_id: 'domain-1',
    },
  },
  ansEntries: {
    entries: [
      { name: 'alice.canton', party: 'PAR::alice::1234' },
      { name: 'bob.canton', party: 'PAR::bob::5678' },
    ],
  },
  lookupAnsEntry: {
    entry: { name: 'alice.canton', party: 'PAR::alice::1234' },
  },
  validatorLicenses: {
    validator_licenses: [
      {
        validator: 'PAR::validator-1::abcd',
        sponsor: 'PAR::sponsor-1::1234',
      },
    ],
    next_page_token: null,
  },
  listVoteRequests: {
    dso_rules_vote_requests: [],
  },
  listVoteResults: {
    dso_rules_vote_results: [],
  },
  amuletPriceVotes: {
    amulet_price_votes: [
      { sv: 'sv-1', price: '1.50' },
      { sv: 'sv-2', price: '1.52' },
    ],
  },
  migrationSchedule: {
    schedule: null,
  },
  spliceInstanceNames: {
    network_name: 'Canton Network',
    network_favicon_url: 'https://canton.network/favicon.ico',
    amulet_name: 'Canton Coin',
    amulet_name_acronym: 'CC',
    name_service_name: 'Canton Name Service',
    name_service_name_acronym: 'CNS',
  },
};

function handleRequest(method: string, path: string, res: http.ServerResponse): void {
  // Common endpoints
  if (method === 'GET' && path === '/api/scan/version') {
    json(res, 200, mockResponses.version);
    return;
  }
  if (method === 'GET' && path === '/api/scan/livez') {
    res.writeHead(200);
    res.end();
    return;
  }
  if (method === 'GET' && path === '/api/scan/readyz') {
    res.writeHead(200);
    res.end();
    return;
  }
  if (method === 'GET' && path === '/api/scan/status') {
    json(res, 200, mockResponses.healthStatus);
    return;
  }

  // DSO endpoints (v0)
  if (method === 'GET' && path === '/api/scan/v0/dso-party-id') {
    json(res, 200, mockResponses.dsoPartyId);
    return;
  }
  if (method === 'GET' && path === '/api/scan/v0/dso') {
    json(res, 200, mockResponses.dsoInfo);
    return;
  }
  if (method === 'GET' && path === '/api/scan/v0/dso/sv-and-dso-party-ids') {
    json(res, 200, {
      sv_party_id: mockResponses.dsoInfo.sv_party_id,
      dso_party_id: mockResponses.dsoInfo.dso_party_id,
    });
    return;
  }
  if (method === 'GET' && path === '/api/scan/v0/scans') {
    json(res, 200, mockResponses.listDsoScans);
    return;
  }
  if (method === 'GET' && path === '/api/scan/v0/dso-sequencers') {
    json(res, 200, mockResponses.listDsoSequencers);
    return;
  }

  // Rounds endpoints
  if (method === 'POST' && path === '/api/scan/v0/open-and-issuing-mining-rounds') {
    json(res, 200, mockResponses.openAndIssuingRounds);
    return;
  }
  if (method === 'GET' && path === '/api/scan/v0/aggregated-rounds') {
    json(res, 200, mockResponses.aggregatedRounds);
    return;
  }
  if (method === 'GET' && path === '/api/scan/v0/closed-rounds') {
    json(res, 200, mockResponses.closedRounds);
    return;
  }
  if (method === 'GET' && path === '/api/scan/v0/round-of-latest-data') {
    json(res, 200, mockResponses.roundOfLatestData);
    return;
  }
  if (method === 'GET' && path.startsWith('/api/scan/v0/rewards-collected')) {
    json(res, 200, mockResponses.rewardsCollected);
    return;
  }
  if (method === 'GET' && path.startsWith('/api/scan/v0/total-amulet-balance')) {
    json(res, 200, mockResponses.totalAmuletBalance);
    return;
  }

  // Amulet endpoints
  if (method === 'POST' && path === '/api/scan/v0/amulet-rules') {
    json(res, 200, mockResponses.amuletRules);
    return;
  }

  // Traffic status (member traffic)
  if (method === 'GET' && path.match(/\/api\/scan\/v0\/domains\/[^/]+\/members\/[^/]+\/traffic-status/)) {
    json(res, 200, mockResponses.memberTrafficStatus);
    return;
  }

  // Featured apps
  if (method === 'GET' && path === '/api/scan/v0/featured-app-rights') {
    json(res, 200, mockResponses.featuredAppRights);
    return;
  }

  // ANS endpoints
  if (method === 'POST' && path === '/api/scan/v0/ans-rules') {
    json(res, 200, mockResponses.ansRules);
    return;
  }
  if (method === 'GET' && path.startsWith('/api/scan/v0/ans-entries?')) {
    json(res, 200, mockResponses.ansEntries);
    return;
  }
  if (method === 'GET' && path.startsWith('/api/scan/v0/ans-entries/by-name/')) {
    json(res, 200, mockResponses.lookupAnsEntry);
    return;
  }
  if (method === 'GET' && path.startsWith('/api/scan/v0/ans-entries/by-party/')) {
    json(res, 200, mockResponses.lookupAnsEntry);
    return;
  }

  // Validator licenses
  if (method === 'GET' && path === '/api/scan/v0/admin/validator/licenses') {
    json(res, 200, mockResponses.validatorLicenses);
    return;
  }

  // Votes
  if (method === 'GET' && path === '/api/scan/v0/dso-rules-vote-requests') {
    json(res, 200, mockResponses.listVoteRequests);
    return;
  }
  if (method === 'POST' && path === '/api/scan/v0/dso-rules-vote-results') {
    json(res, 200, mockResponses.listVoteResults);
    return;
  }
  if (method === 'GET' && path === '/api/scan/v0/amulet-price-votes') {
    json(res, 200, mockResponses.amuletPriceVotes);
    return;
  }

  // Migration
  if (method === 'GET' && path === '/api/scan/v0/migration-schedule') {
    json(res, 200, mockResponses.migrationSchedule);
    return;
  }
  if (method === 'GET' && path === '/api/scan/v0/splice-instance-names') {
    json(res, 200, mockResponses.spliceInstanceNames);
    return;
  }

  // Fallback
  json(res, 404, { error: 'not_found', method, path });
}

async function startTestServer(): Promise<TestServer> {
  const server = http.createServer((req, res) => {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    // Include query string in path for matching
    const path = url.pathname + url.search;

    // Drain request body then handle
    req.on('data', () => undefined);
    req.on('end', () => {
      handleRequest(method, path, res);
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind test server');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

describe('Scan API Client', () => {
  let server: TestServer;
  let client: ScanApiClient;

  beforeAll(async () => {
    server = await startTestServer();
    client = new ScanApiClient({
      network: 'devnet',
      endpoints: [{ name: 'test-server', url: server.baseUrl }],
    });
  });

  afterAll(async () => {
    await server.close();
  });

  describe('Common endpoints', () => {
    it('getVersion', async () => {
      const response = await client.getVersion({});
      expect(response).toEqual({ version: '0.5.4' });
    });

    it('getHealthStatus', async () => {
      const response = await client.getHealthStatus({});
      expect(response).toEqual({ status: 'serving' });
    });

    it('isLive', async () => {
      await expect(client.isLive({})).resolves.toBeUndefined();
    });

    it('isReady', async () => {
      await expect(client.isReady({})).resolves.toBeUndefined();
    });
  });

  describe('DSO endpoints', () => {
    it('getDsoInfo', async () => {
      const response = await client.getDsoInfo({});
      expect(response).toEqual(mockResponses.dsoInfo);
    });

    it('getDsoPartyId', async () => {
      const response = await client.getDsoPartyId({});
      expect(response).toEqual({ dso_party_id: 'PAR::dso-party::fedcba0987654321' });
    });

    it('listDsoScans', async () => {
      const response = await client.listDsoScans({});
      expect(response).toEqual(mockResponses.listDsoScans);
    });

    it('listDsoSequencers', async () => {
      const response = await client.listDsoSequencers({});
      expect(response).toEqual(mockResponses.listDsoSequencers);
    });
  });

  describe('Rounds endpoints', () => {
    it('getOpenAndIssuingMiningRounds', async () => {
      const response = await client.getOpenAndIssuingMiningRounds({});
      expect(response).toEqual(mockResponses.openAndIssuingRounds);
    });

    it('getAggregatedRounds', async () => {
      const response = await client.getAggregatedRounds({});
      expect(response).toEqual(mockResponses.aggregatedRounds);
    });

    it('getClosedRounds', async () => {
      const response = await client.getClosedRounds({});
      expect(response).toEqual(mockResponses.closedRounds);
    });

    it('getRoundOfLatestData', async () => {
      const response = await client.getRoundOfLatestData({});
      expect(response).toEqual({ round: 42 });
    });

    it('getRewardsCollected', async () => {
      const response = await client.getRewardsCollected({});
      expect(response).toEqual(mockResponses.rewardsCollected);
    });

    it('getTotalAmuletBalance', async () => {
      const response = await client.getTotalAmuletBalance({ asOfEndOfRound: 42 });
      expect(response).toEqual(mockResponses.totalAmuletBalance);
    });
  });

  describe('Traffic status', () => {
    it('getMemberTrafficStatus', async () => {
      const response = await client.getMemberTrafficStatus({
        domainId: 'domain-1',
        memberId: 'PAR::member::1234',
      });
      expect(response).toEqual(mockResponses.memberTrafficStatus);
    });
  });

  describe('Amulet endpoints', () => {
    it('getAmuletRules', async () => {
      const response = await client.getAmuletRules({});
      expect(response).toEqual(mockResponses.amuletRules);
    });
  });

  describe('Featured apps', () => {
    it('listFeaturedAppRights', async () => {
      const response = await client.listFeaturedAppRights({});
      expect(response).toEqual(mockResponses.featuredAppRights);
    });
  });

  describe('ANS endpoints', () => {
    it('getAnsRules', async () => {
      const response = await client.getAnsRules({});
      expect(response).toEqual(mockResponses.ansRules);
    });

    it('listAnsEntries', async () => {
      const response = await client.listAnsEntries({ pageSize: 10 });
      expect(response).toEqual(mockResponses.ansEntries);
    });

    it('lookupAnsEntryByName', async () => {
      const response = await client.lookupAnsEntryByName({ name: 'alice.canton' });
      expect(response).toEqual(mockResponses.lookupAnsEntry);
    });

    it('lookupAnsEntryByParty', async () => {
      const response = await client.lookupAnsEntryByParty({ party: 'PAR::alice::1234' });
      expect(response).toEqual(mockResponses.lookupAnsEntry);
    });
  });

  describe('Validator endpoints', () => {
    it('listValidatorLicenses', async () => {
      const response = await client.listValidatorLicenses({});
      expect(response).toEqual(mockResponses.validatorLicenses);
    });
  });

  describe('Vote endpoints', () => {
    it('listDsoRulesVoteRequests', async () => {
      const response = await client.listDsoRulesVoteRequests({});
      expect(response).toEqual(mockResponses.listVoteRequests);
    });

    it('listVoteRequestResults', async () => {
      const response = await client.listVoteRequestResults({});
      expect(response).toEqual(mockResponses.listVoteResults);
    });

    it('listAmuletPriceVotes', async () => {
      const response = await client.listAmuletPriceVotes({});
      expect(response).toEqual(mockResponses.amuletPriceVotes);
    });
  });

  describe('Migration endpoints', () => {
    it('getMigrationSchedule', async () => {
      const response = await client.getMigrationSchedule({});
      expect(response).toEqual({ schedule: null });
    });

    it('getSpliceInstanceNames', async () => {
      const response = await client.getSpliceInstanceNames({});
      expect(response).toEqual(mockResponses.spliceInstanceNames);
    });
  });
});
