import {
  ListOwnedAnsEntries,
  type ListOwnedAnsEntriesResponse,
} from '../../../src/clients/validator-api/operations/v0/ans/list-owned-entries';
import {
  GetDsoInfo,
  type GetDsoInfoResponse,
} from '../../../src/clients/validator-api/operations/v0/scan-proxy/get-dso-info';
import {
  GetHoldingsSummaryAtV1,
  type GetHoldingsSummaryAtV1Params,
  type GetHoldingsSummaryAtV1Response,
} from '../../../src/clients/validator-api/operations/v0/scan-proxy/get-holdings-summary-at-v1';
import {
  ListAnsEntries,
  type ListAnsEntriesResponse,
} from '../../../src/clients/validator-api/operations/v0/scan-proxy/list-ans-entries';
import {
  ListUnclaimedDevelopmentFundCoupons,
  type ListUnclaimedDevelopmentFundCouponsResponse,
} from '../../../src/clients/validator-api/operations/v0/scan-proxy/list-unclaimed-development-fund-coupons';
import {
  LookupTransferCommandCounterByParty,
  type LookupTransferCommandCounterByPartyResponse,
} from '../../../src/clients/validator-api/operations/v0/scan-proxy/lookup-transfer-command-counter-by-party';
import {
  LookupTransferCommandStatus,
  type LookupTransferCommandStatusResponse,
} from '../../../src/clients/validator-api/operations/v0/scan-proxy/lookup-transfer-command-status';
import type { BaseClient } from '../../../src/core';
import type { components } from '../../../src/generated/apps/validator/src/main/openapi/scan-proxy';

const REQUEST_CONFIG = {
  contentType: 'application/json',
  includeBearerToken: true,
};

const CONTRACT: components['schemas']['Contract'] = {
  template_id: 'package:Module:Template',
  contract_id: '00contract',
  payload: {},
  created_event_blob: 'created-event-blob',
  created_at: '2026-07-09T12:00:00Z',
};

const CONTRACT_WITH_STATE: components['schemas']['ContractWithState'] = {
  contract: CONTRACT,
  domain_id: 'domain::namespace',
};

function createClient(makeGetRequest: jest.Mock = jest.fn(), makePostRequest: jest.Mock = jest.fn()): BaseClient {
  return {
    getApiUrl: () => 'https://validator.example',
    makeGetRequest,
    makePostRequest,
  } as unknown as BaseClient;
}

