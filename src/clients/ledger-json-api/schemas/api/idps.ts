import { z } from 'zod';

export const IdentityProviderConfigSchema = z.object({
  identityProviderId: z.string(),
  isDeactivated: z.boolean(),
  issuer: z.string(),
  jwksUrl: z.string(),
  audience: z.string().optional(),
});

export const ListIdentityProviderConfigsResponseSchema = z.object({
  identityProviderConfigs: z.array(IdentityProviderConfigSchema),
});

export const CreateIdentityProviderConfigRequestSchema = z.object({
  identityProviderConfig: IdentityProviderConfigSchema,
});

export const CreateIdentityProviderConfigResponseSchema = z.object({
  identityProviderConfig: IdentityProviderConfigSchema,
});

export const GetIdentityProviderConfigResponseSchema = z.object({
  identityProviderConfig: IdentityProviderConfigSchema,
});

export const UpdateIdentityProviderConfigRequestSchema = z.object({
  identityProviderConfig: IdentityProviderConfigSchema,
  updateMask: z.object({ paths: z.array(z.string()) }),
});

export const UpdateIdentityProviderConfigResponseSchema = z.object({
  identityProviderConfig: IdentityProviderConfigSchema,
});

export const DeleteIdentityProviderConfigResponseSchema = z.object({});

// Export types
export type IdentityProviderConfig = z.infer<typeof IdentityProviderConfigSchema>;
export type ListIdentityProviderConfigsResponse = z.infer<typeof ListIdentityProviderConfigsResponseSchema>;
export type CreateIdentityProviderConfigRequest = z.infer<typeof CreateIdentityProviderConfigRequestSchema>;
export type CreateIdentityProviderConfigResponse = z.infer<typeof CreateIdentityProviderConfigResponseSchema>;
export type GetIdentityProviderConfigResponse = z.infer<typeof GetIdentityProviderConfigResponseSchema>;
export type UpdateIdentityProviderConfigRequest = z.infer<typeof UpdateIdentityProviderConfigRequestSchema>;
export type UpdateIdentityProviderConfigResponse = z.infer<typeof UpdateIdentityProviderConfigResponseSchema>;
export type DeleteIdentityProviderConfigResponse = z.infer<typeof DeleteIdentityProviderConfigResponseSchema>; 