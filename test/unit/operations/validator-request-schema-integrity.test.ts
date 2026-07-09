import { CreateUser, CreateUserParamsSchema } from '../../../src/clients/validator-api/operations/v0/admin/create-user';
import { SubmitTransferPreapprovalSendParamsSchema } from '../../../src/clients/validator-api/operations/v0/admin/submit-transfer-preapproval-send';
import {
  TransferPreapprovalSend,
  TransferPreapprovalSendParamsSchema,
} from '../../../src/clients/validator-api/operations/v0/wallet/transfer-preapproval-send';
import type { BaseClient } from '../../../src/core';

function createClient(makePostRequest: jest.Mock): BaseClient {
  return {
    getApiUrl: () => 'https://validator.example',
    makePostRequest,
  } as unknown as BaseClient;
}

describe('validator request schema integrity', () => {
  it('preserves createPartyIfMissing while validating onboard-user requests', async () => {
    const request = {
      name: 'Alice',
      party_id: 'alice::namespace',
      createPartyIfMissing: true,
    };

    expect(CreateUserParamsSchema.parse(request)).toEqual(request);

    const makePostRequest = jest.fn().mockResolvedValue({ party_id: request.party_id });
    await new CreateUser(createClient(makePostRequest)).execute(request);

    expect(makePostRequest).toHaveBeenCalledWith('https://validator.example/api/validator/v0/admin/users', request, {
      contentType: 'application/json',
      includeBearerToken: true,
    });
  });

  it('keeps createPartyIfMissing optional', () => {
    expect(CreateUserParamsSchema.parse({ name: 'Alice' })).toEqual({ name: 'Alice' });
    expect(
      CreateUserParamsSchema.parse({
        name: 'Alice',
        party_id: undefined,
        createPartyIfMissing: undefined,
      })
    ).toEqual({ name: 'Alice' });
  });

  it('rejects request keys that are absent from the generated contract', () => {
    expect(() =>
      CreateUserParamsSchema.parse({
        name: 'Alice',
        createPartyIfMising: true,
      })
    ).toThrow();
  });

  it('rejects request keys that are absent from a nested generated contract', () => {
    expect(() =>
      SubmitTransferPreapprovalSendParamsSchema.parse({
        submission: {
          party_id: 'alice::namespace',
          transaction: 'prepared-transaction',
          signed_tx_hash: 'abcd',
          public_key: '1234',
          signed_transaction_hash: 'silent-typo',
        },
      })
    ).toThrow();
  });

  it('models transfer-preapproval send as a no-content response', async () => {
    const request = {
      receiver_party_id: 'bob::namespace',
      amount: '10.5',
      deduplication_id: 'payment-123',
      description: 'Invoice 123',
    };

    expect(TransferPreapprovalSendParamsSchema.parse(request)).toEqual(request);

    const makePostRequest = jest.fn().mockResolvedValue(undefined);
    await new TransferPreapprovalSend(createClient(makePostRequest)).execute(request);

    expect(makePostRequest).toHaveBeenCalledWith(
      'https://validator.example/api/validator/v0/wallet/transfer-preapproval/send',
      request,
      {
        contentType: 'application/json',
        includeBearerToken: true,
      }
    );
  });
});
