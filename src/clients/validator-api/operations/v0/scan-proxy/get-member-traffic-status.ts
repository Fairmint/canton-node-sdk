import { type BaseClient } from '../../../../../core';
import { ApiOperation } from '../../../../../core/operations/ApiOperation';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { getCurrentMiningRoundDomainId, type MiningRoundClient } from '../../../../../utils/mining/mining-rounds';
import { GetMemberTrafficStatusParamsSchema, type GetMemberTrafficStatusParams } from '../../../schemas/operations';

/** Response type for getMemberTrafficStatus operation */
type GetMemberTrafficStatusResponse =
  operations['getMemberTrafficStatus']['responses']['200']['content']['application/json'];

/** Type guard to check if a client has mining round methods */
function hasMiningRoundMethods(client: BaseClient): client is BaseClient & MiningRoundClient {
  return (
    'getOpenAndIssuingMiningRounds' in client &&
    typeof (client as MiningRoundClient).getOpenAndIssuingMiningRounds === 'function'
  );
}

/**
 * Get a member's traffic status as reported by the sequencer
 *
 * @example
 *   ```typescript
 *   // Get traffic status for current party in current mining round domain
 *   const status = await client.getMemberTrafficStatus();
 *
 *   // Get traffic status for specific member in current mining round domain
 *   const status = await client.getMemberTrafficStatus({
 *   memberId: 'PAR::id::fingerprint'
 *   });
 *
 *   // Get traffic status for specific member in specific domain
 *   const status = await client.getMemberTrafficStatus({
 *   domainId: 'domain123',
 *   memberId: 'PAR::id::fingerprint'
 *   });
 *
 *
 *   ```;
 */
export class GetMemberTrafficStatus extends ApiOperation<GetMemberTrafficStatusParams, GetMemberTrafficStatusResponse> {
  async execute(params: GetMemberTrafficStatusParams = {}): Promise<GetMemberTrafficStatusResponse> {
    const validatedParams = this.validateParams(params, GetMemberTrafficStatusParamsSchema);

    // Auto-determine domainId if not provided
    let { domainId } = validatedParams;
    if (!domainId) {
      if (!hasMiningRoundMethods(this.client)) {
        throw new Error('Client does not support getOpenAndIssuingMiningRounds - use ValidatorApiClient');
      }
      domainId = await getCurrentMiningRoundDomainId(this.client);
    }

    // Auto-determine memberId if not provided
    const memberId = validatedParams.memberId ?? this.client.getPartyId();

    const url = `${this.getApiUrl()}/api/validator/v0/scan-proxy/domains/${encodeURIComponent(domainId)}/members/${encodeURIComponent(memberId)}/traffic-status`;

    return this.makeGetRequest<GetMemberTrafficStatusResponse>(url, {
      includeBearerToken: true,
    });
  }
}
