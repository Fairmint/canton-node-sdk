import { z } from 'zod';
import { FilterSchema, ApiFeaturesSchema } from '../common';
import { EventFormatSchema } from './events';
import { 
  CreatedEventDetailsSchema, 
  ArchivedEventDetailsSchema, 
  AssignedEventDetailsSchema, 
  UnassignedEventDetailsSchema 
} from './event-details';

/**
 * Get active contracts request.
 */
export const GetActiveContractsRequestSchema = z.object({
  /** Filter for the request (optional, deprecated). */
  filter: FilterSchema.optional(),
  /** Verbose flag (optional, deprecated). */
  verbose: z.boolean().optional(),
  /** Active at offset for the snapshot. */
  activeAtOffset: z.number(),
  /** Event format (optional). */
  eventFormat: EventFormatSchema.optional(),
});

/**
 * Active contract details.
 */
export const JsActiveContractSchema = z.object({
  /** Created event details. */
  createdEvent: CreatedEventDetailsSchema,
  /** Synchronizer ID. */
  synchronizerId: z.string(),
  /** Reassignment counter. */
  reassignmentCounter: z.number(),
});

/**
 * Archived contract details.
 */
export const JsArchivedSchema = z.object({
  /** Archived event details. */
  archivedEvent: ArchivedEventDetailsSchema,
  /** Synchronizer ID. */
  synchronizerId: z.string(),
});

/**
 * Incomplete assigned contract details.
 */
export const JsIncompleteAssignedSchema = z.object({
  /** Assigned event details. */
  assignedEvent: AssignedEventDetailsSchema,
});

/**
 * Incomplete unassigned contract details.
 */
export const JsIncompleteUnassignedSchema = z.object({
  /** Created event details. */
  createdEvent: CreatedEventDetailsSchema,
  /** Unassigned event details. */
  unassignedEvent: UnassignedEventDetailsSchema,
});

/**
 * Empty contract entry.
 */
export const JsEmptySchema = z.object({});

/**
 * Contract entry (oneOf all contract entry types).
 */
export const JsContractEntrySchema = z.union([
  z.object({ JsActiveContract: JsActiveContractSchema }),
  z.object({ JsEmpty: JsEmptySchema }),
  z.object({ JsIncompleteAssigned: JsIncompleteAssignedSchema }),
  z.object({ JsIncompleteUnassigned: JsIncompleteUnassignedSchema }),
]);

/**
 * Get active contracts response item.
 */
export const JsGetActiveContractsResponseItemSchema = z.object({
  /** Workflow ID (optional). */
  workflowId: z.string().optional(),
  /** Contract entry. */
  contractEntry: JsContractEntrySchema,
});

/**
 * Get active contracts response (array of contract entries).
 */
export const JsGetActiveContractsResponseSchema = z.array(JsGetActiveContractsResponseItemSchema);

/**
 * Get ledger end response.
 */
export const GetLedgerEndResponseSchema = z.object({
  /** Ledger end offset. */
  offset: z.number(),
});

/**
 * Get latest pruned offsets response.
 */
export const GetLatestPrunedOffsetsResponseSchema = z.object({
  /** Participant pruned up to inclusive offset. */
  participantPrunedUpToInclusive: z.number(),
  /** All divulged contracts pruned up to inclusive offset. */
  allDivulgedContractsPrunedUpToInclusive: z.number(),
});

/**
 * Connected synchronizer details.
 */
export const ConnectedSynchronizerSchema = z.object({
  /** Synchronizer alias. */
  synchronizerAlias: z.string(),
  /** Synchronizer ID. */
  synchronizerId: z.string(),
  /** Permission level. */
  permission: z.string(),
});

/**
 * Get connected synchronizers response.
 */
export const GetConnectedSynchronizersResponseSchema = z.object({
  /** List of connected synchronizers. */
  connectedSynchronizers: z.array(ConnectedSynchronizerSchema),
});

/**
 * Get ledger API version response.
 */
export const GetLedgerApiVersionResponseSchema = z.object({
  /** Version of the ledger API. */
  version: z.string(),
  /** Features supported by this endpoint (optional). */
  features: ApiFeaturesSchema.optional(),
});

// Export types
export type GetActiveContractsRequest = z.infer<typeof GetActiveContractsRequestSchema>;
export type JsActiveContract = z.infer<typeof JsActiveContractSchema>;
export type JsArchived = z.infer<typeof JsArchivedSchema>;
export type JsIncompleteAssigned = z.infer<typeof JsIncompleteAssignedSchema>;
export type JsIncompleteUnassigned = z.infer<typeof JsIncompleteUnassignedSchema>;
export type JsEmpty = z.infer<typeof JsEmptySchema>;
export type JsContractEntry = z.infer<typeof JsContractEntrySchema>;
export type JsGetActiveContractsResponseItem = z.infer<typeof JsGetActiveContractsResponseItemSchema>;
export type JsGetActiveContractsResponse = z.infer<typeof JsGetActiveContractsResponseSchema>;
export type GetLedgerEndResponse = z.infer<typeof GetLedgerEndResponseSchema>;
export type GetLatestPrunedOffsetsResponse = z.infer<typeof GetLatestPrunedOffsetsResponseSchema>;
export type ConnectedSynchronizer = z.infer<typeof ConnectedSynchronizerSchema>;
export type GetConnectedSynchronizersResponse = z.infer<typeof GetConnectedSynchronizersResponseSchema>;
export type GetLedgerApiVersionResponse = z.infer<typeof GetLedgerApiVersionResponseSchema>; 