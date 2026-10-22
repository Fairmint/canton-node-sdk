/** LedgerJsonApiClient integration tests: State Queries */

import { type JsGetActiveContractsResponseItem } from '../../../../src';
import { getClient, resolveValidatorPartyId } from './setup';

const WALLET_APP_INSTALL_TEMPLATE_ID = '#splice-wallet:Splice.Wallet.Install:WalletAppInstall';

function activeContractIds(item: JsGetActiveContractsResponseItem): string[] {
  return 'JsActiveContract' in item.contractEntry ? [item.contractEntry.JsActiveContract.createdEvent.contractId] : [];
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
      const { offset: activeAtOffset } = await client.getLedgerEnd({});
      if (activeAtOffset === undefined) {
        throw new Error('Ledger end response did not include an offset');
      }
      const params = { parties: [party], templateIds: [WALLET_APP_INSTALL_TEMPLATE_ID], activeAtOffset };

      const collected = (await client.getActiveContracts(params)).flatMap(activeContractIds);
      const streamed: string[] = [];
      for await (const item of client.streamActiveContracts(params)) {
        streamed.push(...activeContractIds(item));
      }

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
});
