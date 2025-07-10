import { z } from 'zod';
import { RecordSchema } from './base';

/**
 * Created event details.
 */
export const CreatedEventDetailsSchema = z.object({
  /** Offset of the event in the ledger stream. */
  offset: z.number(),
  /** Node ID of the event in the transaction tree. */
  nodeId: z.number(),
  /** Contract ID of the created contract. */
  contractId: z.string(),
  /** Template ID of the created contract. */
  templateId: z.string(),
  /** Contract key, if present. */
  contractKey: z.string().nullable(),
  /** Arguments used to create the contract. */
  createArgument: RecordSchema,
  /** Serialized event blob for the created contract. */
  createdEventBlob: z.string(),
  /** List of interface view names implemented by the contract. */
  interfaceViews: z.array(z.string()),
  /** Parties that witnessed the creation. */
  witnessParties: z.array(z.string()),
  /** Parties that must sign the contract. */
  signatories: z.array(z.string()),
  /** Parties that observe the contract. */
  observers: z.array(z.string()),
  /** ISO 8601 timestamp when the contract was created. */
  createdAt: z.string(),
  /** Name of the Daml package containing the template. */
  packageName: z.string(),
  /** List of interface IDs implemented by the contract. */
  implementedInterfaces: z.array(z.string()).optional(),
});

/**
 * Archived event details.
 */
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

/**
 * Assigned event details.
 */
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

/**
 * Unassigned event details.
 */
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

/**
 * Empty command.
 */
export const EmptyCommandSchema = z.object({});

/**
 * Status details for completions.
 */
export const StatusDetailsSchema = z.object({
  /** Error code. */
  code: z.number(),
  /** Error message. */
  message: z.string(),
  /** Additional error details. */
  details: z.record(z.any()).optional(),
});

// Export types
export type CreatedEventDetails = z.infer<typeof CreatedEventDetailsSchema>;
export type ArchivedEventDetails = z.infer<typeof ArchivedEventDetailsSchema>;
export type AssignedEventDetails = z.infer<typeof AssignedEventDetailsSchema>;
export type UnassignedEventDetails = z.infer<typeof UnassignedEventDetailsSchema>;
export type EmptyCommand = z.infer<typeof EmptyCommandSchema>;
export type StatusDetails = z.infer<typeof StatusDetailsSchema>; 