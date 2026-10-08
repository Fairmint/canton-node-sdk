/**
 * Submitted transactions as the Ledger JSON API returns them, so the result readers can be asserted without a
 * participant node.
 *
 * Responses use a flat `transaction.events` array with `CreatedEvent` / `ExercisedEvent` payloads on the wrapper
 * (ledger-effects shape from submit-and-wait-for-transaction).
 */

export const UPDATE_ID = 'update-1220abcd';

export const PACKAGE_ID = '0e5b1f4f1a2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6';

export const HOLDING_TEMPLATE = 'WrappedAssets.Holding:WrappedAsset';

export const BURN_OFFER_TEMPLATE = 'WrappedAssets.BurnOffer:BurnOffer';

export interface ExercisedFixture {
  readonly choice: string;
  readonly exerciseResult?: unknown;
  readonly contractId?: string;
  readonly templateId?: string;
  readonly interfaceId?: string;
}

export function exercised(fixture: ExercisedFixture): Record<string, unknown> {
  return {
    choice: fixture.choice,
    contractId: fixture.contractId ?? 'cid-exercised',
    templateId: fixture.templateId ?? `${PACKAGE_ID}:WrappedAssets.BurnMint:WrappedAssetsBurnMintFactory`,
    interfaceId: fixture.interfaceId ?? null,
    exerciseResult: fixture.exerciseResult ?? {},
  };
}

export function created(template: string, contractId: string): Record<string, unknown> {
  return {
    contractId,
    templateId: `${PACKAGE_ID}:${template}`,
    createArgument: {},
  };
}

export interface EventFixture {
  readonly exercised?: Record<string, unknown>;
  readonly created?: Record<string, unknown>;
}

/** Flat submit-and-wait-for-transaction shape: `transaction.events` with payloads on the event wrappers. */
export function flatTransaction(events: readonly EventFixture[], updateId: string = UPDATE_ID): unknown {
  return {
    transaction: {
      updateId,
      events: events.map((event) =>
        event.exercised === undefined ? { CreatedEvent: event.created } : { ExercisedEvent: event.exercised }
      ),
    },
  };
}

/** Alias of {@link flatTransaction} — same ledger-effects event array. */
export function flattenedTransaction(events: readonly EventFixture[], updateId: string = UPDATE_ID): unknown {
  return flatTransaction(events, updateId);
}
