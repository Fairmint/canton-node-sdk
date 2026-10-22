import { z } from 'zod';
import { ledgerNullableOptionalResponseField } from '../wire';

/** Status returned when the Ledger API computes an interface view. */
export const JsInterfaceViewStatusSchema = z
  .object({
    code: z.number(),
    message: z.string(),
    details: z.array(z.unknown()).optional(),
  })
  .strict();

const JsInterfaceViewWireSchema = z.strictObject({
  interfaceId: z.string(),
  implementationPackageId: ledgerNullableOptionalResponseField(z.string()),
  viewStatus: JsInterfaceViewStatusSchema,
  viewValue: ledgerNullableOptionalResponseField(z.unknown()),
});

/**
 * View of a created event selected by an interface filter.
 *
 * A failed view (`viewStatus.code !== 0`) has no `viewValue` and no `implementationPackageId`. The Ledger JSON API
 * sends both as JSON `null`; they are omitted from the parsed view.
 */
export const JsInterfaceViewSchema = JsInterfaceViewWireSchema.transform((view) => ({
  interfaceId: view.interfaceId,
  ...(view.implementationPackageId !== undefined && { implementationPackageId: view.implementationPackageId }),
  viewStatus: view.viewStatus,
  ...(view.viewValue !== undefined && { viewValue: view.viewValue }),
}));

export type JsInterfaceViewStatus = z.infer<typeof JsInterfaceViewStatusSchema>;
export type JsInterfaceView = z.infer<typeof JsInterfaceViewSchema>;
