import { z } from 'zod';
import { OnboardUserRequestSchema } from '../api/admin';

// User Management Parameters
export const CreateUserParamsSchema = OnboardUserRequestSchema;
export const GetExternalPartyBalanceParamsSchema = z.object({
  partyId: z.string(),
});

export type CreateUserParams = z.infer<typeof CreateUserParamsSchema>;
export type GetExternalPartyBalanceParams = z.infer<typeof GetExternalPartyBalanceParamsSchema>; 