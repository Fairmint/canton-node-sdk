import { z } from 'zod';
import { DarFileSchema } from '../common';
import { NonEmptyStringSchema } from './base';

/** Schema for list packages parameters. No parameters required for listing packages. */
export const ListPackagesParamsSchema = z.void();

/** Schema for upload DAR file parameters. */
export const UploadDarFileParamsSchema = z.object({
  /** DAR file content as a buffer or string. */
  darFile: DarFileSchema,
  /** Optional submission ID for deduplication. */
  submissionId: z.string().optional(),
});

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

/** Schema for get preferred package version parameters. */
export const GetPreferredPackageVersionParamsSchema = z.object({
  /** Package name to get preferred version for. */
  packageName: z.string(),
  /** Parties whose vetting state should be considered. */
  parties: z.array(z.string()),
  /** Synchronizer ID (optional). */
  synchronizerId: z.string().optional(),
  /** Vetting valid at timestamp (optional). */
  vettingValidAt: z.string().optional(),
});

// Export types
export type ListPackagesParams = z.infer<typeof ListPackagesParamsSchema>;
export type UploadDarFileParams = z.infer<typeof UploadDarFileParamsSchema>;
export type GetPackageStatusParams = z.infer<typeof GetPackageStatusParamsSchema>;
export type GetPreferredPackagesParams = z.infer<typeof GetPreferredPackagesParamsSchema>;
export type GetPreferredPackageVersionParams = z.infer<typeof GetPreferredPackageVersionParamsSchema>;
