import { z } from 'zod';

// ANS Entry Schemas
export const CreateAnsEntryRequestSchema = z.object({
  name: z.string(),
  url: z.string(),
  description: z.string(),
});

export const CreateAnsEntryResponseSchema = z.object({
  name: z.string(),
  url: z.string(),
  description: z.string(),
  entryContextCid: z.string(),
  subscriptionRequestCid: z.string(),
});

/** Schema for an ANS entry. Uses passthrough() to allow additional server fields. */
export const AnsEntrySchema = z
  .object({
    /** Name of the ANS entry */
    name: z.string(),
    /** URL associated with the entry */
    url: z.string(),
    /** Description of the entry */
    description: z.string(),
    /** Party ID that owns this entry */
    party: z.string().optional(),
    /** Contract ID of the entry context */
    entry_context_cid: z.string().optional(),
  })
  .passthrough();

export const ListAnsEntriesResponseSchema = z.object({
  entries: z.array(AnsEntrySchema),
});

export const ListAnsEntriesProxyResponseSchema = z.object({
  entries: z.array(AnsEntrySchema),
});

export const LookupAnsEntryByNameResponseSchema = z.object({
  entry: AnsEntrySchema,
});

export const LookupAnsEntryByPartyResponseSchema = z.object({
  entry: AnsEntrySchema,
});

export const GetAnsRulesRequestSchema = z.object({
  name: z.string(),
});

/** Schema for an ANS rule. Uses passthrough() to allow additional server fields. */
export const AnsRuleSchema = z
  .object({
    /** Rule name or identifier */
    name: z.string().optional(),
    /** Rule description */
    description: z.string().optional(),
  })
  .passthrough();

export const GetAnsRulesResponseSchema = z.object({
  rules: z.array(AnsRuleSchema),
});

export type CreateAnsEntryRequest = z.infer<typeof CreateAnsEntryRequestSchema>;
export type CreateAnsEntryResponse = z.infer<typeof CreateAnsEntryResponseSchema>;
export type AnsEntry = z.infer<typeof AnsEntrySchema>;
export type ListAnsEntriesResponse = z.infer<typeof ListAnsEntriesResponseSchema>;
export type ListAnsEntriesProxyResponse = z.infer<typeof ListAnsEntriesProxyResponseSchema>;
export type LookupAnsEntryByNameResponse = z.infer<typeof LookupAnsEntryByNameResponseSchema>;
export type LookupAnsEntryByPartyResponse = z.infer<typeof LookupAnsEntryByPartyResponseSchema>;
export type GetAnsRulesRequest = z.infer<typeof GetAnsRulesRequestSchema>;
export type AnsRule = z.infer<typeof AnsRuleSchema>;
export type GetAnsRulesResponse = z.infer<typeof GetAnsRulesResponseSchema>;
