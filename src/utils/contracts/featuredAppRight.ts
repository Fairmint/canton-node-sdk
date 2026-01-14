import { type ValidatorApiClient } from '../../clients';
import { type DisclosedContract } from '../../clients/ledger-json-api/schemas';
import { OperationError, OperationErrorCode } from '../../core/errors';

export async function getFeaturedAppRightContractDetails(validatorApi: ValidatorApiClient): Promise<DisclosedContract> {
  const partyId = validatorApi.getPartyId();
  const featuredAppRight = await validatorApi.lookupFeaturedAppRight({
    partyId,
  });
  if (!featuredAppRight.featured_app_right) {
    throw new OperationError(`No featured app right found for party ${partyId}`, OperationErrorCode.MISSING_CONTRACT, {
      partyId,
      contractType: 'FeaturedAppRight',
    });
  }
  // The featured-apps endpoint may not include the synchronizer/domain id.
  // Get domain_id from amulet rules which reliably expose it.
  const amuletRules = await validatorApi.getAmuletRules();
  const synchronizerId = amuletRules.amulet_rules.domain_id;
  return {
    contractId: featuredAppRight.featured_app_right.contract_id,
    createdEventBlob: featuredAppRight.featured_app_right.created_event_blob,
    synchronizerId,
    templateId: featuredAppRight.featured_app_right.template_id,
  };
}
