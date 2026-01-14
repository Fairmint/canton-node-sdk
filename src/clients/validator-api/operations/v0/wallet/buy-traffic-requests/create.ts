import { createApiOperation, type BaseClient } from '../../../../../../core';
import { type CreateBuyTrafficRequestResponse } from '../../../../schemas/api';
import {
  CreateBuyTrafficRequestParamsSchema,
  type CreateBuyTrafficRequestParams,
} from '../../../../schemas/operations';

/** Interface for clients that can fetch amulet rules */
interface AmuletRulesClient extends BaseClient {
  getAmuletRules: () => Promise<{ amulet_rules: { domain_id: string } }>;
}

/** Type guard to check if a client has the getAmuletRules method */
function hasAmuletRulesMethod(client: BaseClient): client is AmuletRulesClient {
  return 'getAmuletRules' in client && typeof (client as AmuletRulesClient).getAmuletRules === 'function';
}

/**
 * Create a new buy traffic request to purchase traffic from another validator
 *
 * @example
 *   ```typescript
 *   // Purchase traffic for the current validator
 *   const request = await client.createBuyTrafficRequest({
 *     traffic_amount: 1000
 *   });
 *
 *   // Purchase traffic for a different validator
 *   const request = await client.createBuyTrafficRequest({
 *     traffic_amount: 1000,
 *     receiving_validator_party_id: 'validator::party123...'
 *   });
 *   ```;
 */
export const CreateBuyTrafficRequest = createApiOperation<
  CreateBuyTrafficRequestParams,
  CreateBuyTrafficRequestResponse
>({
  paramsSchema: CreateBuyTrafficRequestParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/buy-traffic-requests`,
  buildRequestData: async (params, client) => {
    if (!hasAmuletRulesMethod(client)) {
      throw new Error('Client does not support getAmuletRules - use ValidatorApiClient');
    }

    // Get domain_id from amulet rules
    const amuletRules = await client.getAmuletRules();
    const { domain_id } = amuletRules.amulet_rules;

    if (!domain_id) {
      throw new Error('Unable to determine domain_id from amulet rules');
    }

    // Get receiving validator party ID from params or client configuration
    const receiving_validator_party_id = params.receiving_validator_party_id ?? client.getPartyId();

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
