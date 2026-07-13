import { z } from 'zod';

/** Status returned when the Ledger API computes an interface view. */
export const JsInterfaceViewStatusSchema = z
  .object({
    code: z.number(),
    message: z.string(),
    details: z.array(z.unknown()).optional(),
  })
  .strict();

/** View of a created event selected by an interface filter. */
export const JsInterfaceViewSchema = z.strictObject({
  interfaceId: z.string(),
  implementationPackageId: z.string().optional(),
  viewStatus: JsInterfaceViewStatusSchema,
  viewValue: z.unknown().optional(),
});

export type JsInterfaceViewStatus = z.infer<typeof JsInterfaceViewStatusSchema>;
export type JsInterfaceView = z.infer<typeof JsInterfaceViewSchema>;
