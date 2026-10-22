/**
 * LedgerJsonApiClient integration tests: Updates/Transaction Queries
 *
 * Tests for retrieving transactions and updates from the ledger.
 */

import {
  CantonRuntime,
  LedgerPartyIdSchema,
  TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID,
  ValidatorApiClient,
  buildUpdateFormat,
  type LedgerJsonApiClient,
} from '../../../../src';
import { getClient } from './setup';

const WALLET_APP_INSTALL_TEMPLATE_SUFFIX = 'Splice.Wallet.Install:WalletAppInstall';
const WALLET_APP_INSTALL_TEMPLATE_ID = `#splice-wallet:${WALLET_APP_INSTALL_TEMPLATE_SUFFIX}`;

interface WalletAppInstallCreate {
  readonly party: string;
  readonly contractId: string;
  readonly offset: number;
}

/** Finds the validator party's WalletAppInstall in the active contract set and the offset that created it. */
async function findWalletAppInstallCreate(): Promise<WalletAppInstallCreate> {
  const runtime = new CantonRuntime({ network: 'localnet', provider: 'app-provider' });
  const validatorInfo = await new ValidatorApiClient(runtime).getValidatorUserInfo();
  const party = LedgerPartyIdSchema.parse(validatorInfo.party_id);
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

    test('a bounded subscribeToUpdates with an interface filter and views resolves', async () => {
      const client = getClient();

      await expect(
        client.subscribeToUpdates({
          parties: [created.party],
          beginExclusive: created.offset - 1,
          endInclusive: created.offset,
          interfaceIds: [TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID],
          includeInterfaceView: true,
        })
      ).resolves.toBeUndefined();
    });
  });
});
