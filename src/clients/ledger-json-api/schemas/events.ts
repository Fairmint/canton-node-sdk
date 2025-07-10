import { z } from 'zod';
import { RecordSchema } from './base';

export const CreatedTreeEventSchema = z
  .object({
    /**
     * The created event details for a contract node in the transaction tree.
     */
    CreatedTreeEvent: z
      .object({
        value: z
          .object({
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
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export const ExercisedTreeEventSchema = z
  .object({
    /**
     * The exercised event details for a contract node in the transaction tree.
     */
    ExercisedTreeEvent: z
      .object({
        value: z
          .object({
            /** Offset of the event in the ledger stream. */
            offset: z.number(),
            /** Node ID of the event in the transaction tree. */
            nodeId: z.number(),
            /** Contract ID of the exercised contract. */
            contractId: z.string(),
            /** Template ID of the exercised contract. */
            templateId: z.string(),
            /** Interface ID if the choice was exercised via an interface. */
            interfaceId: z.string().nullable(),
            /** Name of the exercised choice. */
            choice: z.string(),
            /** Arguments passed to the exercised choice. */
            choiceArgument: RecordSchema,
            /** Parties acting in the exercise. */
            actingParties: z.array(z.string()),
            /** Parties that witnessed the exercise. */
            witnessParties: z.array(z.string()),
            /** Result returned by the exercised choice. */
            exerciseResult: RecordSchema,
            /** Name of the Daml package containing the template. */
            packageName: z.string(),
            /** Whether the exercise archived the contract. */
            consuming: z.boolean(),
            /** Node ID of the last descendant in the subtree, if present. */
            lastDescendantNodeId: z.number().optional(),
            /** List of interface IDs implemented by the contract. */
            implementedInterfaces: z.array(z.string()).optional(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export const ArchivedTreeEventSchema = z
  .object({
    /**
     * The archived event details for a contract node in the transaction tree.
     */
    ArchivedTreeEvent: z
      .object({
        value: z
          .object({
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

export const EventFormatSchema = z
  .object({
    /**
     * If true, include all available fields in the event. If false, include only essential fields.
     */
    verbose: z.boolean(),
    /**
     * Map of party IDs to their event filters. Each key is a party, and the value specifies which events to include for that party.
     */
    filtersByParty: z.record(
      z
        .object({
          /**
           * List of template or interface filters for this party.
           */
          cumulative: z.array(z.string()),
        })
        .strict()
    ),
    /**
     * If true, include the createdEventBlob field in created events.
     */
    includeCreatedEventBlob: z.boolean().optional(),
    /**
     * If true, include interface views in created events.
     */
    includeInterfaceViews: z.boolean().optional(),
  })
  .strict();

export const EventsByContractIdRequestSchema = z
  .object({
    /** The contract ID to query events for. */
    contractId: z.string(),
    /** Format options for the returned events. */
    eventFormat: EventFormatSchema,
  })
  .strict();

export const CreatedEventSchema = z
  .object({
    /**
     * The created event details for a contract.
     */
    createdEvent: z
      .object({
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
      })
      .strict(),
    /** Synchronizer ID for the event. */
    synchronizerId: z.string(),
  })
  .strict();

export const ArchivedEventSchema = z
  .object({
    /**
     * The archived event details for a contract.
     */
    archivedEvent: z
      .object({
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
        implementedInterfaces: z.array(z.string()),
      })
      .strict(),
    /** Synchronizer ID for the event. */
    synchronizerId: z.string(),
  })
  .strict();

export const EventsByContractIdResponseSchema = z
  .object({
    /** Created event, if the contract is active. */
    created: CreatedEventSchema.optional(),
    /** Archived event, if the contract is archived. */
    archived: ArchivedEventSchema.optional(),
  })
  .strict()
  .refine(data => data.created || data.archived, {
    message:
      'EventsByContractIdResponse must have at least one of: created, archived',
  });

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