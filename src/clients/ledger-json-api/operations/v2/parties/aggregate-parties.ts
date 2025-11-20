import { z } from 'zod';
import type { ApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const endpoint = '/v2/parties';
const DEFAULT_PAGE_SIZE = 5000;

export const PartiesAggregationParamsSchema = z.object({
  pageToken: z.string().optional(),
});

export type PartiesAggregationParams = z.infer<typeof PartiesAggregationParamsSchema>;
export type PartiesAggregationResponse =
  paths[typeof endpoint]['get']['responses']['200']['content']['application/json'];
type PartyDetail = NonNullable<PartiesAggregationResponse['partyDetails']>[number];

export async function fetchAllParties(
  operation: ApiOperation<PartiesAggregationParams, PartiesAggregationResponse>,
  params: PartiesAggregationParams
): Promise<PartiesAggregationResponse> {
  const validatedParams = operation.validateParams(params, PartiesAggregationParamsSchema);

  const aggregatedPartyDetails: PartyDetail[] = [];
  let currentPageToken = validatedParams.pageToken?.trim() ?? '';

  // Loop until the API stops returning nextPageToken (or fails to advance)
  for (;;) {
    const url = new URL(`${operation.getApiUrl()}${endpoint}`);
    url.searchParams.set('pageSize', DEFAULT_PAGE_SIZE.toString());
    if (currentPageToken.length > 0) {
      url.searchParams.set('pageToken', currentPageToken);
    }

    const response = await operation.makeGetRequest<PartiesAggregationResponse>(url.toString(), {
      contentType: 'application/json',
      includeBearerToken: true,
    });

    if (response.partyDetails?.length) {
      aggregatedPartyDetails.push(...response.partyDetails);
    }

    const nextToken = (response.nextPageToken ?? '').trim();
    if (nextToken.length === 0) {
      break;
    }
    if (nextToken === currentPageToken) {
      throw new Error('ListParties pagination did not advance to a new page token');
    }

    currentPageToken = nextToken;
  }

  return {
    partyDetails: aggregatedPartyDetails,
    nextPageToken: '',
  };
}
