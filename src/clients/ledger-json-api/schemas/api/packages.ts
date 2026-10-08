import { z } from 'zod';
import { LedgerRfc3339TimestampSchema } from '../wire';

/** List packages response. */
export const ListPackagesResponseSchema = z.object({
  /** List of package IDs. */
  packageIds: z.array(z.string()),
});

/** Get package status response. */
export const GetPackageStatusResponseSchema = z.object({
  /** The status of the package. */
  packageStatus: z.string(),
});

/** Package reference details. */
export const PackageReferenceSchema = z.strictObject({
  /** Package ID. */
  packageId: z.string().min(1),
  /** Package name. */
  packageName: z.string().min(1),
  /** Package version. */
  packageVersion: z.string().min(1),
});

/** Package vetting requirement. */
export const PackageVettingRequirementSchema = z.strictObject({
  /** Parties whose vetting state should be considered. */
  parties: z.array(z.string().min(1)).min(1),
  /** Package name for which to resolve the preferred package. */
  packageName: z.string().min(1),
});

/** Get preferred packages request. */
export const GetPreferredPackagesRequestSchema = z.strictObject({
  /** Package vetting requirements. */
  packageVettingRequirements: z.array(PackageVettingRequirementSchema).min(1),
  /** Synchronizer ID (optional). */
  synchronizerId: z.string().min(1).optional(),
  /** Vetting valid at timestamp (optional). */
  vettingValidAt: LedgerRfc3339TimestampSchema.optional(),
});

/** Get preferred packages response. */
export const GetPreferredPackagesResponseSchema = z.strictObject({
  /** Package references. */
  packageReferences: z.array(PackageReferenceSchema).min(1),
  /** Synchronizer ID. */
  synchronizerId: z.string().min(1),
});

// Export types
export type ListPackagesResponse = z.infer<typeof ListPackagesResponseSchema>;
export type GetPackageStatusResponse = z.infer<typeof GetPackageStatusResponseSchema>;
export type PackageReference = z.infer<typeof PackageReferenceSchema>;
export type PackageVettingRequirement = z.infer<typeof PackageVettingRequirementSchema>;
export type GetPreferredPackagesRequest = z.infer<typeof GetPreferredPackagesRequestSchema>;
export type GetPreferredPackagesResponse = z.infer<typeof GetPreferredPackagesResponseSchema>;
