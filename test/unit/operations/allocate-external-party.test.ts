import { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { CantonRuntime, type ClientConfig } from '../../../src/core';
import { ValidationError } from '../../../src/core/errors';

const ENDPOINT = 'https://ledger.example.test/v2/parties/external/allocate';

const config: ClientConfig = {
  network: 'localnet',
  authUrl: 'https://auth.example',
  apis: {
    LEDGER_JSON_API: {
      apiUrl: 'https://ledger.example.test',
      auth: { grantType: 'client_credentials', clientId: 'ledger-client', clientSecret: 'secret' },
    },
  },
};

const BASE_PARAMS = {
  synchronizer: 'global-domain::sync',
  identityProviderId: '',
  onboardingTransactions: [{ transaction: 'topology-tx' }],
};

function createClient(): { client: LedgerJsonApiClient; post: jest.SpyInstance } {
  const client = new LedgerJsonApiClient(new CantonRuntime(config));
  const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({ partyId: 'party::1220aa' });
  return { client, post };
}

describe('LedgerJsonApiClient allocateExternalParty userId', () => {
  it('sends no userId when it is omitted', async () => {
    const { client, post } = createClient();

    await client.allocateExternalParty(BASE_PARAMS);

    expect(post).toHaveBeenCalledWith(ENDPOINT, BASE_PARAMS, expect.anything());
  });

  it('sends the trimmed userId so that user gets CanActAs on the new party', async () => {
    const { client, post } = createClient();

    await client.allocateExternalParty({ ...BASE_PARAMS, userId: '  wallet-server  ' });

    expect(post).toHaveBeenCalledWith(ENDPOINT, { ...BASE_PARAMS, userId: 'wallet-server' }, expect.anything());
  });

  it.each([
    ['empty', '', 'userId must not be empty'],
    ['whitespace', '   ', 'userId must not be empty'],
    ['too long', 'u'.repeat(513), 'userId must be at most 512 characters'],
    ['carriage return', 'user\rname', 'userId must not contain line breaks'],
    ['line feed', 'user\nname', 'userId must not contain line breaks'],
  ])('rejects a %s userId before sending anything', async (_label, userId, message) => {
    const { client, post } = createClient();

    const result = client.allocateExternalParty({ ...BASE_PARAMS, userId });

    await expect(result).rejects.toBeInstanceOf(ValidationError);
    await expect(result).rejects.toThrow(message);
    expect(post).not.toHaveBeenCalled();
  });

  it('accepts a userId of exactly 512 characters', async () => {
    const { client, post } = createClient();
    const userId = 'u'.repeat(512);

    await client.allocateExternalParty({ ...BASE_PARAMS, userId });

    expect(post).toHaveBeenCalledWith(ENDPOINT, { ...BASE_PARAMS, userId }, expect.anything());
  });
});
