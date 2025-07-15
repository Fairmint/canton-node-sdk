import { z } from 'zod';

// User Management Schemas
export const OnboardUserRequestSchema = z.object({
  name: z.string(),
  party_id: z.string().optional(),
});

export const OnboardUserResponseSchema = z.object({
  party_id: z.string(),
});

export const RegisterResponseSchema = z.object({
  party_id: z.string(),
});

export type OnboardUserRequest = z.infer<typeof OnboardUserRequestSchema>;
export type OnboardUserResponse = z.infer<typeof OnboardUserResponseSchema>;
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

// External Party Balance Schema
export const ExternalPartyBalanceResponseSchema = z.object({
  party_id: z.string(),
  total_unlocked_coin: z.string(),
  total_locked_coin: z.string(),
  total_coin_holdings: z.string(),
  accumulated_holding_fees_unlocked: z.string(),
  accumulated_holding_fees_locked: z.string(),
  accumulated_holding_fees_total: z.string(),
  total_available_coin: z.string(),
  computed_as_of_round: z.number(),
});

export type ExternalPartyBalanceResponse = z.infer<typeof ExternalPartyBalanceResponseSchema>; 