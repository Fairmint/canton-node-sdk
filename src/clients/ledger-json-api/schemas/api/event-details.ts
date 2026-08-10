import { z } from 'zod';
import { RecordSchema } from '../base';
import { JsInterfaceViewSchema } from './interface-view';

export * from './interface-view';

/** Created event details. */
export const CreatedEventDetailsSchema = z.object({
  /** Offset of the event in the ledger stream. */
  offset: z.number(),
  /** Node ID of the event in the transaction tree. */
  nodeId: z.number(),
  /** Contract ID of the created contract. */
  contractId: z.string(),
  /** Template ID of the created contract. */
  templateId: z.string(),
  /**
   * Contract key, if present. Wire JSON may be any Daml value (record/text/…) or null when absent /
   * Optional.None.
   */
  contractKey: z.unknown().nullable().optional(),
  /** Canonical Base64 encoding of a 32-byte contract-key hash when a key is present. */
  contractKeyHash: z.string().optional(),
  /** Arguments used to create the contract. */
  createArgument: RecordSchema,
  /** Serialized event blob for the created contract (optional when includeCreatedEventBlob is false). */
  createdEventBlob: z.string().optional(),
  /** Interface views requested by matching interface filters. */
  interfaceViews: z.array(JsInterfaceViewSchema).optional().default([]),
  /** Parties that witnessed the creation. */
  witnessParties: z.array(z.string()),
  /** Parties that must sign the contract. */
  signatories: z.array(z.string()),
  /** Parties that observe the contract. */
  observers: z.array(z.string()).optional(),
  /** ISO 8601 timestamp when the contract was created. */
  createdAt: z.string(),
  /** Name of the Daml package containing the template. */
  packageName: z.string(),
  /** Package-id used to render create arguments / interface views. */
  representativePackageId: z.string().optional(),
  /** Whether this create contributes to an ACS delta projection. */
  acsDelta: z.boolean().optional(),
  /** List of interface IDs implemented by the contract. */
  implementedInterfaces: z.array(z.string()).optional(),
});

/** Archived event details. */
export const ArchivedEventDetailsSchema = z.object({
  /** Offset of the event in the ledger stream. */
  offset: z.number(),
  /** Node ID of the event in the transaction tree. */
  nodeId: z.number(),
  /** Contract ID of the archived contract. */
  contractId: z.string(),
  /** Template ID of the archived contract. */
  templateId: z.string(),
  /** Parties that witnessed the archival. */
  witnessParties: z.array(z.string()),
  /** Name of the Daml package containing the template. */
  packageName: z.string(),
  /** List of interface IDs implemented by the contract. */
  implementedInterfaces: z.array(z.string()).optional(),
});

/** Exercised event details (LEDGER_EFFECTS transaction shape). */
export const ExercisedEventDetailsSchema = z.object({
  /** Offset of the event in the ledger stream. */
  offset: z.number(),
  /** Node ID of the event in the transaction tree. */
  nodeId: z.number(),
  /** Contract ID of the exercised contract. */
  contractId: z.string(),
  /** Template ID of the exercised contract. */
  templateId: z.string(),
  /** Interface ID if the choice was exercised via an interface. */
  interfaceId: z.string().nullable().optional(),
  /** Name of the exercised choice. */
  choice: z.string(),
  /** Arguments passed to the exercised choice. */
  choiceArgument: z.unknown(),
  /** Parties acting in the exercise. */
  actingParties: z.array(z.string()),
  /** Whether the exercise archived the contract. */
  consuming: z.boolean(),
  /** Parties that witnessed the exercise. */
  witnessParties: z.array(z.string()),
  /** Upper bound of descendant node IDs in the transaction tree. */
  lastDescendantNodeId: z.number(),
  /** Result returned by the exercised choice. */
  exerciseResult: z.unknown().optional(),
  /** Name of the Daml package containing the template. */
  packageName: z.string(),
  /** List of interface IDs implemented by the contract. */
  implementedInterfaces: z.array(z.string()).optional(),
  /** Whether this exercise contributes to an ACS delta projection. */
  acsDelta: z.boolean().optional(),
});

/** Assigned event details. */
export const AssignedEventDetailsSchema = z.object({
  /** Offset of the event in the ledger stream. */
  offset: z.number(),
  /** Node ID of the event in the transaction tree. */
  nodeId: z.number(),
  /** Contract ID of the assigned contract. */
  contractId: z.string(),
  /** Template ID of the assigned contract. */
  templateId: z.string(),
  /** Source synchronizer ID. */
  source: z.string(),
  /** Target synchronizer ID. */
  target: z.string(),
  /** Reassignment ID. */
  reassignmentId: z.string(),
  /** Party submitting the assignment. */
  submitter: z.string(),
  /** Reassignment counter. */
  reassignmentCounter: z.number(),
  /** Name of the Daml package containing the template. */
  packageName: z.string(),
});

/** Unassigned event details. */
export const UnassignedEventDetailsSchema = z.object({
  /** Offset of the event in the ledger stream. */
  offset: z.number(),
  /** Node ID of the event in the transaction tree. */
  nodeId: z.number(),
  /** Contract ID of the unassigned contract. */
  contractId: z.string(),
  /** Template ID of the unassigned contract. */
  templateId: z.string(),
  /** Source synchronizer ID. */
  source: z.string(),
  /** Target synchronizer ID. */
  target: z.string(),
  /** Reassignment ID. */
  reassignmentId: z.string(),
  /** Party submitting the unassignment. */
  submitter: z.string(),
  /** Reassignment counter. */
  reassignmentCounter: z.number(),
  /** Name of the Daml package containing the template. */
  packageName: z.string(),
});

/** Empty command. */
export const EmptyCommandSchema = z.object({});

/** Status details for completions. */
export const StatusDetailsSchema = z.object({
  /** Error code. */
  code: z.number(),
  /** Error message. */
  message: z.string(),
  /** Additional error details - structure varies by error type */
  details: RecordSchema.optional(),
});

// Export types
export type CreatedEventDetails = z.infer<typeof CreatedEventDetailsSchema>;
export type ArchivedEventDetails = z.infer<typeof ArchivedEventDetailsSchema>;
export type ExercisedEventDetails = z.infer<typeof ExercisedEventDetailsSchema>;
export type AssignedEventDetails = z.infer<typeof AssignedEventDetailsSchema>;
export type UnassignedEventDetails = z.infer<typeof UnassignedEventDetailsSchema>;
export type EmptyCommand = z.infer<typeof EmptyCommandSchema>;
export type StatusDetails = z.infer<typeof StatusDetailsSchema>;
