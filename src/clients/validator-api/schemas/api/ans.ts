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

export const ListAnsEntriesResponseSchema = z.object({
  entries: z.array(z.any()),
});

export const ListAnsEntriesProxyResponseSchema = z.object({
  entries: z.array(z.any()),
});

export const LookupAnsEntryByNameResponseSchema = z.object({
  entry: z.any(),
});

export const LookupAnsEntryByPartyResponseSchema = z.object({
  entry: z.any(),
});

export const GetAnsRulesRequestSchema = z.object({
  name: z.string(),
});

export const GetAnsRulesResponseSchema = z.object({
  rules: z.array(z.any()),
});

export type CreateAnsEntryRequest = z.infer<typeof CreateAnsEntryRequestSchema>;
export type CreateAnsEntryResponse = z.infer<typeof CreateAnsEntryResponseSchema>;
export type ListAnsEntriesResponse = z.infer<typeof ListAnsEntriesResponseSchema>;
export type ListAnsEntriesProxyResponse = z.infer<typeof ListAnsEntriesProxyResponseSchema>;
export type LookupAnsEntryByNameResponse = z.infer<typeof LookupAnsEntryByNameResponseSchema>;
export type LookupAnsEntryByPartyResponse = z.infer<typeof LookupAnsEntryByPartyResponseSchema>;
export type GetAnsRulesRequest = z.infer<typeof GetAnsRulesRequestSchema>;
export type GetAnsRulesResponse = z.infer<typeof GetAnsRulesResponseSchema>;
