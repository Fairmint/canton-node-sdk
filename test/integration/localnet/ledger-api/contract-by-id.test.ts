/** End-to-end validation for the Ledger JSON API contract-by-id endpoint and wire format. */

import { CantonRuntime, ValidatorApiClient } from '../../../../src';
import { buildIntegrationTestClientConfig } from '../../../utils/testConfig';
import { getClient, resolveWalletAppInstallContext } from './setup';

const WALLET_APP_INSTALL_TEMPLATE_SUFFIX = 'Splice.Wallet.Install:WalletAppInstall';

function mutateContractId(contractId: string): string {
  const finalCharacter = contractId[contractId.length - 1];
  if (finalCharacter === undefined) {
    throw new Error('Cannot mutate an empty contract ID');
  }
  return `${contractId.slice(0, -1)}${finalCharacter === '0' ? '1' : '0'}`;
}

describe('LedgerJsonApiClient / Contract by ID', () => {
  test('returns a seeded WalletAppInstall through the exact endpoint and response format', async () => {
    const client = getClient();
    const validatorClient = new ValidatorApiClient(new CantonRuntime(buildIntegrationTestClientConfig()));
    const validatorInfo = await validatorClient.getValidatorUserInfo();
    const partyId = validatorInfo.party_id;
    if (!partyId) {
      throw new Error('getValidatorUserInfo returned empty party_id');
    }
    client.setPartyId(partyId);

    const { contractId } = await resolveWalletAppInstallContext(client, partyId);
    const response = await client.getContractById({
      contractId,
      queryingParties: [partyId],
    });

    expect(Object.keys(response)).toEqual(['createdEvent']);
    expect(response.createdEvent).toEqual(
      expect.objectContaining({
        offset: expect.any(Number) as number,
        nodeId: expect.any(Number) as number,
        contractId,
        templateId: expect.stringContaining(WALLET_APP_INSTALL_TEMPLATE_SUFFIX) as string,
        contractKeyHash: '',
        createArgument: expect.objectContaining({ validatorParty: partyId }) as Record<string, unknown>,
        createdEventBlob: expect.any(String) as string,
        interfaceViews: [],
        witnessParties: [partyId],
        signatories: expect.arrayContaining([partyId]) as string[],
        observers: [],
        createdAt: expect.any(String) as string,
        packageName: 'splice-wallet',
        acsDelta: false,
      })
    );
    expect(Number.isSafeInteger(response.createdEvent.offset) && response.createdEvent.offset > 0).toBe(true);
    expect(Number.isInteger(response.createdEvent.nodeId) && response.createdEvent.nodeId >= 0).toBe(true);
    expect(response.createdEvent).not.toHaveProperty('contractKey');
    expect(response.createdEvent.createdEventBlob).not.toHaveLength(0);
    expect(Buffer.from(response.createdEvent.createdEventBlob ?? '', 'base64').toString('base64')).toBe(
      response.createdEvent.createdEventBlob
    );
    expect(Number.isNaN(Date.parse(response.createdEvent.createdAt))).toBe(false);
    expect(response.createdEvent.representativePackageId).toBe(response.createdEvent.templateId.split(':')[0]);
  }, 120_000);

  test('returns HTTP 404 for a syntactically valid but unknown contract ID', async () => {
    const client = getClient();
    const validatorClient = new ValidatorApiClient(new CantonRuntime(buildIntegrationTestClientConfig()));
    const validatorInfo = await validatorClient.getValidatorUserInfo();
    const partyId = validatorInfo.party_id;
    if (!partyId) {
      throw new Error('getValidatorUserInfo returned empty party_id');
    }
    client.setPartyId(partyId);

    const { contractId } = await resolveWalletAppInstallContext(client, partyId);

    await expect(
      client.getContractById({
        contractId: mutateContractId(contractId),
        queryingParties: [partyId],
      })
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
    });
  }, 120_000);
});
