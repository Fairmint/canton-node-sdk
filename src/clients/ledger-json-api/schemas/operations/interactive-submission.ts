import { z } from 'zod';
import { LedgerRfc3339TimestampSchema } from '../wire';

/** Parameters for interactive submission get preferred packages. */
export const InteractiveSubmissionGetPreferredPackagesParamsSchema = z.strictObject({
  /** Package vetting requirements. */
  packageVettingRequirements: z
    .array(
      z.strictObject({
        /** Parties whose vetting state should be considered. */
        parties: z.array(z.string().min(1)).min(1),
        /** Package name for which to resolve the preferred package. */
        packageName: z.string().min(1),
      })
    )
    .min(1),
  /** Synchronizer ID (optional). */
  synchronizerId: z.string().min(1).optional(),
  /** Vetting valid at timestamp (optional). */
  vettingValidAt: LedgerRfc3339TimestampSchema.optional(),
});

// Export types
export type InteractiveSubmissionGetPreferredPackagesParams = z.infer<
  typeof InteractiveSubmissionGetPreferredPackagesParamsSchema
>;
