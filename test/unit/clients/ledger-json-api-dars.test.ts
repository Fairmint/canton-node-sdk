import { LedgerSynchronizerIdSchema } from '../../../src';
import { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { CantonRuntime, SynchronizerId, ValidationError, type ClientConfig } from '../../../src/core';

const config: ClientConfig = {
  network: 'localnet',
  authUrl: 'https://auth.example',
  apis: {
    LEDGER_JSON_API: {
      apiUrl: 'https://ledger.example.test',
      auth: {
        grantType: 'client_credentials',
        clientId: 'ledger-client',
        clientSecret: 'secret',
      },
    },
  },
};

function createClient(): LedgerJsonApiClient {
  return new LedgerJsonApiClient(new CantonRuntime(config));
}

describe('LedgerJsonApiClient DAR validation and upload', () => {
  it('validates immutable DAR bytes through the exact semantic-read endpoint and normalizes an empty response', async () => {
    const client = createClient();
    const darFile = Buffer.from('valid-dar-fixture');
    const expectedDarFile = Buffer.from(darFile);
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue('');

    const validation = client.validateDar({ darFile, synchronizerId: SynchronizerId('sync::one') });
    darFile.fill(0);

    await expect(validation).resolves.toBeUndefined();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      'https://ledger.example.test/v2/dars/validate?synchronizerId=sync%3A%3Aone',
      expectedDarFile,
      {
        contentType: 'application/octet-stream',
        includeBearerToken: true,
      },
      expect.objectContaining({ requestSemantics: 'read' })
    );
    expect(post.mock.calls[0]?.[1]).not.toBe(darFile);
  });

  it.each([
    [true, 'https://ledger.example.test/v2/dars?vetAllPackages=true&synchronizerId=sync%3A%3Aone'],
    [false, 'https://ledger.example.test/v2/dars?vetAllPackages=false&synchronizerId=sync%3A%3Aone'],
  ] as const)('uploads with the exact %s query value and strict empty-object response', async (vetAllPackages, url) => {
    const client = createClient();
    const darFile = Buffer.from('valid-dar-fixture');
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({});

    await expect(
      client.uploadDar({ darFile, vetAllPackages, synchronizerId: SynchronizerId('sync::one') })
    ).resolves.toEqual({});

    expect(post).toHaveBeenCalledWith(
      url,
      darFile,
      {
        contentType: 'application/octet-stream',
        includeBearerToken: true,
      },
      expect.objectContaining({ requestSemantics: 'mutation' })
    );
    expect(post.mock.calls[0]?.[1]).not.toBe(darFile);
  });

  it('omits optional query parameters instead of inventing wire defaults', async () => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValueOnce('').mockResolvedValueOnce({});

    await client.validateDar({ darFile: Buffer.from('dar-one') });
    await client.uploadDar({ darFile: Buffer.from('dar-two') });

    expect(post.mock.calls[0]?.[0]).toBe('https://ledger.example.test/v2/dars/validate');
    expect(post.mock.calls[1]?.[0]).toBe('https://ledger.example.test/v2/dars');
  });

  it.each([
    ['a non-empty validation response', 'unexpected response', 'validate'],
    ['a null validation response', null, 'validate'],
    ['an object validation response', {}, 'validate'],
    ['a non-empty upload response', { unexpected: true }, 'upload'],
    ['an empty-string upload response', '', 'upload'],
    ['a null upload response', null, 'upload'],
  ] as const)('rejects %s after transport without dispatching again', async (_label, response, operation) => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue(response);
    const options = { retry: { kind: 'exact-body' as const, maxAttempts: 3 } };

    const request =
      operation === 'validate'
        ? client.validateDar({ darFile: Buffer.from('valid-dar') }, options)
        : client.uploadDar({ darFile: Buffer.from('valid-dar') }, options);

    await expect(request).rejects.toBeInstanceOf(ValidationError);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it.each(['sync::one', `${'a'.repeat(185)}::${'b'.repeat(68)}`, 'identifier:segment:::namespace:segment'])(
    'accepts the Canton synchronizer ID %s',
    (synchronizerId) => {
      expect(LedgerSynchronizerIdSchema.parse(synchronizerId)).toBe(synchronizerId);
    }
  );

  it.each([
    '',
    'missing-namespace',
    '::empty-identifier',
    'empty-namespace::',
    'sync::one::extra',
    'sync::invalid@namespace',
    `${'a'.repeat(186)}::namespace`,
    `sync::${'b'.repeat(69)}`,
  ])('rejects the invalid Canton synchronizer ID %s before dispatch', async (synchronizerId) => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({});

    await expect(client.uploadDar({ darFile: Buffer.from('dar'), synchronizerId } as never)).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(post).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty DAR', { darFile: Buffer.alloc(0) }],
    ['a string body', { darFile: 'not-binary' }],
    ['a Uint8Array body', { darFile: new Uint8Array([1, 2, 3]) }],
    ['an unknown field', { darFile: Buffer.from('dar'), filePath: '/tmp/file.dar' }],
  ])('rejects %s before dispatch', async (_label, params) => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({});

    await expect(client.uploadDar(params as never)).rejects.toBeInstanceOf(ValidationError);
    expect(post).not.toHaveBeenCalled();
  });
});