describe('validator scan-proxy parity', () => {
  it('gets a transfer-command counter from the current encoded party path and preserves its generated response', async () => {
    const response: LookupTransferCommandCounterByPartyResponse = {
      transfer_command_counter: CONTRACT_WITH_STATE,
    };
    const makeGetRequest = jest.fn().mockResolvedValue(response);

    const result = await new LookupTransferCommandCounterByParty(createClient(makeGetRequest)).execute({
      party: 'alice/ops::namespace',
    });
    const typedResult: LookupTransferCommandCounterByPartyResponse = result;

    expect(typedResult).toBe(response);
    expect(makeGetRequest).toHaveBeenCalledWith(
      'https://validator.example/api/validator/v0/scan-proxy/transfer-command-counter/alice%2Fops%3A%3Anamespace',
      REQUEST_CONFIG
    );
  });

  it('gets transfer-command statuses with sender and nonce query parameters', async () => {
    const response: LookupTransferCommandStatusResponse = {
      transfer_commands_by_contract_id: {
        '00transfer-command': {
          contract: CONTRACT,
          status: {
            status: 'failed',
            failure_kind: 'expired',
            reason: 'The transfer command expired',
          },
        },
      },
    };
    const makeGetRequest = jest.fn().mockResolvedValue(response);

    const result = await new LookupTransferCommandStatus(createClient(makeGetRequest)).execute({
      sender: 'alice/ops::namespace',
      nonce: 42,
    });
    const typedResult: LookupTransferCommandStatusResponse = result;

    expect(typedResult).toBe(response);
    expect(makeGetRequest).toHaveBeenCalledWith(
      'https://validator.example/api/validator/v0/scan-proxy/transfer-command/status?sender=alice%2Fops%3A%3Anamespace&nonce=42',
      REQUEST_CONFIG
    );
  });

  it('preserves nonce zero and rejects fractional transfer-command nonces', async () => {
    const makeGetRequest = jest.fn().mockResolvedValue({
      transfer_commands_by_contract_id: {},
    } satisfies LookupTransferCommandStatusResponse);
    const operation = new LookupTransferCommandStatus(createClient(makeGetRequest));

    await operation.execute({ sender: 'alice+ops::namespace', nonce: 0 });

    expect(makeGetRequest).toHaveBeenCalledWith(
      'https://validator.example/api/validator/v0/scan-proxy/transfer-command/status?sender=alice%2Bops%3A%3Anamespace&nonce=0',
      REQUEST_CONFIG
    );

    makeGetRequest.mockClear();
    await expect(operation.execute({ sender: 'alice::namespace', nonce: 0.5 })).rejects.toThrow(
      'Parameter validation failed'
    );
    expect(makeGetRequest).not.toHaveBeenCalled();
  });

  it('gets DSO information through the validator scan proxy', async () => {
    const response: GetDsoInfoResponse = {
      sv_user: 'sv-user',
      sv_party_id: 'sv::namespace',
      dso_party_id: 'dso::namespace',
      voting_threshold: 3,
      latest_mining_round: CONTRACT_WITH_STATE,
      amulet_rules: CONTRACT_WITH_STATE,
      dso_rules: CONTRACT_WITH_STATE,
      sv_node_states: [CONTRACT_WITH_STATE],
      initial_round: '1',
    };
    const makeGetRequest = jest.fn().mockResolvedValue(response);

    const result = await new GetDsoInfo(createClient(makeGetRequest)).execute(undefined);
    const typedResult: GetDsoInfoResponse = result;

    expect(typedResult).toBe(response);
    expect(makeGetRequest).toHaveBeenCalledWith(
      'https://validator.example/api/validator/v0/scan-proxy/dso',
      REQUEST_CONFIG
    );
  });

  it('lists scan-wide ANS entries with exact query parameter names', async () => {
    const response: ListAnsEntriesResponse = {
      entries: [
        {
          contract_id: '00ans-entry',
          user: 'alice::namespace',
          name: 'alice.unverified.ans',
          url: 'https://alice.example',
          description: 'Alice Labs',
          expires_at: '2027-07-09T12:00:00Z',
        },
      ],
    };
    const makeGetRequest = jest.fn().mockResolvedValue(response);

    const result = await new ListAnsEntries(createClient(makeGetRequest)).execute({
      name_prefix: 'alice labs',
      page_size: 25,
    });
    const typedResult: ListAnsEntriesResponse = result;

    expect(typedResult).toBe(response);
    expect(makeGetRequest).toHaveBeenCalledWith(
      'https://validator.example/api/validator/v0/scan-proxy/ans-entries?name_prefix=alice+labs&page_size=25',
      REQUEST_CONFIG
    );
  });

  it('encodes reserved ANS prefix characters and enforces an int32 page size', async () => {
    const makeGetRequest = jest.fn().mockResolvedValue({ entries: [] } satisfies ListAnsEntriesResponse);
    const operation = new ListAnsEntries(createClient(makeGetRequest));

    await operation.execute({ name_prefix: 'alice & bob/+', page_size: 2_147_483_647 });

    expect(makeGetRequest).toHaveBeenCalledWith(
      'https://validator.example/api/validator/v0/scan-proxy/ans-entries?name_prefix=alice+%26+bob%2F%2B&page_size=2147483647',
      REQUEST_CONFIG
    );

    makeGetRequest.mockClear();
    await expect(operation.execute({ page_size: 1.5 })).rejects.toThrow('Parameter validation failed');
    await expect(operation.execute({ page_size: 2_147_483_648 })).rejects.toThrow('Parameter validation failed');
    expect(makeGetRequest).not.toHaveBeenCalled();
  });

  it('keeps the authenticated owned-entry listing under its distinct method name', async () => {
    const response: ListOwnedAnsEntriesResponse = {
      entries: [
        {
          contractId: '00owned-ans-entry',
          name: 'alice.unverified.ans',
          amount: '1.0',
          unit: 'USD',
          expiresAt: '2027-07-09T12:00:00Z',
          paymentInterval: 'P30D',
          paymentDuration: 'P365D',
        },
      ],
    };
    const makeGetRequest = jest.fn().mockResolvedValue(response);

    const result = await new ListOwnedAnsEntries(createClient(makeGetRequest)).execute(undefined);
    const typedResult: ListOwnedAnsEntriesResponse = result;

    expect(typedResult).toBe(response);
    expect(makeGetRequest).toHaveBeenCalledWith('https://validator.example/api/validator/v0/entry/all', REQUEST_CONFIG);
  });

  it('posts the v1 holdings request without overriding the server exact-match default', async () => {
    const request = {
      migration_id: 7,
      record_time: '2026-07-09T12:00:00Z',
      owner_party_ids: ['alice::namespace'],
    } satisfies GetHoldingsSummaryAtV1Params;
    const response: GetHoldingsSummaryAtV1Response = {
      record_time: request.record_time,
      migration_id: request.migration_id,
      summaries: [
        {
          party_id: 'alice::namespace',
          total_unlocked_coin: '10.0',
          total_locked_coin: '2.0',
          total_coin_holdings: '12.0',
        },
      ],
    };
    const makePostRequest = jest.fn().mockResolvedValue(response);

    const result = await new GetHoldingsSummaryAtV1(createClient(undefined, makePostRequest)).execute(request);
    const typedResult: GetHoldingsSummaryAtV1Response = result;

    expect(typedResult).toBe(response);
    expect(makePostRequest).toHaveBeenCalledWith(
      'https://validator.example/api/validator/v1/scan-proxy/holdings/summary',
      request,
      REQUEST_CONFIG
    );
    expect(makePostRequest.mock.calls[0]?.[1]).not.toHaveProperty('record_time_match');
  });

  it('sends an at-or-before holdings override and rejects an empty owner list', async () => {
    const makePostRequest = jest.fn().mockResolvedValue({
      record_time: '2026-07-09T12:00:00Z',
      migration_id: 7,
      summaries: [],
    } satisfies GetHoldingsSummaryAtV1Response);
    const operation = new GetHoldingsSummaryAtV1(createClient(undefined, makePostRequest));
    const request = {
      migration_id: 7,
      record_time: '2026-07-09T12:00:00Z',
      record_time_match: 'at_or_before',
      owner_party_ids: ['alice::namespace'],
    } satisfies GetHoldingsSummaryAtV1Params;

    await operation.execute(request);

    expect(makePostRequest).toHaveBeenCalledWith(
      'https://validator.example/api/validator/v1/scan-proxy/holdings/summary',
      request,
      REQUEST_CONFIG
    );

    makePostRequest.mockClear();
    await expect(
      operation.execute({
        migration_id: 7,
        record_time: '2026-07-09T12:00:00Z',
        owner_party_ids: [],
      })
    ).rejects.toThrow('Parameter validation failed');
    expect(makePostRequest).not.toHaveBeenCalled();
  });

  it('rejects a holdings record time that is not an OpenAPI date-time', async () => {
    const makePostRequest = jest.fn();
    const operation = new GetHoldingsSummaryAtV1(createClient(undefined, makePostRequest));

    await expect(
      operation.execute({
        migration_id: 7,
        record_time: 'July 9, 2026',
        owner_party_ids: ['alice::namespace'],
      })
    ).rejects.toThrow('Parameter validation failed');
    expect(makePostRequest).not.toHaveBeenCalled();
  });

  it('lists unclaimed development-fund coupons through the current scan-proxy path', async () => {
    const response: ListUnclaimedDevelopmentFundCouponsResponse = {
      'unclaimed-development-fund-coupons': [CONTRACT_WITH_STATE],
    };
    const makeGetRequest = jest.fn().mockResolvedValue(response);

    const result = await new ListUnclaimedDevelopmentFundCoupons(createClient(makeGetRequest)).execute(undefined);
    const typedResult: ListUnclaimedDevelopmentFundCouponsResponse = result;

    expect(typedResult).toBe(response);
    expect(makeGetRequest).toHaveBeenCalledWith(
      'https://validator.example/api/validator/v0/scan-proxy/unclaimed-development-fund-coupons',
      REQUEST_CONFIG
    );
  });
});
