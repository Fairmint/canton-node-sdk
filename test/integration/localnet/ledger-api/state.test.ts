/** LedgerJsonApiClient integration tests: State Queries */

import {
  TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID,
  type JsGetActiveContractsResponseItem,
  type StreamActiveContractsParams,
} from '../../../../src';
import { ensureValidatorUserOnboarded, VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS } from '../validator-api/setup';
import {
  expectCreatedEventBlob,
  expectHoldingView,
  findOrTapHolding,
  type HoldingCreate,
  type ViewedCreatedEvent,
} from './holding';
import { getClient, resolveValidatorPartyId } from './setup';

const WALLET_APP_INSTALL_TEMPLATE_ID = '#splice-wallet:Splice.Wallet.Install:WalletAppInstall';

function activeContractIds(item: JsGetActiveContractsResponseItem): string[] {
  return 'JsActiveContract' in item.contractEntry ? [item.contractEntry.JsActiveContract.createdEvent.contractId] : [];
}

function activeCreatedEvent(
  items: readonly JsGetActiveContractsResponseItem[],
  contractId: string
): ViewedCreatedEvent {
  const created = items.flatMap((item) =>
    'JsActiveContract' in item.contractEntry &&
    item.contractEntry.JsActiveContract.createdEvent.contractId === contractId
      ? [item.contractEntry.JsActiveContract.createdEvent]
      : []
  );
  expect(created).toHaveLength(1);
  const [event] = created;
  if (!event) {
    throw new Error(`No active contract ${contractId}`);
  }
  return event;
}

describe('LedgerJsonApiClient / State', () => {
  test('getLedgerEnd returns ledger end offset', async () => {
    const client = getClient();
    const response = await client.getLedgerEnd({});

    expect(response).toBeDefined();
    expect(response.offset).toBeDefined();
  });

  describe('streamActiveContracts', () => {
    let party: string;

    beforeAll(async () => {
      party = await resolveValidatorPartyId();
      getClient().setPartyId(party);
    });

    test('streams the same WalletAppInstall snapshot that getActiveContracts collects', async () => {
      const client = getClient();
      const filter = { parties: [party], templateIds: [WALLET_APP_INSTALL_TEMPLATE_ID] };

      // Without an offset the stream reads at the ledger end and reports which offset that was.
      const snapshot = client.streamActiveContracts(filter);
      const streamed: string[] = [];
      for await (const item of snapshot) {
        streamed.push(...activeContractIds(item));
      }
      const { activeAtOffset } = snapshot;
      if (activeAtOffset === undefined) {
        throw new Error('The stream did not report the offset it read at');
      }
      expect(activeAtOffset).toBeGreaterThan(0);

      const collected = (await client.getActiveContracts({ ...filter, activeAtOffset })).flatMap(activeContractIds);

      expect(streamed.length).toBeGreaterThan(0);
      expect(streamed).toEqual(collected);
    });

    test('stops when the consumer breaks out after the first item', async () => {
      const client = getClient();

      let received = 0;
      for await (const item of client.streamActiveContracts({ parties: [party] })) {
        expect(item.contractEntry).toBeDefined();
        received += 1;
        break;
      }

      expect(received).toBe(1);
      // The early close leaves the client usable.
      await expect(client.getLedgerEnd({})).resolves.toEqual(expect.objectContaining({ offset: expect.any(Number) }));
    });
  });

  describe('interface views on active-contract reads', () => {
    let holding: HoldingCreate;

    beforeAll(async () => {
      await ensureValidatorUserOnboarded();
      holding = await findOrTapHolding();
    }, VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS);

    // Reading at the offset that created the Holding keeps it in the snapshot even if the wallet archives it later.
    function holdingSnapshotParams(includeInterfaceView: boolean): StreamActiveContractsParams {
      return {
        parties: [holding.party],
        interfaceIds: [TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID],
        includeInterfaceView,
        includeCreatedEventBlob: true,
        activeAtOffset: holding.offset,
      };
    }

    async function streamHoldingSnapshot(includeInterfaceView: boolean): Promise<JsGetActiveContractsResponseItem[]> {
      const items: JsGetActiveContractsResponseItem[] = [];
      for await (const item of getClient().streamActiveContracts(holdingSnapshotParams(includeInterfaceView))) {
        items.push(item);
      }
      return items;
    }

    test('streamActiveContracts with a Holding interface filter yields the view and the created-event blob', async () => {
      const event = activeCreatedEvent(await streamHoldingSnapshot(true), holding.contractId);

      expectHoldingView(event, holding.party);
      expectCreatedEventBlob(event);
    });

    test('getActiveContracts with a Holding interface filter returns the view and the created-event blob', async () => {
      const snapshot = await getClient().getActiveContracts(holdingSnapshotParams(true));
      const event = activeCreatedEvent(snapshot, holding.contractId);

      expectHoldingView(event, holding.party);
      expectCreatedEventBlob(event);
    });

    test('an interface filter without views returns the Holding with no interface view', async () => {
      const event = activeCreatedEvent(await streamHoldingSnapshot(false), holding.contractId);

      expect(event.interfaceViews).toEqual([]);
      expectCreatedEventBlob(event);
    });
  });
});
