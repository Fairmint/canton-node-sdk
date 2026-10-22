/**
 * LedgerJsonApiClient integration tests: Updates/Transaction Queries
 *
 * Tests for retrieving transactions and updates from the ledger.
 */

import { randomUUID } from 'node:crypto';

import {
  TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID,
  TransactionShape,
  buildUpdateFormat,
  type LedgerJsonApiClient,
} from '../../../../src';
import { retry } from '@fairmint/canton-dev-tools/testing';
import {
  ensureValidatorUserOnboarded,
  getClient as getValidatorClient,
  VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS,
} from '../validator-api/setup';
import { getClient, resolveValidatorPartyId } from './setup';

const WALLET_APP_INSTALL_TEMPLATE_SUFFIX = 'Splice.Wallet.Install:WalletAppInstall';
const WALLET_APP_INSTALL_TEMPLATE_ID = `#splice-wallet:${WALLET_APP_INSTALL_TEMPLATE_SUFFIX}`;

interface WalletAppInstallCreate {
  readonly party: string;
  readonly contractId: string;
  readonly offset: number;
}

/** Finds the validator party's WalletAppInstall in the active contract set and the offset that created it. */
async function findWalletAppInstallCreate(): Promise<WalletAppInstallCreate> {
  const party = await resolveValidatorPartyId();
  const client = getClient();
  client.setPartyId(party);

  const snapshot = await client.getActiveContracts({ parties: [party], templateIds: [WALLET_APP_INSTALL_TEMPLATE_ID] });
  for (const item of snapshot) {
    const entry = item.contractEntry;
    if ('JsActiveContract' in entry) {
      const { contractId, offset, templateId } = entry.JsActiveContract.createdEvent;
      if (templateId.includes(WALLET_APP_INSTALL_TEMPLATE_SUFFIX)) {
        return { party, contractId, offset };
      }
    }
  }
  throw new Error(`The validator party ${party} has no active WalletAppInstall`);
}

type TransactionUpdate = Extract<
  NonNullable<Awaited<ReturnType<LedgerJsonApiClient['getUpdateById']>>['update']>,
  { Transaction: unknown }
>;

function createdContractIds(update: TransactionUpdate): string[] {
  return update.Transaction.value.events.flatMap((event) =>
    'CreatedEvent' in event ? [event.CreatedEvent.contractId] : []
  );
}

const HOLDING_INTERFACE_SUFFIX = ':Splice.Api.Token.HoldingV1:Holding';

interface HoldingCreate {
  readonly party: string;
  readonly contractId: string;
  readonly offset: number;
}

