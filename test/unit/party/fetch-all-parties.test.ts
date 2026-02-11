import {
  fetchAllParties,
  PartiesAggregationParamsSchema,
  type PartiesAggregationParams,
  type PartiesAggregationResponse,
} from '../../../src/clients/ledger-json-api/operations/v2/parties/aggregate-parties';
import type { ApiOperation } from '../../../src/core';

type AggregationOperation = Pick<
  ApiOperation<PartiesAggregationParams, PartiesAggregationResponse>,
  'validateParams' | 'getApiUrl' | 'makeGetRequest'
>;

type PartyDetail = NonNullable<PartiesAggregationResponse['partyDetails']>[number];
interface MockOperationContext {
  operation: ApiOperation<PartiesAggregationParams, PartiesAggregationResponse>;
  makeGetRequestMock: jest.Mock;
  validateParamsMock: jest.Mock;
}

const createPartyDetail = (party: string): PartyDetail => ({ party }) as PartyDetail;

const createResponse = (partyDetails: PartyDetail[], nextPageToken = ''): PartiesAggregationResponse =>
  ({
    partyDetails,
    nextPageToken,
  }) as PartiesAggregationResponse;

const createMockOperation = (responses: PartiesAggregationResponse[]): MockOperationContext => {
  const validateParamsMock = jest.fn((params: PartiesAggregationParams) => params);
  const getApiUrlMock = jest.fn(() => 'https://ledger.example.com');
  const makeGetRequestMock = jest.fn();

  responses.forEach((response) => {
    makeGetRequestMock.mockResolvedValueOnce(response);
  });

  const operation: AggregationOperation = {
    validateParams: validateParamsMock as AggregationOperation['validateParams'],
    getApiUrl: getApiUrlMock,
    makeGetRequest: makeGetRequestMock as AggregationOperation['makeGetRequest'],
  };

  return {
    operation: operation as unknown as ApiOperation<PartiesAggregationParams, PartiesAggregationResponse>,
    makeGetRequestMock,
    validateParamsMock,
  };
};

describe('fetchAllParties', () => {
  it('aggregates all party details across paginated responses', async () => {
    const alice = createPartyDetail('alice');
    const bob = createPartyDetail('bob');
    const { operation, makeGetRequestMock } = createMockOperation([
      createResponse([alice], ' next-token '),
      createResponse([bob], ''),
    ]);

    const result = await fetchAllParties(operation, {});

    expect(result).toEqual(createResponse([alice, bob], ''));
    expect(makeGetRequestMock).toHaveBeenCalledTimes(2);
    expect(makeGetRequestMock).toHaveBeenNthCalledWith(1, expect.any(String), {
      contentType: 'application/json',
      includeBearerToken: true,
    });

    const firstRequestUrl = new URL(makeGetRequestMock.mock.calls[0]?.[0] as string);
    const secondRequestUrl = new URL(makeGetRequestMock.mock.calls[1]?.[0] as string);
    expect(firstRequestUrl.searchParams.get('pageSize')).toBe('5000');
    expect(firstRequestUrl.searchParams.get('pageToken')).toBeNull();
    expect(secondRequestUrl.searchParams.get('pageSize')).toBe('5000');
    expect(secondRequestUrl.searchParams.get('pageToken')).toBe('next-token');
  });

  it('trims and uses the initial page token from params', async () => {
    const params: PartiesAggregationParams = { pageToken: '  initial-token  ' };
    const { operation, makeGetRequestMock, validateParamsMock } = createMockOperation([createResponse([], '')]);

    await fetchAllParties(operation, params);

    expect(validateParamsMock).toHaveBeenCalledWith(params, PartiesAggregationParamsSchema);
    const firstRequestUrl = new URL(makeGetRequestMock.mock.calls[0]?.[0] as string);
    expect(firstRequestUrl.searchParams.get('pageToken')).toBe('initial-token');
  });

  it('throws when a page response repeats the current page token', async () => {
    const { operation, makeGetRequestMock } = createMockOperation([
      createResponse([], 'repeat-token'),
      createResponse([], 'repeat-token'),
    ]);

    await expect(fetchAllParties(operation, {})).rejects.toThrow(
      'ListParties pagination did not advance to a new page token'
    );
    expect(makeGetRequestMock).toHaveBeenCalledTimes(2);
  });

  it('throws when pagination enters a multi-page token cycle', async () => {
    const { operation, makeGetRequestMock } = createMockOperation([
      createResponse([], 'token-a'),
      createResponse([], 'token-b'),
      createResponse([], 'token-a'),
    ]);

    await expect(fetchAllParties(operation, {})).rejects.toThrow(
      'ListParties pagination did not advance to a new page token'
    );
    expect(makeGetRequestMock).toHaveBeenCalledTimes(3);
  });
});
