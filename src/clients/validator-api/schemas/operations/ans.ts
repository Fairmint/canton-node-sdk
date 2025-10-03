import { z } from 'zod';
import { CreateAnsEntryRequestSchema, GetAnsRulesRequestSchema } from '../api/ans';

// ANS Entry Parameters
export const CreateAnsEntryParamsSchema = CreateAnsEntryRequestSchema;
export const GetAnsRulesParamsSchema = GetAnsRulesRequestSchema;
export const LookupAnsEntryByNameParamsSchema = z.object({
  name: z.string(),
});
export const LookupAnsEntryByPartyParamsSchema = z.object({
  party: z.string(),
});
export const ListAnsEntriesProxyParamsSchema = z.object({
  namePrefix: z.string().optional(),
  pageSize: z.number().default(100),
});

export type CreateAnsEntryParams = z.infer<typeof CreateAnsEntryParamsSchema>;
export type GetAnsRulesParams = z.infer<typeof GetAnsRulesParamsSchema>;
export type LookupAnsEntryByNameParams = z.infer<typeof LookupAnsEntryByNameParamsSchema>;
export type LookupAnsEntryByPartyParams = z.infer<typeof LookupAnsEntryByPartyParamsSchema>;
export type ListAnsEntriesProxyParams = z.infer<typeof ListAnsEntriesProxyParamsSchema>;