/** Finds one of the wallet party's HoldingV1 contracts and the offset that created it, tapping Amulet if it has none. */
async function findOrTapHolding(): Promise<HoldingCreate> {
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

interface ViewedCreatedEvent {
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

type TransactionEvent =
  | { readonly CreatedEvent: ViewedCreatedEvent }
  | { readonly ArchivedEvent: unknown }
  | { readonly ExercisedEvent: unknown };

function holdingCreatedEvent(events: readonly TransactionEvent[], contractId: string): ViewedCreatedEvent {
  const created = events.flatMap((event) =>
    'CreatedEvent' in event && event.CreatedEvent.contractId === contractId ? [event.CreatedEvent] : []
  );
  expect(created).toHaveLength(1);
  const [event] = created;
  if (!event) {
    throw new Error(`No CreatedEvent for Holding ${contractId}`);
  }
  return event;
}

function expectHoldingView(event: ViewedCreatedEvent, owner: string): void {
  const views = (event.interfaceViews ?? []).filter((view) => view.interfaceId.endsWith(HOLDING_INTERFACE_SUFFIX));
  expect(views).toHaveLength(1);
  const [view] = views;
  expect(view?.viewStatus.code).toBe(0);
  expect(view?.viewValue).toEqual(expect.objectContaining({ owner }));
}

function expectCreatedEventBlob(event: ViewedCreatedEvent): void {
  expect(event.createdEventBlob).toEqual(expect.any(String));
  expect(event.createdEventBlob).not.toHaveLength(0);
}

type SubscribeToUpdatesMessage = Parameters<
  NonNullable<Parameters<LedgerJsonApiClient['subscribeToUpdates']>[0]['onMessage']>
>[0];

describe('LedgerJsonApiClient / Updates', () => {
  let partyId: string;

  beforeAll(async () => {
    const client = getClient();
    const parties = await client.listParties({});
    const { partyDetails } = parties;
    const [firstPartyDetails] = partyDetails;
    if (firstPartyDetails) {
      partyId = firstPartyDetails.party;
    }
  });

  test('getUpdateById returns error for non-existent update', async () => {
    expect(partyId).toBeDefined();

    const client = getClient();

    await expect(
      client.getUpdateById(
        {
          updateId: 'non-existent-update-id-12345',
          readAs: [partyId],
        },
        { retry: { kind: 'none' } }
      )
    ).rejects.toThrow();
  });

  test('getLedgerEnd returns current ledger end offset', async () => {
    const client = getClient();

    const ledgerEnd = await client.getLedgerEnd({});

    expect(ledgerEnd).toBeDefined();
    expect(ledgerEnd.offset).toBeDefined();
    expect(typeof ledgerEnd.offset).toBe('number');
  });

  describe('template and interface filters', () => {
    let created: WalletAppInstallCreate;
    let updateId: string;

    beforeAll(async () => {
      created = await findWalletAppInstallCreate();
    });

    test('getUpdateByOffset with a built update format returns the filtered CreatedEvent', async () => {
      const client = getClient();

      const response = await client.getUpdateByOffset({
        offset: created.offset,
        updateFormat: buildUpdateFormat({
          parties: [created.party],
          templateIds: [WALLET_APP_INSTALL_TEMPLATE_ID],
          transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
        }),
      });

      const { update } = response;
      if (update === undefined || !('Transaction' in update)) {
        throw new Error(`Offset ${created.offset} did not resolve to a transaction`);
      }
      expect(createdContractIds(update)).toContain(created.contractId);
      ({ updateId } = update.Transaction.value);
    });

    test('getUpdateById with the same template filter returns the same update', async () => {
      expect(updateId).toBeDefined();
      const client = getClient();

      const response = await client.getUpdateById({
        updateId,
        readAs: [created.party],
        templateIds: [WALLET_APP_INSTALL_TEMPLATE_ID],
        transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
      });

      const { update } = response;
      if (update === undefined || !('Transaction' in update)) {
        throw new Error(`Update ${updateId} did not resolve to a transaction`);
      }
      expect(update.Transaction.value.updateId).toBe(updateId);
      expect(createdContractIds(update)).toContain(created.contractId);
    });
  });

  describe('interface views on update reads', () => {
    let holding: HoldingCreate;

    beforeAll(async () => {
      await ensureValidatorUserOnboarded();
      holding = await findOrTapHolding();
    }, VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS);

    async function holdingTransactionEvents(includeInterfaceView: boolean): Promise<readonly TransactionEvent[]> {
      const response = await getClient().getUpdateByOffset({
        offset: holding.offset,
        updateFormat: buildUpdateFormat({
          parties: [holding.party],
          interfaceIds: [TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID],
          includeInterfaceView,
          includeCreatedEventBlob: true,
          transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
        }),
      });
      const { update } = response;
      if (update === undefined || !('Transaction' in update)) {
        throw new Error(`Offset ${holding.offset} did not resolve to a transaction`);
      }
      return update.Transaction.value.events;
    }

    test('getUpdateByOffset with a Holding interface filter returns the view and the created-event blob', async () => {
      const event = holdingCreatedEvent(await holdingTransactionEvents(true), holding.contractId);

      expectHoldingView(event, holding.party);
      expectCreatedEventBlob(event);
    });

    test('subscribeToUpdates with a Holding interface filter delivers the view and the created-event blob', async () => {
      const messages: SubscribeToUpdatesMessage[] = [];

      await getClient().subscribeToUpdates({
        parties: [holding.party],
        beginExclusive: holding.offset - 1,
        endInclusive: holding.offset,
        interfaceIds: [TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID],
        includeInterfaceView: true,
        includeCreatedEventBlob: true,
        transactionShape: TransactionShape.TRANSACTION_SHAPE_ACS_DELTA,
        onMessage: (message) => {
          messages.push(message);
        },
      });

      const events = messages.flatMap((message) =>
        'update' in message && 'Transaction' in message.update ? message.update.Transaction.value.events : []
      );
      const event = holdingCreatedEvent(events, holding.contractId);
      expectHoldingView(event, holding.party);
      expectCreatedEventBlob(event);
    });

    test('an interface filter without views returns the Holding with no interface view', async () => {
      const event = holdingCreatedEvent(await holdingTransactionEvents(false), holding.contractId);

      expect(event.interfaceViews).toEqual([]);
      expectCreatedEventBlob(event);
    });
  });
});
