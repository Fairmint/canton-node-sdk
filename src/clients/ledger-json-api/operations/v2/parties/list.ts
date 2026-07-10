import { ApiOperation, snapshotOperationExecuteOptions, type OperationExecuteOptions } from '../../../../../core';
import {
  fetchAllParties,
  PartiesAggregationParamsSchema,
  type PartiesAggregationParams as ListPartiesParams,
  type PartiesAggregationResponse as ListPartiesResponse,
} from './aggregate-parties';

export const ListPartiesParamsSchema = PartiesAggregationParamsSchema;
export type { ListPartiesParams, ListPartiesResponse };

/** List all parties known to the participant and automatically paginate through all results. */
export class ListParties extends ApiOperation<ListPartiesParams, ListPartiesResponse> {
  public async execute(
    params: ListPartiesParams,
    options?: OperationExecuteOptions<ListPartiesParams>
  ): Promise<ListPartiesResponse> {
    const operationOptions = snapshotOperationExecuteOptions(options);
    return fetchAllParties(this, params, operationOptions);
  }
}
