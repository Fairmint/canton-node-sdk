import { ValidatorApiClient } from "../../clients";
import { DisclosedContract } from "../../clients/ledger-json-api/schemas";

export async function getFeaturedAppRightContractDetails(
  validatorApi: ValidatorApiClient,
): Promise<DisclosedContract> {
  const featuredAppRight = await validatorApi.lookupFeaturedAppRight({
    partyId: validatorApi.getPartyId(),
  });
  if (!featuredAppRight || !featuredAppRight.featured_app_right) {
    throw new Error(
      `No featured app right found for party ${validatorApi.getPartyId()}`
    );
  }
  // The featured-apps endpoint may not include the synchronizer/domain id.
  // Fallback to amulet rules which reliably expose the domain_id to use as synchronizerId.
  const amuletRules = await validatorApi.getAmuletRules();
  const synchronizerIdFromRules =
    (amuletRules as any)?.amulet_rules?.domain_id || '';
  return {
    contractId: featuredAppRight.featured_app_right.contract_id,
    createdEventBlob: featuredAppRight.featured_app_right.created_event_blob,
    synchronizerId:
      (featuredAppRight as any)?.featured_app_right?.domain_id ||
      synchronizerIdFromRules,
    templateId: featuredAppRight.featured_app_right.template_id,
  };
}


