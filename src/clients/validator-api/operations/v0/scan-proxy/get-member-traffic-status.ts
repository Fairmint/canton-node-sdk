import { ApiOperation } from '../../../../../core/operations/ApiOperation';
import { operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { getCurrentMiningRoundDomainId } from '../../../../../utils/mining/mining-rounds';
import { GetMemberTrafficStatusParams } from '../../../schemas/operations';

/**
 * @description Get a member's traffic status as reported by the sequencer
 * @example
 * ```typescript
 * // Get traffic status for current party in current mining round domain
 * const status = await client.getMemberTrafficStatus();
 * 
 * // Get traffic status for specific member in current mining round domain
 * const status = await client.getMemberTrafficStatus({ 
 *   memberId: 'PAR::id::fingerprint' 
 * });
 * 
 * // Get traffic status for specific member in specific domain
 * const status = await client.getMemberTrafficStatus({ 
 *   domainId: 'domain123', 
 *   memberId: 'PAR::id::fingerprint' 
 * });
 * 
 * console.log(`Total consumed: ${status.traffic_status.actual.total_consumed}`);
 * ```
 */
export class GetMemberTrafficStatus extends ApiOperation<
  GetMemberTrafficStatusParams,
  operations['getMemberTrafficStatus']['responses']['200']['content']['application/json']
> {
  async execute(params: GetMemberTrafficStatusParams): Promise<operations['getMemberTrafficStatus']['responses']['200']['content']['application/json']> {
    // Auto-determine domainId if not provided
    const domainId = params.domainId || await getCurrentMiningRoundDomainId(this.client as any);
    
    // Auto-determine memberId if not provided
    const memberId = params.memberId || (this.client as any).getPartyId();
    
    const url = `${this.getApiUrl()}/api/validator/v0/scan-proxy/v0/domains/${encodeURIComponent(domainId)}/members/${encodeURIComponent(memberId)}/traffic-status`;
    
    return this.makeGetRequest<operations['getMemberTrafficStatus']['responses']['200']['content']['application/json']>(url);
  }
} 