import { z } from 'zod';
import { RecordSchema } from './base';

// Tree event schemas
export const CreatedTreeEventSchema = z
  .object({
    CreatedTreeEvent: z
      .object({
        value: z
          .object({
            offset: z.number(),
            nodeId: z.number(),
            contractId: z.string(),
            templateId: z.string(),
            contractKey: z.string().nullable(),
            createArgument: RecordSchema,
            createdEventBlob: z.string(),
            interfaceViews: z.array(z.string()),
            witnessParties: z.array(z.string()),
            signatories: z.array(z.string()),
            observers: z.array(z.string()),
            createdAt: z.string(),
            packageName: z.string(),
            implementedInterfaces: z.array(z.string()).optional(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export const ExercisedTreeEventSchema = z
  .object({
    ExercisedTreeEvent: z
      .object({
        value: z
          .object({
            offset: z.number(),
            nodeId: z.number(),
            contractId: z.string(),
            templateId: z.string(),
            interfaceId: z.string().nullable(),
            choice: z.string(),
            choiceArgument: RecordSchema,
            actingParties: z.array(z.string()),
            witnessParties: z.array(z.string()),
            exerciseResult: RecordSchema,
            packageName: z.string(),
            consuming: z.boolean(),
            lastDescendantNodeId: z.number().optional(),
            implementedInterfaces: z.array(z.string()).optional(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export const ArchivedTreeEventSchema = z
  .object({
    ArchivedTreeEvent: z
      .object({
        value: z
          .object({
            offset: z.number(),
            nodeId: z.number(),
            contractId: z.string(),
            templateId: z.string(),
            witnessParties: z.array(z.string()),
            packageName: z.string(),
            implementedInterfaces: z.array(z.string()).optional(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export const TreeEventSchema = z.union([
  CreatedTreeEventSchema,
  ExercisedTreeEventSchema,
  ArchivedTreeEventSchema,
]);

// Event format schema
export const EventFormatSchema = z
  .object({
    verbose: z.boolean(),
    filtersByParty: z.record(
      z
        .object({
          cumulative: z.array(z.string()),
        })
        .strict()
    ),
  })
  .strict();

// Events by contract ID schemas
export const EventsByContractIdRequestSchema = z
  .object({
    contractId: z.string(),
    eventFormat: EventFormatSchema,
  })
  .strict();

export const CreatedEventSchema = z
  .object({
    createdEvent: z
      .object({
        offset: z.number(),
        nodeId: z.number(),
        contractId: z.string(),
        templateId: z.string(),
        contractKey: z.string().nullable(),
        createArgument: RecordSchema,
        createdEventBlob: z.string(),
        interfaceViews: z.array(z.string()),
        witnessParties: z.array(z.string()),
        signatories: z.array(z.string()),
        observers: z.array(z.string()),
        createdAt: z.string(),
        packageName: z.string(),
      })
      .strict(),
    synchronizerId: z.string(),
  })
  .strict();

export const ArchivedEventSchema = z
  .object({
    archivedEvent: z
      .object({
        offset: z.number(),
        nodeId: z.number(),
        contractId: z.string(),
        templateId: z.string(),
        witnessParties: z.array(z.string()),
        packageName: z.string(),
        implementedInterfaces: z.array(z.string()),
      })
      .strict(),
    synchronizerId: z.string(),
  })
  .strict();

export const EventsByContractIdResponseSchema = z
  .object({
    created: CreatedEventSchema.optional(),
    archived: ArchivedEventSchema.optional(),
  })
  .strict()
  .refine(data => data.created || data.archived, {
    message:
      'EventsByContractIdResponse must have at least one of: created, archived',
  });

// Type exports
export type CreatedTreeEvent = z.infer<typeof CreatedTreeEventSchema>;
export type ExercisedTreeEvent = z.infer<typeof ExercisedTreeEventSchema>;
export type ArchivedTreeEvent = z.infer<typeof ArchivedTreeEventSchema>;
export type TreeEvent = z.infer<typeof TreeEventSchema>;
export type EventFormat = z.infer<typeof EventFormatSchema>;
export type EventsByContractIdRequest = z.infer<
  typeof EventsByContractIdRequestSchema
>;
export type CreatedEvent = z.infer<typeof CreatedEventSchema>;
export type ArchivedEvent = z.infer<typeof ArchivedEventSchema>;
export type EventsByContractIdResponse = z.infer<
  typeof EventsByContractIdResponseSchema
>; 