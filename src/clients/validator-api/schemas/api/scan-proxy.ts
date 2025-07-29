import { z } from 'zod';

// DSO Party ID Response
export const GetDsoPartyIdResponseSchema = z.object({
  dso_party_id: z.string(),
});

export type GetDsoPartyIdResponse = z.infer<typeof GetDsoPartyIdResponseSchema>;

// Member Traffic Status Response
export const GetMemberTrafficStatusResponseSchema = z.object({
  traffic_status: z.object({
    actual: z.object({
      total_consumed: z.number(),
      total_limit: z.number(),
    }),
    target: z.object({
      total_purchased: z.number(),
    }),
  }),
});

export type GetMemberTrafficStatusResponse = z.infer<typeof GetMemberTrafficStatusResponseSchema>;

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

// Transfer Preapproval Schema
export const LookupTransferPreapprovalByPartyResponseSchema = z.object({
  transfer_preapproval: z.object({
    contract: z.any(),
    domain_id: z.string(),
  }),
});

export type LookupTransferPreapprovalByPartyResponse = z.infer<typeof LookupTransferPreapprovalByPartyResponseSchema>;

// Featured App Right Schema
export const LookupFeaturedAppRightResponseSchema = z.object({
  featured_app_right: z.any(),
});

export type LookupFeaturedAppRightResponse = z.infer<typeof LookupFeaturedAppRightResponseSchema>;

// Token Standard Registry Response Schemas
export const GetRegistryInfoResponseSchema = z.object({
  adminId: z.string(),
  supportedApis: z.record(z.string(), z.number()),
});

export const InstrumentSchema = z.object({
  id: z.string(),
  name: z.string(),
  symbol: z.string(),
  totalSupply: z.string().optional(),
  totalSupplyAsOf: z.string().optional(),
  decimals: z.number(),
  supportedApis: z.record(z.string(), z.number()),
});

export const ListInstrumentsResponseSchema = z.object({
  instruments: z.array(InstrumentSchema),
  nextPageToken: z.string().optional(),
});

export const GetInstrumentResponseSchema = InstrumentSchema;

export const ChoiceContextSchema = z.object({
  choiceContextData: z.record(z.string(), z.never()),
  disclosedContracts: z.array(z.object({
    templateId: z.string(),
    contractId: z.string(),
    createdEventBlob: z.string(),
    synchronizerId: z.string(),
    debugPackageName: z.string().optional(),
    debugPayload: z.record(z.string(), z.never()).optional(),
    debugCreatedAt: z.string().optional(),
  })),
});

export const GetAllocationFactoryResponseSchema = z.object({
  factoryId: z.string(),
  choiceContext: ChoiceContextSchema,
});

export const GetAllocationTransferContextResponseSchema = ChoiceContextSchema;
export const GetAllocationWithdrawContextResponseSchema = ChoiceContextSchema;
export const GetAllocationCancelContextResponseSchema = ChoiceContextSchema;

export const TransferFactoryWithChoiceContextSchema = z.object({
  factoryId: z.string(),
  transferKind: z.enum(['self', 'direct', 'offer']),
  choiceContext: ChoiceContextSchema,
});

export const GetTransferFactoryResponseSchema = TransferFactoryWithChoiceContextSchema;
export const GetTransferInstructionAcceptContextResponseSchema = ChoiceContextSchema;
export const GetTransferInstructionRejectContextResponseSchema = ChoiceContextSchema;
export const GetTransferInstructionWithdrawContextResponseSchema = ChoiceContextSchema;

export type GetRegistryInfoResponse = z.infer<typeof GetRegistryInfoResponseSchema>;
export type Instrument = z.infer<typeof InstrumentSchema>;
export type ListInstrumentsResponse = z.infer<typeof ListInstrumentsResponseSchema>;
export type GetInstrumentResponse = z.infer<typeof GetInstrumentResponseSchema>;
export type ChoiceContext = z.infer<typeof ChoiceContextSchema>;
export type GetAllocationFactoryResponse = z.infer<typeof GetAllocationFactoryResponseSchema>;
export type GetAllocationTransferContextResponse = z.infer<typeof GetAllocationTransferContextResponseSchema>;
export type GetAllocationWithdrawContextResponse = z.infer<typeof GetAllocationWithdrawContextResponseSchema>;
export type GetAllocationCancelContextResponse = z.infer<typeof GetAllocationCancelContextResponseSchema>;
export type TransferFactoryWithChoiceContext = z.infer<typeof TransferFactoryWithChoiceContextSchema>;
export type GetTransferFactoryResponse = z.infer<typeof GetTransferFactoryResponseSchema>;
export type GetTransferInstructionAcceptContextResponse = z.infer<typeof GetTransferInstructionAcceptContextResponseSchema>;
export type GetTransferInstructionRejectContextResponse = z.infer<typeof GetTransferInstructionRejectContextResponseSchema>;
export type GetTransferInstructionWithdrawContextResponse = z.infer<typeof GetTransferInstructionWithdrawContextResponseSchema>; 