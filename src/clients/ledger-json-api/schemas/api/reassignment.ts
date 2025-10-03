import { z } from 'zod';
import { TraceContextSchema } from '../common';
import { AssignCommandSchema, UnassignCommandSchema } from './commands';
import { CreatedEventDetailsSchema, EmptyCommandSchema, UnassignedEventDetailsSchema } from './event-details';
import { EventFormatSchema } from './events';

/** Reassignment command wrapper. */
export const ReassignmentCommandSchema = z.object({
  /** The reassignment command. */
  command: z.union([
    z.object({ AssignCommand: AssignCommandSchema }),
    z.object({ UnassignCommand: UnassignCommandSchema }),
    z.object({ Empty: EmptyCommandSchema }),
  ]),
});

/** Reassignment commands container. */
export const ReassignmentCommandsSchema = z.object({
  /** Workflow ID (optional). */
  workflowId: z.string().optional(),
  /** User ID submitting the command. */
  userId: z.string(),
  /** Unique identifier for the command. */
  commandId: z.string(),
  /** Party submitting the command. */
  submitter: z.string(),
  /** Submission ID (optional). */
  submissionId: z.string().optional(),
  /** List of reassignment commands. */
  commands: z.array(ReassignmentCommandSchema),
});

/** Submit reassignment request. */
export const SubmitReassignmentRequestSchema = z.object({
  /** The reassignment commands to submit. */
  reassignmentCommands: ReassignmentCommandsSchema,
});

/** Submit reassignment response. */
export const SubmitReassignmentResponseSchema = z.object({});

/** Submit and wait for reassignment request. */
export const SubmitAndWaitForReassignmentRequestSchema = z.object({
  /** The reassignment commands to submit. */
  reassignmentCommands: ReassignmentCommandsSchema,
  /** Event format for the response (optional). */
  eventFormat: EventFormatSchema.optional(),
});

/** Assignment event details. */
export const JsAssignmentEventSchema = z.object({
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
  /** Created event details. */
  createdEvent: CreatedEventDetailsSchema,
});

/** Unassigned event details. */
export const JsUnassignedEventSchema = z.object({
  /** Unassigned event details. */
  value: UnassignedEventDetailsSchema,
});

/** Reassignment event (oneOf assignment or unassigned). */
export const JsReassignmentEventSchema = z.union([
  z.object({ JsAssignmentEvent: JsAssignmentEventSchema }),
  z.object({ JsUnassignedEvent: JsUnassignedEventSchema }),
]);

/** Complete reassignment view. */
export const JsReassignmentSchema = z.object({
  /** Unique update ID for the reassignment. */
  updateId: z.string(),
  /** Command ID that resulted in this reassignment (optional). */
  commandId: z.string().optional(),
  /** Workflow ID (optional). */
  workflowId: z.string().optional(),
  /** Offset of the reassignment. */
  offset: z.number(),
  /** Collection of reassignment events. */
  events: z.array(JsReassignmentEventSchema),
  /** Trace context (optional). */
  traceContext: TraceContextSchema.optional(),
  /** Record time of the reassignment. */
  recordTime: z.string(),
});

/** Submit and wait for reassignment response. */
export const JsSubmitAndWaitForReassignmentResponseSchema = z.object({
  /** The reassignment that resulted from the submitted command. */
  reassignment: JsReassignmentSchema,
});

// Export types
export type ReassignmentCommand = z.infer<typeof ReassignmentCommandSchema>;
export type ReassignmentCommands = z.infer<typeof ReassignmentCommandsSchema>;
export type SubmitReassignmentRequest = z.infer<typeof SubmitReassignmentRequestSchema>;
export type SubmitReassignmentResponse = z.infer<typeof SubmitReassignmentResponseSchema>;
export type SubmitAndWaitForReassignmentRequest = z.infer<typeof SubmitAndWaitForReassignmentRequestSchema>;
export type JsAssignmentEvent = z.infer<typeof JsAssignmentEventSchema>;
export type JsUnassignedEvent = z.infer<typeof JsUnassignedEventSchema>;
export type JsReassignmentEvent = z.infer<typeof JsReassignmentEventSchema>;
export type JsReassignment = z.infer<typeof JsReassignmentSchema>;
export type JsSubmitAndWaitForReassignmentResponse = z.infer<typeof JsSubmitAndWaitForReassignmentResponseSchema>;
