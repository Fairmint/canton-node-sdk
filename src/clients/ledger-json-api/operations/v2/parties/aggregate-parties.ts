import { z } from 'zod';
import {
  createOperationHttpRequestOptions,
  type ApiOperation,
  type OperationExecuteOptions,
} from '../../../../../core';
import { ApiError } from '../../../../../core/errors';
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
  params: PartiesAggregationParams,
  options: OperationExecuteOptions<PartiesAggregationParams> | undefined
): Promise<PartiesAggregationResponse> {
  const validatedParams = operation.validateParams(params, PartiesAggregationParamsSchema);

  const aggregatedPartyDetails: PartyDetail[] = [];
  let currentPageToken = validatedParams.pageToken?.trim() ?? '';

  // Loop until the API stops returning nextPageToken (or fails to advance)
  for (;;) {
    const pageParams: PartiesAggregationParams = currentPageToken.length > 0 ? { pageToken: currentPageToken } : {};
    const url = buildPartiesPageUrl(operation, pageParams);
    const httpOptions =
      options === undefined
        ? undefined
        : createOperationHttpRequestOptions({
            initialParams: pageParams,
            options,
            requestSemantics: 'read',
            initialUrl: url,
            validateParams: (derivedParams): PartiesAggregationParams =>
              operation.validateParams(derivedParams, PartiesAggregationParamsSchema),
            buildUrl: (derivedParams): string => buildPartiesPageUrl(operation, derivedParams),
            buildBody: (): undefined => undefined,
          });

    const response = await operation.makeGetRequest<PartiesAggregationResponse>(
      url,
      {
        contentType: 'application/json',
        includeBearerToken: true,
      },
      httpOptions
    );

    const rawPartyDetails: unknown = response.partyDetails;
    if (!Array.isArray(rawPartyDetails)) {
      throw new ApiError('ListParties response did not include partyDetails');
    }
    const partyDetails = rawPartyDetails as PartyDetail[];
    if (partyDetails.length > 0) {
      aggregatedPartyDetails.push(...partyDetails);
    }

    const nextTokenRaw = response.nextPageToken;
    const nextToken = typeof nextTokenRaw === 'string' ? nextTokenRaw.trim() : '';
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

function buildPartiesPageUrl(
  operation: ApiOperation<PartiesAggregationParams, PartiesAggregationResponse>,
  params: PartiesAggregationParams
): string {
  const url = new URL(`${operation.getApiUrl()}${endpoint}`);
  url.searchParams.set('pageSize', DEFAULT_PAGE_SIZE.toString());
  const pageToken = params.pageToken?.trim() ?? '';
  if (pageToken.length > 0) url.searchParams.set('pageToken', pageToken);
  return url.toString();
}
