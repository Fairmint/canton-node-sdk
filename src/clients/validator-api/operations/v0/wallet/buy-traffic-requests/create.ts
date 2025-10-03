import { createApiOperation } from '../../../../../../core';
import { type CreateBuyTrafficRequestResponse } from '../../../../schemas/api';
import { CreateBuyTrafficRequestParamsSchema, type CreateBuyTrafficRequestParams } from '../../../../schemas/operations';

/**
 * @description Create a new buy traffic request to purchase traffic from another validator
 * @example
 * ```typescript
 * const request = await client.createBuyTrafficRequest({
 *   traffic_amount: 1000
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
  buildRequestData: async (params, client) => {
    // Cast client to ValidatorApiClient to access getAmuletRules
    const validatorClient = client as any;
    
    // Get domain_id from amulet rules
    const amuletRules = await validatorClient.getAmuletRules();
    const {domain_id} = amuletRules.amulet_rules;
    
    if (!domain_id) {
      throw new Error('Unable to determine domain_id from amulet rules');
    }
    
    // Get receiving validator party ID from client configuration
    const receiving_validator_party_id = client.getPartyId();
    
    // Generate a unique tracking ID
    const tracking_id = `buy-traffic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Set expiration to 1 hour from now
    const expires_at = Date.now() * 1000 + 3600000000; // 1 hour in microseconds
    
    return {
      receiving_validator_party_id,
      domain_id,
      traffic_amount: params.traffic_amount,
      tracking_id,
      expires_at,
    };
  },
}); 