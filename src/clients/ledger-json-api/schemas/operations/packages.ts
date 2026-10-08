import { z } from 'zod';
import { NonEmptyStringSchema } from './base';

/** Schema for list packages parameters. No parameters required for listing packages. */
export const ListPackagesParamsSchema = z.void();

/** Schema for get package status parameters. */
export const GetPackageStatusParamsSchema = z.object({
  /** Package ID to get status for. */
  packageId: NonEmptyStringSchema,
});

/** Schema for get preferred packages parameters. */
export const GetPreferredPackagesParamsSchema = z.object({
  /** Package vetting requirements. */
  packageVettingRequirements: z.array(
    z.object({
      /** Parties whose vetting state should be considered. */
      parties: z.array(z.string()),
      /** Package name for which to resolve the preferred package. */
      packageName: z.string(),
    })
  ),
  /** Synchronizer ID (optional). */
  synchronizerId: z.string().optional(),
  /** Vetting valid at timestamp (optional). */
  vettingValidAt: z.string().optional(),
});

// Export types
export type ListPackagesParams = z.infer<typeof ListPackagesParamsSchema>;
export type GetPackageStatusParams = z.infer<typeof GetPackageStatusParamsSchema>;
export type GetPreferredPackagesParams = z.infer<typeof GetPreferredPackagesParamsSchema>;
