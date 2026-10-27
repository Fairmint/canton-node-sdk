/** Shared HoldingV1 fixture and interface-view assertions for LedgerJsonApiClient integration tests. */

import { randomUUID } from 'node:crypto';

import { TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID } from '../../../../src';
import { retry } from '@fairmint/canton-dev-tools/testing';
import { getClient as getValidatorClient } from '../validator-api/setup';
import { getClient } from './setup';

const HOLDING_INTERFACE_SUFFIX = ':Splice.Api.Token.HoldingV1:Holding';

export interface HoldingCreate {
  readonly party: string;
  readonly contractId: string;
  readonly offset: number;
}

/**
 * Finds one of the wallet party's HoldingV1 contracts and the offset that created it, tapping Amulet if it has none.
 * Call `ensureValidatorUserOnboarded` first.
 */
export async function findOrTapHolding(): Promise<HoldingCreate> {
  const validatorClient = getValidatorClient();
  const { party_id: party } = await validatorClient.getUserStatus();
  const client = getClient();
  client.setPartyId(party);

  const findHolding = async (): Promise<HoldingCreate | undefined> => {
    const snapshot = await client.getActiveContracts({
      parties: [party],
      interfaceIds: [TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID],
      includeInterfaceView: false,
    });
    for (const item of snapshot) {
      if ('JsActiveContract' in item.contractEntry) {
        const { contractId, offset } = item.contractEntry.JsActiveContract.createdEvent;
        return { party, contractId, offset };
      }
    }
    return undefined;
  };

  const existing = await findHolding();
  if (existing) {
    return existing;
  }
  await validatorClient.tap({ amount: '10', command_id: `holding-interface-view-${randomUUID()}` });
  return retry(
    async (): Promise<HoldingCreate> => {
      const tapped = await findHolding();
      if (!tapped) {
        throw new Error(`The tapped Amulet of ${party} is not active yet`);
      }
      return tapped;
    },
    { description: `a HoldingV1 contract of ${party}` }
  );
}

/** The created-event fields that interface filters control, as both update reads and active-contract reads return them. */
export interface ViewedCreatedEvent {
  readonly contractId: string;
  readonly createdEventBlob?: string | undefined;
  readonly interfaceViews?:
    | ReadonlyArray<{
        readonly interfaceId: string;
        readonly viewStatus: { readonly code: number };
        readonly viewValue?: unknown;
      }>
    | undefined;
}

/** Asserts that the event carries exactly one computed HoldingV1 view, owned by `owner`. */
export function expectHoldingView(event: ViewedCreatedEvent, owner: string): void {
  const views = (event.interfaceViews ?? []).filter((view) => view.interfaceId.endsWith(HOLDING_INTERFACE_SUFFIX));
  expect(views).toHaveLength(1);
  const [view] = views;
  expect(view?.viewStatus.code).toBe(0);
  expect(view?.viewValue).toEqual(expect.objectContaining({ owner }));
}

export function expectCreatedEventBlob(event: ViewedCreatedEvent): void {
  expect(event.createdEventBlob).toEqual(expect.any(String));
  expect(event.createdEventBlob).not.toHaveLength(0);
}
