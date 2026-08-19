/**
 * Submitted transactions as the Ledger JSON API returns them, so the result readers can be asserted without a
 * participant node.
 *
 * Every response shape is built here on purpose: the submit-and-wait tree endpoints key events by node id and name the
 * variants `*TreeEvent`, the flat ones return an array and name them `*Event`, and either spelling arrives with its
 * payload nested under `value` or flattened onto the wrapper. A reader that only handled one would pass a fixture that
 * only built one.
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

/** The tree shape: events keyed by node id, variants named `*TreeEvent`, payload nested under `value`. */
export function transactionTree(events: readonly EventFixture[], updateId: string = UPDATE_ID): unknown {
  const eventsById: Record<string, unknown> = {};
  events.forEach((event, index) => {
    eventsById[String(index)] =
      event.exercised === undefined
        ? { CreatedTreeEvent: { value: event.created } }
        : { ExercisedTreeEvent: { value: event.exercised } };
  });
  return { transactionTree: { updateId, eventsById } };
}

/** The flat shape: an event array, variants named `*Event`, payload nested under `value`. */
export function flatTransaction(events: readonly EventFixture[], updateId: string = UPDATE_ID): unknown {
  return {
    transaction: {
      updateId,
      events: events.map((event) =>
        event.exercised === undefined
          ? { CreatedEvent: { value: event.created } }
          : { ExercisedEvent: { value: event.exercised } }
      ),
    },
  };
}

/** The flat shape with the payload flattened onto the wrapper rather than nested under `value`. */
export function flattenedTransaction(events: readonly EventFixture[], updateId: string = UPDATE_ID): unknown {
  return {
    transaction: {
      updateId,
      events: events.map((event) =>
        event.exercised === undefined ? { CreatedEvent: event.created } : { ExercisedEvent: event.exercised }
      ),
    },
  };
}
