import { z } from 'zod';
import { ApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const endpoint = '/v2/parties';
const PAGE_SIZE = 10000;

export const ListPartiesParamsSchema = z.object({
  pageToken: z.string().optional(),
});

export type ListPartiesParams = z.infer<typeof ListPartiesParamsSchema>;
export type ListPartiesResponse = paths[typeof endpoint]['get']['responses']['200']['content']['application/json'];
type PartyDetail = NonNullable<ListPartiesResponse['partyDetails']>[number];

/** List all parties known to the participant and automatically paginate through all results. */
export class ListParties extends ApiOperation<ListPartiesParams, ListPartiesResponse> {
  async execute(params: ListPartiesParams): Promise<ListPartiesResponse> {
    const validatedParams = this.validateParams(params, ListPartiesParamsSchema);

    const aggregatedPartyDetails: PartyDetail[] = [];
    let currentPageToken = validatedParams.pageToken?.trim() ?? '';
    let hasMore = true;

    while (hasMore) {
      const url = new URL(`${this.getApiUrl()}${endpoint}`);
      url.searchParams.set('pageSize', PAGE_SIZE.toString());
      if (currentPageToken.length > 0) {
        url.searchParams.set('pageToken', currentPageToken);
      }

      const response = await this.makeGetRequest<ListPartiesResponse>(url.toString(), {
        contentType: 'application/json',
        includeBearerToken: true,
      });

      if (response.partyDetails?.length) {
        aggregatedPartyDetails.push(...response.partyDetails);
      }

      const nextToken = (response.nextPageToken || '').trim();

      if (nextToken.length === 0) {
        hasMore = false;
      } else if (nextToken === currentPageToken) {
        throw new Error('ListParties pagination did not advance to a new page token');
      } else {
        currentPageToken = nextToken;
      }
    }

    return {
      partyDetails: aggregatedPartyDetails,
      nextPageToken: '',
    };
  }
}
