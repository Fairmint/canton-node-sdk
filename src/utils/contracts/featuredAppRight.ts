import { type ValidatorApiClient } from '../../clients';
import { type DisclosedContract } from '../../clients/ledger-json-api/schemas';

export async function getFeaturedAppRightContractDetails(validatorApi: ValidatorApiClient): Promise<DisclosedContract> {
  const featuredAppRight = await validatorApi.lookupFeaturedAppRight({
    partyId: validatorApi.getPartyId(),
  });
  if (!featuredAppRight.featured_app_right) {
    throw new Error(`No featured app right found for party ${validatorApi.getPartyId()}`);
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
