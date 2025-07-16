import { createApiOperation } from '../../../../../../core';
import { CreateBuyTrafficRequestResponse } from '../../../../schemas/api';
import { CreateBuyTrafficRequestParamsSchema, CreateBuyTrafficRequestParams } from '../../../../schemas/operations';

/**
 * @description Create a new buy traffic request to purchase traffic from another validator
 * @example
 * ```typescript
 * const request = await client.createBuyTrafficRequest({
 *   receiving_validator_party_id: 'validator123',
 *   domain_id: 'domain456',
 *   traffic_amount: 1000,
 *   tracking_id: 'unique-tracking-id',
 *   expires_at: Date.now() + 3600000 // 1 hour from now
 * });
 * console.log(`Request created: ${request.request_contract_id}`);
 * ```
 */
export const CreateBuyTrafficRequest = createApiOperation<
  CreateBuyTrafficRequestParams,
  CreateBuyTrafficRequestResponse
>({
  paramsSchema: CreateBuyTrafficRequestParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/buy-traffic-requests`,
  buildRequestData: (params) => params,
}); 