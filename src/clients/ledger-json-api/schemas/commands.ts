import { z } from 'zod';
import { RecordSchema } from './base';

// Command schemas
export const CreateCommandSchema = z
  .object({
    CreateCommand: z
      .object({
        templateId: z.string(),
        createArguments: RecordSchema,
      })
      .strict(),
  })
  .strict();

export const ExerciseCommandSchema = z
  .object({
    ExerciseCommand: z
      .object({
        templateId: z.string(),
        contractId: z.string(),
        choice: z.string(),
        choiceArgument: RecordSchema,
      })
      .strict(),
  })
  .strict();

export const CommandSchema = z.union([
  CreateCommandSchema,
  ExerciseCommandSchema,
]);

// Disclosed contract schema
export const DisclosedContractSchema = z
  .object({
    templateId: z.string().optional(),
    contractId: z.string(),
    createdEventBlob: z.string(),
    synchronizerId: z.string(),
  })
  .strict();

// Command request schema
export const CommandRequestSchema = z
  .object({
    commands: z.array(CommandSchema),
    commandId: z.string(),
    actAs: z.array(z.string()),
    readAs: z.array(z.string()).optional(),
    disclosedContracts: z.array(DisclosedContractSchema).optional(),
  })
  .strict();

// Type exports
export type CreateCommand = z.infer<typeof CreateCommandSchema>;
export type ExerciseCommand = z.infer<typeof ExerciseCommandSchema>;
export type Command = z.infer<typeof CommandSchema>;
export type DisclosedContract = z.infer<typeof DisclosedContractSchema>;
export type CommandRequest = z.infer<typeof CommandRequestSchema>; 