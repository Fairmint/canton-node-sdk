import { z } from 'zod';
import { NonEmptyStringSchema } from './base';

export const ListIdentityProviderConfigsParamsSchema = z.object({});

export const CreateIdentityProviderConfigParamsSchema = z.object({
  identityProviderConfig: z.object({
    identityProviderId: NonEmptyStringSchema,
    isDeactivated: z.boolean(),
    issuer: z.string(),
    jwksUrl: z.string(),
    audience: z.string().optional(),
  }),
});

export const GetIdentityProviderConfigParamsSchema = z.object({
  idpId: NonEmptyStringSchema,
});

export const UpdateIdentityProviderConfigParamsSchema = z.object({
  identityProviderConfig: z.object({
    identityProviderId: NonEmptyStringSchema,
    isDeactivated: z.boolean(),
    issuer: z.string(),
    jwksUrl: z.string(),
    audience: z.string().optional(),
  }),
  updateMask: z.object({ paths: z.array(z.string()) }),
});

export const DeleteIdentityProviderConfigParamsSchema = z.object({
  idpId: NonEmptyStringSchema,
});

// Export types
export type ListIdentityProviderConfigsParams = z.infer<typeof ListIdentityProviderConfigsParamsSchema>;
export type CreateIdentityProviderConfigParams = z.infer<typeof CreateIdentityProviderConfigParamsSchema>;
export type GetIdentityProviderConfigParams = z.infer<typeof GetIdentityProviderConfigParamsSchema>;
export type UpdateIdentityProviderConfigParams = z.infer<typeof UpdateIdentityProviderConfigParamsSchema>;
export type DeleteIdentityProviderConfigParams = z.infer<typeof DeleteIdentityProviderConfigParamsSchema>;
