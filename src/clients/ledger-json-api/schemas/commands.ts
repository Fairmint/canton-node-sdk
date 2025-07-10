import { z } from 'zod';
import { RecordSchema } from './base';

export const CreateCommandSchema = z
  .object({
    /**
     * Command to create a new contract instance.
     */
    CreateCommand: z
      .object({
        /** Template ID of the contract to create. */
        templateId: z.string(),
        /** Arguments for the contract creation. */
        createArguments: RecordSchema,
      })
      .strict(),
  })
  .strict();

export const ExerciseCommandSchema = z
  .object({
    /**
     * Command to exercise a choice on an existing contract.
     */
    ExerciseCommand: z
      .object({
        /** Template ID of the contract. */
        templateId: z.string(),
        /** Contract ID to exercise the choice on. */
        contractId: z.string(),
        /** Name of the choice to exercise. */
        choice: z.string(),
        /** Arguments for the choice. */
        choiceArgument: RecordSchema,
      })
      .strict(),
  })
  .strict();

export const CommandSchema = z.union([
  CreateCommandSchema,
  ExerciseCommandSchema,
]);

export const DisclosedContractSchema = z
  .object({
    /** Template ID of the disclosed contract (optional). */
    templateId: z.string().optional(),
    /** Contract ID of the disclosed contract. */
    contractId: z.string(),
    /** Serialized event blob for the disclosed contract. */
    createdEventBlob: z.string(),
    /** Synchronizer ID for the disclosed contract. */
    synchronizerId: z.string(),
  })
  .strict();

export const CommandRequestSchema = z
  .object({
    /** List of commands to submit. */
    commands: z.array(CommandSchema),
    /** Unique identifier for the command request. */
    commandId: z.string(),
    /** Parties submitting the command. */
    actAs: z.array(z.string()),
    /** Parties to read as (optional). */
    readAs: z.array(z.string()).optional(),
    /** Disclosed contracts referenced by the command (optional). */
    disclosedContracts: z.array(DisclosedContractSchema).optional(),
  })
  .strict();

export type CreateCommand = z.infer<typeof CreateCommandSchema>;
export type ExerciseCommand = z.infer<typeof ExerciseCommandSchema>;
export type Command = z.infer<typeof CommandSchema>;
export type DisclosedContract = z.infer<typeof DisclosedContractSchema>;
export type CommandRequest = z.infer<typeof CommandRequestSchema>; 