import { z } from 'zod';
import { RecordSchema } from '../base';

/** Interactive submission allocate party request. */
export const InteractiveSubmissionAllocatePartyRequestSchema = z.object({
  /** Party identifier hint (optional). */
  partyIdHint: z.string().optional(),
  /** Display name (optional). */
  displayName: z.string().optional(),
  /** Is local party flag (optional). */
  isLocal: z.boolean().optional(),
});

/** Interactive submission allocate party response. */
export const InteractiveSubmissionAllocatePartyResponseSchema = z.object({
  /** Allocated party details. */
  party: z.object({
    /** Party identifier. */
    party: z.string(),
    /** Display name (optional). */
    displayName: z.string().optional(),
    /** Is local party flag. */
    isLocal: z.boolean(),
  }),
});

/** Interactive submission create user request. */
export const InteractiveSubmissionCreateUserRequestSchema = z.object({
  /** User to create. */
  user: z.object({
    /** User identifier. */
    id: z.string(),
    /** Primary party for the user (optional). */
    primaryParty: z.string().optional(),
    /** Whether the user is deactivated. */
    isDeactivated: z.boolean(),
    /** User metadata (optional). */
    metadata: z
      .object({
        /** Resource version for concurrent change detection. */
        resourceVersion: z.string(),
        /** Annotations for the resource. */
        annotations: z.record(z.string(), z.string()),
      })
      .optional(),
    /** Identity provider ID (optional). */
    identityProviderId: z.string().optional(),
  }),
  /** Rights to assign to the user (optional). */
  rights: z
    .array(
      z.object({
        /** The kind of right. */
        kind: z.union([
          z.object({ CanActAs: z.object({ party: z.string() }) }),
          z.object({ CanReadAs: z.object({ party: z.string() }) }),
          z.object({ CanReadAsAnyParty: z.object({}) }),
          z.object({ Empty: z.object({}) }),
          z.object({ IdentityProviderAdmin: z.object({}) }),
          z.object({ ParticipantAdmin: z.object({}) }),
        ]),
      })
    )
    .optional(),
});

/** Interactive submission create user response. */
export const InteractiveSubmissionCreateUserResponseSchema = z.object({
  /** Created user. */
  user: z.object({
    /** User identifier. */
    id: z.string(),
    /** Primary party for the user (optional). */
    primaryParty: z.string().optional(),
    /** Whether the user is deactivated. */
    isDeactivated: z.boolean(),
    /** User metadata (optional). */
    metadata: z
      .object({
        /** Resource version for concurrent change detection. */
        resourceVersion: z.string(),
        /** Annotations for the resource. */
        annotations: z.record(z.string(), z.string()),
      })
      .optional(),
    /** Identity provider ID (optional). */
    identityProviderId: z.string().optional(),
  }),
});

/** Interactive submission upload DAR request. */
export const InteractiveSubmissionUploadDarRequestSchema = z.object({
  /** DAR file content. */
  darFile: z.any(), // Buffer or string
});

/** Interactive submission upload DAR response. */
export const InteractiveSubmissionUploadDarResponseSchema = z.object({});

const CreateCommandSchema = z.object({
  CreateCommand: z.object({
    templateId: z.string(),
    createArguments: RecordSchema,
  }),
});

const ExerciseCommandSchema = z.object({
  ExerciseCommand: z.object({
    templateId: z.string(),
    contractId: z.string(),
    choice: z.string(),
    choiceArgument: RecordSchema,
  }),
});

const CreateAndExerciseCommandSchema = z.object({
  CreateAndExerciseCommand: z.object({
    templateId: z.string(),
    createArguments: RecordSchema,
    choice: z.string(),
    choiceArgument: RecordSchema,
  }),
});

const ExerciseByKeyCommandSchema = z.object({
  ExerciseByKeyCommand: z.object({
    templateId: z.string(),
    contractKey: RecordSchema,
    choice: z.string(),
    choiceArgument: RecordSchema,
  }),
});

