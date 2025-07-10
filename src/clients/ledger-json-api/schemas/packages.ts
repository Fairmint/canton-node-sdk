import { z } from 'zod';

/**
 * List packages response.
 */
export const ListPackagesResponseSchema = z.object({
  /** List of package IDs. */
  packageIds: z.array(z.string()),
});

/**
 * Upload DAR file response.
 */
export const UploadDarFileResponseSchema = z.object({});

/**
 * Get package status response.
 */
export const GetPackageStatusResponseSchema = z.object({
  /** The status of the package. */
  packageStatus: z.string(),
});

/**
 * Package reference details.
 */
export const PackageReferenceSchema = z.object({
  /** Package ID. */
  packageId: z.string(),
  /** Package name. */
  packageName: z.string(),
  /** Package version. */
  packageVersion: z.string(),
});

/**
 * Package vetting requirement.
 */
export const PackageVettingRequirementSchema = z.object({
  /** Parties whose vetting state should be considered. */
  parties: z.array(z.string()),
  /** Package name for which to resolve the preferred package. */
  packageName: z.string(),
});

/**
 * Package preference details.
 */
export const PackagePreferenceSchema = z.object({
  /** Package reference. */
  packageReference: PackageReferenceSchema,
  /** Synchronizer ID. */
  synchronizerId: z.string(),
});

/**
 * Get preferred package version request.
 */
export const GetPreferredPackagesRequestSchema = z.object({
  /** Package vetting requirements. */
  packageVettingRequirements: z.array(PackageVettingRequirementSchema),
  /** Synchronizer ID (optional). */
  synchronizerId: z.string().optional(),
  /** Vetting valid at timestamp (optional). */
  vettingValidAt: z.string().optional(),
});

/**
 * Get preferred packages response.
 */
export const GetPreferredPackagesResponseSchema = z.object({
  /** Package references. */
  packageReferences: z.array(PackageReferenceSchema),
  /** Synchronizer ID. */
  synchronizerId: z.string(),
});

/**
 * Get preferred package version response.
 */
export const GetPreferredPackageVersionResponseSchema = z.object({
  /** Package preference (optional). */
  packagePreference: PackagePreferenceSchema.optional(),
});

// Export types
export type ListPackagesResponse = z.infer<typeof ListPackagesResponseSchema>;
export type UploadDarFileResponse = z.infer<typeof UploadDarFileResponseSchema>;
export type GetPackageStatusResponse = z.infer<typeof GetPackageStatusResponseSchema>;
export type PackageReference = z.infer<typeof PackageReferenceSchema>;
export type PackageVettingRequirement = z.infer<typeof PackageVettingRequirementSchema>;
export type PackagePreference = z.infer<typeof PackagePreferenceSchema>;
export type GetPreferredPackagesRequest = z.infer<typeof GetPreferredPackagesRequestSchema>;
export type GetPreferredPackagesResponse = z.infer<typeof GetPreferredPackagesResponseSchema>;
export type GetPreferredPackageVersionResponse = z.infer<typeof GetPreferredPackageVersionResponseSchema>; 