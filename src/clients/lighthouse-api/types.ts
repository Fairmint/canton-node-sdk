import { z } from 'zod';

/**
 * Balance information for the transfer agent
 */
export const BalanceSchema = z.object({
  currency: z.string(),
  total_cc: z.number(),
});

export type Balance = z.infer<typeof BalanceSchema>;

/**
 * Traffic status information for the transfer agent
 */
export const TrafficStatusSchema = z.object({
  total_consumed: z.number(),
  total_limit: z.number(),
  total_purchased: z.number(),
  usage_percent: z.number(),
  last_updated: z.string(), // ISO 8601 datetime string
});

export type TrafficStatus = z.infer<typeof TrafficStatusSchema>;

/**
 * Validator information for the transfer agent
 */
export const ValidatorSchema = z.object({
  id: z.string(),
  sponsor: z.string(),
  dso: z.string(),
  last_active_at: z.string(), // ISO 8601 datetime string
  first_round: z.number(),
  last_round: z.number(),
  miss_round: z.number(),
  version: z.string(),
  contact: z.string(),
  metadata_last_update: z.string(), // ISO 8601 datetime string
  created_at: z.string(), // ISO 8601 datetime string
  template_id: z.string(),
  contract_id: z.string(),
  updated_at: z.string(), // ISO 8601 datetime string
});

export type Validator = z.infer<typeof ValidatorSchema>;

/**
 * Complete response from the Lighthouse API getTransferAgent endpoint
 */
export const GetTransferAgentResponseSchema = z.object({
  balance: BalanceSchema,
  traffic_status: TrafficStatusSchema,
  validator: ValidatorSchema,
});

export type GetTransferAgentResponse = z.infer<typeof GetTransferAgentResponseSchema>; 