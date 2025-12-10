import { ApiOperation } from '../../../../../core/operations/ApiOperation';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { getCurrentMiningRoundDomainId } from '../../../../../utils/mining/mining-rounds';
import { GetMemberTrafficStatusParamsSchema, type GetMemberTrafficStatusParams } from '../../../schemas/operations';
import { type ValidatorApiClient } from '../../../ValidatorApiClient.generated';

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
export class GetMemberTrafficStatus extends ApiOperation<
  GetMemberTrafficStatusParams,
  operations['getMemberTrafficStatus']['responses']['200']['content']['application/json']
> {
  public async execute(
    params: GetMemberTrafficStatusParams = {}
  ): Promise<operations['getMemberTrafficStatus']['responses']['200']['content']['application/json']> {
    const validatedParams = this.validateParams(params, GetMemberTrafficStatusParamsSchema);

    // Auto-determine domainId if not provided
    const domainId =
      validatedParams.domainId ?? (await getCurrentMiningRoundDomainId(this.client as unknown as ValidatorApiClient));

    // Auto-determine memberId if not provided
    const memberId = validatedParams.memberId ?? (this.client as { getPartyId: () => string }).getPartyId();

    const url = `${this.getApiUrl()}/api/validator/v0/scan-proxy/domains/${encodeURIComponent(domainId)}/members/${encodeURIComponent(memberId)}/traffic-status`;

    return this.makeGetRequest<operations['getMemberTrafficStatus']['responses']['200']['content']['application/json']>(
      url,
      {
        includeBearerToken: true,
      }
    );
  }
}
