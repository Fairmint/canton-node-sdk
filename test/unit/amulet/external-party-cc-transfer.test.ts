import type { ValidatorApiClient } from '../../../src/clients/validator-api';
import { ApiError } from '../../../src/core/errors';
import {
  prepareExternalPartyCcTransfer,
  submitExternalPartyCcTransfer,
} from '../../../src/utils/amulet/external-party-cc-transfer';

const createMockValidatorClient = (): jest.Mocked<ValidatorApiClient> =>
  ({
    lookupTransferCommandCounterByParty: jest.fn().mockResolvedValue({
      transfer_command_counter: {
        contract: {
          payload: { nextNonce: '7' },
        },
      },
    }),
    prepareTransferPreapprovalSend: jest.fn().mockResolvedValue({
      transaction: 'prepared-transaction-base64',
      tx_hash: 'abc123',
      transfer_command_contract_id_prefix: 'transfer-command-prefix',
    }),
    submitTransferPreapprovalSend: jest.fn().mockResolvedValue({
      update_id: 'update-123',
    }),
  }) as unknown as jest.Mocked<ValidatorApiClient>;

describe('external party CC transfer helpers', () => {
  let validatorClient: jest.Mocked<ValidatorApiClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    validatorClient = createMockValidatorClient();
  });

  it('prepares a CC transfer using the sender transfer-command counter as nonce', async (): Promise<void> => {
    const result = await prepareExternalPartyCcTransfer(validatorClient, {
      senderPartyId: 'sender::fingerprint',
      receiverPartyId: 'receiver::fingerprint',
      amount: '12.5',
      description: 'invoice payment',
      expiresAt: '2026-01-01T00:00:00.000Z',
    });

    expect(validatorClient.lookupTransferCommandCounterByParty).toHaveBeenCalledWith({
      party: 'sender::fingerprint',
    });
    expect(validatorClient.prepareTransferPreapprovalSend).toHaveBeenCalledWith({
      sender_party_id: 'sender::fingerprint',
      receiver_party_id: 'receiver::fingerprint',
      amount: 12.5,
      expires_at: '2026-01-01T00:00:00.000Z',
      nonce: 7,
      verbose_hashing: false,
      description: 'invoice payment',
    });
    expect(result).toMatchObject({
      transaction: 'prepared-transaction-base64',
      transactionHashHex: 'abc123',
      transferCommandContractIdPrefix: 'transfer-command-prefix',
      nonce: 7,
      expiresAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('uses nonce 0 when the sender has no transfer-command counter yet', async (): Promise<void> => {
    validatorClient.lookupTransferCommandCounterByParty.mockRejectedValueOnce(new ApiError('not found', 404));

    await prepareExternalPartyCcTransfer(validatorClient, {
      senderPartyId: 'sender::fingerprint',
      receiverPartyId: 'receiver::fingerprint',
      amount: 1,
      expiresAt: '2026-01-01T00:00:00.000Z',
    });

    expect(validatorClient.prepareTransferPreapprovalSend).toHaveBeenCalledWith(expect.objectContaining({ nonce: 0 }));
  });

  it('accepts a numeric nextNonce payload', async (): Promise<void> => {
    validatorClient.lookupTransferCommandCounterByParty.mockResolvedValueOnce({
      transfer_command_counter: {
        contract: {
          payload: { nextNonce: 8 },
        },
      },
    } as never);

    await prepareExternalPartyCcTransfer(validatorClient, {
      senderPartyId: 'sender::fingerprint',
      receiverPartyId: 'receiver::fingerprint',
      amount: 1,
      expiresAt: '2026-01-01T00:00:00.000Z',
    });

    expect(validatorClient.prepareTransferPreapprovalSend).toHaveBeenCalledWith(expect.objectContaining({ nonce: 8 }));
  });

  it('rejects a malformed transfer-command counter payload', async (): Promise<void> => {
    validatorClient.lookupTransferCommandCounterByParty.mockResolvedValueOnce({
      transfer_command_counter: {
        contract: {
          payload: {},
        },
      },
    } as never);

    await expect(
      prepareExternalPartyCcTransfer(validatorClient, {
        senderPartyId: 'sender::fingerprint',
        receiverPartyId: 'receiver::fingerprint',
        amount: 1,
        expiresAt: '2026-01-01T00:00:00.000Z',
      })
    ).rejects.toThrow('Transfer command counter payload must include nextNonce as a non-negative integer');

    expect(validatorClient.prepareTransferPreapprovalSend).not.toHaveBeenCalled();
  });

  it('rejects a malformed transfer-command counter envelope with a ValidationError', async (): Promise<void> => {
    validatorClient.lookupTransferCommandCounterByParty.mockResolvedValueOnce({} as never);

    await expect(
      prepareExternalPartyCcTransfer(validatorClient, {
        senderPartyId: 'sender::fingerprint',
        receiverPartyId: 'receiver::fingerprint',
        amount: 1,
        expiresAt: '2026-01-01T00:00:00.000Z',
      })
    ).rejects.toThrow('Transfer command counter payload must include nextNonce as a non-negative integer');

    expect(validatorClient.prepareTransferPreapprovalSend).not.toHaveBeenCalled();
  });

  it('submits a signed CC transfer through the validator endpoint', async (): Promise<void> => {
    const result = await submitExternalPartyCcTransfer(validatorClient, {
      senderPartyId: 'sender::fingerprint',
      transaction: 'prepared-transaction-base64',
      transactionHashSignatureHex: 'deadbeef',
      publicKeyHex: 'abcdef',
    });

    expect(validatorClient.submitTransferPreapprovalSend).toHaveBeenCalledWith({
      submission: {
        party_id: 'sender::fingerprint',
        transaction: 'prepared-transaction-base64',
        signed_tx_hash: 'deadbeef',
        public_key: 'abcdef',
      },
    });
    expect(result.updateId).toBe('update-123');
  });

  it('rejects invalid amounts before calling the validator', async (): Promise<void> => {
    await expect(
      prepareExternalPartyCcTransfer(validatorClient, {
        senderPartyId: 'sender::fingerprint',
        receiverPartyId: 'receiver::fingerprint',
        amount: 0,
      })
    ).rejects.toThrow('CC transfer amount must be a positive number');

    expect(validatorClient.prepareTransferPreapprovalSend).not.toHaveBeenCalled();
  });

  it('rejects invalid sender party IDs before looking up the nonce', async (): Promise<void> => {
    await expect(
      prepareExternalPartyCcTransfer(validatorClient, {
        senderPartyId: '   ',
        receiverPartyId: 'receiver::fingerprint',
        amount: 1,
      })
    ).rejects.toThrow('senderPartyId is required');

    expect(validatorClient.lookupTransferCommandCounterByParty).not.toHaveBeenCalled();
    expect(validatorClient.prepareTransferPreapprovalSend).not.toHaveBeenCalled();
  });

  it('rejects party IDs with leading or trailing whitespace', async (): Promise<void> => {
    await expect(
      submitExternalPartyCcTransfer(validatorClient, {
        senderPartyId: ' sender::fingerprint ',
        transaction: 'prepared-transaction-base64',
        transactionHashSignatureHex: 'deadbeef',
        publicKeyHex: 'abcdef',
      })
    ).rejects.toThrow('senderPartyId must not include leading or trailing whitespace');

    expect(validatorClient.submitTransferPreapprovalSend).not.toHaveBeenCalled();
  });

  it('rejects odd-length hex strings before calling the validator', async (): Promise<void> => {
    await expect(
      submitExternalPartyCcTransfer(validatorClient, {
        senderPartyId: 'sender::fingerprint',
        transaction: 'prepared-transaction-base64',
        transactionHashSignatureHex: 'abc',
        publicKeyHex: 'abcdef',
      })
    ).rejects.toThrow('transactionHashSignatureHex must be hex-encoded');

    await expect(
      submitExternalPartyCcTransfer(validatorClient, {
        senderPartyId: 'sender::fingerprint',
        transaction: 'prepared-transaction-base64',
        transactionHashSignatureHex: 'deadbeef',
        publicKeyHex: 'abc',
      })
    ).rejects.toThrow('publicKeyHex must be hex-encoded');

    expect(validatorClient.submitTransferPreapprovalSend).not.toHaveBeenCalled();
  });
});
