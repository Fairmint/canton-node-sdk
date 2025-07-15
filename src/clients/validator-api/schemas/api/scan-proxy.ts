import { z } from 'zod';

// DSO Party ID Response
export const GetDsoPartyIdResponseSchema = z.object({
  dso_party_id: z.string(),
});

export type GetDsoPartyIdResponse = z.infer<typeof GetDsoPartyIdResponseSchema>;

// Mining Rounds Schemas
export const GetOpenAndIssuingMiningRoundsResponseSchema = z.object({
  open_mining_rounds: z.array(z.any()),
  issuing_mining_rounds: z.array(z.any()),
});

export const MiningRoundDetailsSchema = z.object({
  round_number: z.number(),
  issuance_per_featured_app_reward_coupon: z.string(),
  issuance_per_unfeatured_app_reward_coupon: z.string(),
  effective_at: z.string(),
  status: z.enum(['open', 'issuing', 'closed']),
});

export const GetMiningRoundDetailsResponseSchema = z.object({
  mining_round: MiningRoundDetailsSchema,
});

export type GetOpenAndIssuingMiningRoundsResponse = z.infer<typeof GetOpenAndIssuingMiningRoundsResponseSchema>;
export type MiningRoundDetails = z.infer<typeof MiningRoundDetailsSchema>;
export type GetMiningRoundDetailsResponse = z.infer<typeof GetMiningRoundDetailsResponseSchema>;

// Amulet Rules Schema
export const GetAmuletRulesResponseSchema = z.object({
  amulet_rules: z.object({
    contract: z.any(),
    domain_id: z.string(),
  }),
});

export type GetAmuletRulesResponse = z.infer<typeof GetAmuletRulesResponseSchema>;

// Transfer Command Schemas
export const LookupTransferCommandCounterByPartyResponseSchema = z.object({
  counter: z.number(),
});

export const LookupTransferCommandStatusResponseSchema = z.object({
  status: z.string(),
});

export type LookupTransferCommandCounterByPartyResponse = z.infer<typeof LookupTransferCommandCounterByPartyResponseSchema>;
export type LookupTransferCommandStatusResponse = z.infer<typeof LookupTransferCommandStatusResponseSchema>;

// Featured App Right Schema
export const LookupFeaturedAppRightResponseSchema = z.object({
  featured_app_right: z.any(),
});

export type LookupFeaturedAppRightResponse = z.infer<typeof LookupFeaturedAppRightResponseSchema>; 