const CommandSchema = z.union([
  CreateCommandSchema,
  ExerciseCommandSchema,
  CreateAndExerciseCommandSchema,
  ExerciseByKeyCommandSchema,
]);

const DisclosedContractSchema = z.object({
  contractId: z.string(),
  templateId: z.string(),
  createdEventBlob: z.string().optional(),
  synchronizerId: z.string(),
  metadata: z.unknown().optional(),
});

const PackagePreferenceSchema = z.object({
  packageId: z.string().optional(),
  packageName: z.string().optional(),
});

/** Interactive submission prepare request. */
export const InteractiveSubmissionPrepareRequestSchema = z.object({
  commands: z.array(CommandSchema),
  commandId: z.string(),
  userId: z.string(),
  actAs: z.array(z.string()),
  readAs: z.array(z.string()),
  disclosedContracts: z.array(DisclosedContractSchema).optional(),
  synchronizerId: z.string(),
  verboseHashing: z.boolean().optional(),
  packageIdSelectionPreference: z.array(PackagePreferenceSchema).optional(),
});

/** Interactive submission prepare response. */
export const InteractiveSubmissionPrepareResponseSchema = z.object({
  preparedTransactionHash: z.string(),
  preparedTransaction: z.string().optional(),
  submissionId: z.string().optional(),
  hashingSchemeVersion: z.string().optional(),
  verboseHashing: z.boolean().optional(),
});

const DeduplicationPeriodSchema = z.union([
  z.object({ Empty: z.object({}) }),
  z.object({
    DeduplicationDuration: z.object({
      value: z.object({
        duration: z.string(),
      }),
    }),
  }),
  z.object({
    DeduplicationOffset: z.object({
      value: z.object({
        offset: z.string(),
      }),
    }),
  }),
]);

const PartySignatureSchema = z.object({
  party: z.string(),
  signatures: z.array(
    z.object({
      signature: z.string(),
      signedBy: z.string(),
      format: z.string(),
      signingAlgorithmSpec: z.string(),
    })
  ),
});

/** Interactive submission execute request. */
export const InteractiveSubmissionExecuteRequestSchema = z.object({
  userId: z.string(),
  preparedTransaction: z.string(),
  hashingSchemeVersion: z.string(),
  submissionId: z.string(),
  deduplicationPeriod: DeduplicationPeriodSchema.optional(),
  partySignatures: z.object({
    signatures: z.array(PartySignatureSchema),
  }),
});

/** Interactive submission execute response. */
export const InteractiveSubmissionExecuteResponseSchema = z.object({
  submissionId: z.string().optional(),
});

// Export types
export type InteractiveSubmissionAllocatePartyRequest = z.infer<typeof InteractiveSubmissionAllocatePartyRequestSchema>;
export type InteractiveSubmissionAllocatePartyResponse = z.infer<
  typeof InteractiveSubmissionAllocatePartyResponseSchema
>;
export type InteractiveSubmissionCreateUserRequest = z.infer<typeof InteractiveSubmissionCreateUserRequestSchema>;
export type InteractiveSubmissionCreateUserResponse = z.infer<typeof InteractiveSubmissionCreateUserResponseSchema>;
export type InteractiveSubmissionUploadDarRequest = z.infer<typeof InteractiveSubmissionUploadDarRequestSchema>;
export type InteractiveSubmissionUploadDarResponse = z.infer<typeof InteractiveSubmissionUploadDarResponseSchema>;
export type InteractiveSubmissionPrepareRequest = z.infer<typeof InteractiveSubmissionPrepareRequestSchema>;
export type InteractiveSubmissionPrepareResponse = z.infer<typeof InteractiveSubmissionPrepareResponseSchema>;
export type InteractiveSubmissionExecuteRequest = z.infer<typeof InteractiveSubmissionExecuteRequestSchema>;
export type InteractiveSubmissionExecuteResponse = z.infer<typeof InteractiveSubmissionExecuteResponseSchema>;
