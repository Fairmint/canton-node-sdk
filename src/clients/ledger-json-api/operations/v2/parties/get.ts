import { ApiOperation } from '../../../../../core';
import {
  fetchAllParties,
  PartiesAggregationParamsSchema,
  type PartiesAggregationParams as GetPartiesParams,
  type PartiesAggregationResponse as GetPartiesResponse,
} from './aggregate-parties';

export const GetPartiesParamsSchema = PartiesAggregationParamsSchema;
export type { GetPartiesParams, GetPartiesResponse };

/** List all parties known to the participant (legacy alias). */
export class GetParties extends ApiOperation<GetPartiesParams, GetPartiesResponse> {
  public async execute(params: GetPartiesParams): Promise<GetPartiesResponse> {
    return fetchAllParties(this, params);
  }
}
