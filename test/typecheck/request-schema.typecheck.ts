import { z } from 'zod';
import { createRequestSchema } from '../../src/core';

interface ExampleRequest {
  readonly required: string;
  readonly optional?: boolean;
}

const createExampleRequestSchema = createRequestSchema<ExampleRequest>();

createExampleRequestSchema({
  required: z.string(),
  optional: z.boolean().optional(),
});

// Generated optional properties must still have a runtime validator.
// @ts-expect-error The optional key is intentionally missing.
createExampleRequestSchema({ required: z.string() });

createExampleRequestSchema({
  required: z.string(),
  optional: z.boolean().optional(),
  // @ts-expect-error Runtime schemas cannot add keys absent from the generated contract.
  extra: z.string(),
});

createExampleRequestSchema({
  required: z.string(),
  // @ts-expect-error The validator output must match the generated property type.
  optional: z.string().optional(),
});

createExampleRequestSchema({
  required: z.string(),
  // @ts-expect-error An optional generated property requires a validator that accepts undefined input.
  optional: z.boolean(),
});

interface NestedExampleRequest {
  readonly nested: {
    readonly required: string;
    readonly optional?: boolean;
  };
}

type NestedExample = NestedExampleRequest['nested'];
const createNestedExampleSchema = createRequestSchema<NestedExample>();

const nestedExampleSchema = createNestedExampleSchema({
  required: z.string(),
  optional: z.boolean().optional(),
});

createRequestSchema<NestedExampleRequest>()({
  nested: nestedExampleSchema,
});

// Nested generated properties must still have a runtime validator.
// @ts-expect-error The nested optional key is intentionally missing.
createNestedExampleSchema({ required: z.string() });

createNestedExampleSchema({
  required: z.string(),
  optional: z.boolean().optional(),
  // @ts-expect-error Nested runtime schemas cannot add keys absent from the generated contract.
  extra: z.string(),
});
