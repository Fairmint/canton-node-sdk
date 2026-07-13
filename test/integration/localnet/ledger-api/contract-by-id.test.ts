/** End-to-end validation for the Ledger JSON API contract-by-id endpoint and wire format. */

import {
  CantonRuntime,
  LedgerContractIdSchema,
  LedgerJsonApiClient,
  LedgerPartyIdSchema,
  ValidatorApiClient,
  type ContractId,
  type PartyId,
} from '../../../../src';
import { getClient, resolveWalletAppInstallContext } from './setup';

const WALLET_APP_INSTALL_TEMPLATE_SUFFIX = 'Splice.Wallet.Install:WalletAppInstall';

interface ProviderContext {
  client: LedgerJsonApiClient;
  partyId: PartyId;
}

interface AppProviderContractContext extends ProviderContext {
  contractId: ContractId;
}

async function getProviderContext(provider: 'app-provider' | 'app-user'): Promise<ProviderContext> {
  const runtime = new CantonRuntime({ network: 'localnet', provider });
  const validatorInfo = await new ValidatorApiClient(runtime).getValidatorUserInfo();
  const partyId = LedgerPartyIdSchema.parse(validatorInfo.party_id);
  const client = provider === 'app-provider' ? getClient() : new LedgerJsonApiClient(runtime);
  client.setPartyId(partyId);
  return { client, partyId };
}

async function getAppProviderContractContext(): Promise<AppProviderContractContext> {
  const context = await getProviderContext('app-provider');
  const { contractId } = await resolveWalletAppInstallContext(context.client, context.partyId);
  return { ...context, contractId: LedgerContractIdSchema.parse(contractId) };
}

async function hasReadAsAnyParty(client: LedgerJsonApiClient): Promise<boolean> {
  const authenticated = await client.getAuthenticatedUser({});
  const rights = await client.listUserRights({ userId: authenticated.user.id });
  return rights.rights?.some((right) => right.kind !== undefined && 'CanReadAsAnyParty' in right.kind) ?? false;
}

async function withReadAsAnyParty<T>(client: LedgerJsonApiClient, callback: () => Promise<T>): Promise<T> {
  const authenticated = await client.getAuthenticatedUser({});
  const right = { kind: { CanReadAsAnyParty: { value: {} } } } as const;
  const alreadyGranted = await hasReadAsAnyParty(client);
  if (!alreadyGranted) {
    await client.grantUserRights({ userId: authenticated.user.id, rights: [right] });
  }

  try {
    expect(await hasReadAsAnyParty(client)).toBe(true);
    return await callback();
  } finally {
    if (!alreadyGranted) {
      await client.revokeUserRights({ userId: authenticated.user.id, rights: [right] });
    }
  }
}

function mutateContractId(contractId: ContractId): ContractId {
  const finalCharacter = contractId[contractId.length - 1];
  if (finalCharacter === undefined) {
    throw new Error('Cannot mutate an empty contract ID');
  }
  return LedgerContractIdSchema.parse(`${contractId.slice(0, -1)}${finalCharacter === '0' ? '1' : '0'}`);
}

describe('LedgerJsonApiClient / Contract by ID', () => {
  test('returns a seeded WalletAppInstall through the exact endpoint and response format', async () => {
    const { client, contractId, partyId } = await getAppProviderContractContext();
    const response = await client.getContractById({
      contractId,
      queryingParties: [partyId],
    });

    expect(Object.keys(response)).toEqual(['createdEvent']);
    expect(response.createdEvent).toEqual(
      expect.objectContaining({
        contractId,
        templateId: expect.stringContaining(WALLET_APP_INSTALL_TEMPLATE_SUFFIX) as string,
        contractKeyHash: '',
        createArgument: {
          dsoParty: expect.any(String) as string,
          validatorParty: partyId,
          endUserName: expect.any(String) as string,
          endUserParty: expect.any(String) as string,
        },
        witnessParties: [partyId],
        signatories: expect.arrayContaining([partyId]) as string[],
        observers: [],
        createdAt: expect.any(String) as string,
        packageName: 'splice-wallet',
      })
    );
    expect(response.createdEvent).not.toHaveProperty('contractKey');
    expect(response.createdEvent).not.toHaveProperty('offset');
    expect(response.createdEvent).not.toHaveProperty('nodeId');
    expect(response.createdEvent).not.toHaveProperty('createdEventBlob');
    expect(response.createdEvent).not.toHaveProperty('interfaceViews');
    expect(response.createdEvent).not.toHaveProperty('acsDelta');
    expect(Number.isNaN(Date.parse(response.createdEvent.createdAt))).toBe(false);
    expect(response.createdEvent.representativePackageId).toBe(response.createdEvent.templateId.split(':')[0]);
  }, 120_000);

  test('returns HTTP 404 for a syntactically valid but unknown contract ID', async () => {
    const { client, contractId, partyId } = await getAppProviderContractContext();

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

  test('applies ReadAsAnyParty success equally to omitted and empty querying parties', async () => {
    const { client, contractId } = await getAppProviderContractContext();
    await withReadAsAnyParty(client, async () => {
      const responses = await Promise.all([
        client.getContractById({ contractId }),
        client.getContractById({ contractId, queryingParties: [] }),
      ]);

      expect(responses.map((response) => response.createdEvent.contractId)).toEqual([contractId, contractId]);
    });
  }, 120_000);

  test('applies ReadAsAnyParty denial equally to omitted and empty querying parties', async () => {
    const { contractId } = await getAppProviderContractContext();
    const { client } = await getProviderContext('app-user');
    expect(await hasReadAsAnyParty(client)).toBe(false);

    await Promise.all(
      [client.getContractById({ contractId }), client.getContractById({ contractId, queryingParties: [] })].map(
        async (lookup) => {
          await expect(lookup).rejects.toMatchObject({ name: 'ApiError', status: 403 });
        }
      )
    );
  }, 120_000);

  test('does not disclose a known same-participant contract to a readable non-stakeholder party', async () => {
    const { client, contractId, partyId: stakeholderParty } = await getAppProviderContractContext();
    const { partyId: nonStakeholderParty } = await getProviderContext('app-user');
    expect(nonStakeholderParty).not.toBe(stakeholderParty);

    await withReadAsAnyParty(client, async () => {
      await expect(
        client.getContractById({
          contractId,
          queryingParties: [nonStakeholderParty],
        })
      ).rejects.toMatchObject({ name: 'ApiError', status: 404 });
    });
  }, 120_000);
});
