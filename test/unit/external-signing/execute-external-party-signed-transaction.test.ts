import { buildExternalPartyId, fingerprintEd25519PublicKey } from '@fairmint/canton-protocol/party';
import { generateKeyPairSync, sign } from 'node:crypto';
import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { ValidationError } from '../../../src/core/errors';
import { executeExternalPartySignedTransaction } from '../../../src/utils/external-signing/execute-external-party-signed-transaction';
import { expectSignatureRefused, REFUSED_SIGNATURES } from './fixtures/hash-signatures';

const PREPARED_HASH_HEX = 'ef'.repeat(32);

const createParty = (): {
  readonly publicKeyBase64: string;
  readonly publicKeyFingerprint: string;
  readonly partyId: string;
  readonly signHex: (hex: string) => string;
} => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyBase64 = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }))
    .subarray(-32)
    .toString('base64');
  const publicKeyFingerprint = fingerprintEd25519PublicKey(publicKeyBase64);
  return {
    publicKeyBase64,
    publicKeyFingerprint,
    partyId: buildExternalPartyId('signed-tx-test', publicKeyFingerprint),
    signHex: (hex) => sign(null, Buffer.from(hex, 'hex'), privateKey).toString('base64'),
  };
};

const createLedgerClient = (): jest.Mocked<LedgerJsonApiClient> =>
  ({
    interactiveSubmissionExecuteAndWait: jest.fn().mockResolvedValue({ updateId: 'update-1', completionOffset: 7 }),
  }) as unknown as jest.Mocked<LedgerJsonApiClient>;

describe('executeExternalPartySignedTransaction signature check', () => {
  it('executes a transaction whose hash signature verifies', async () => {
    const party = createParty();
    const ledgerClient = createLedgerClient();

    const result = await executeExternalPartySignedTransaction({
      ledgerClient,
      userId: 'provider-user',
      partyId: party.partyId,
      publicKeyBase64: party.publicKeyBase64,
      preparedTransaction: 'prepared-transaction',
      preparedTransactionHashHex: PREPARED_HASH_HEX,
      signatureBase64: party.signHex(PREPARED_HASH_HEX),
      submissionId: 'submission-1',
    });

    expect(result.updateId).toBe('update-1');
    expect(ledgerClient.interactiveSubmissionExecuteAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        partySignatures: {
          signatures: [
            {
              party: party.partyId,
              signatures: [
                expect.objectContaining({
                  signature: party.signHex(PREPARED_HASH_HEX),
                  signedBy: party.publicKeyFingerprint,
                }) as object,
              ],
            },
          ],
        },
      })
    );
  });

  it.each(REFUSED_SIGNATURES)('refuses a signature $name without executing', async (refusal) => {
    const party = createParty();
    const ledgerClient = createLedgerClient();

    await expectSignatureRefused(
      executeExternalPartySignedTransaction({
        ledgerClient,
        userId: 'provider-user',
        partyId: party.partyId,
        publicKeyBase64: party.publicKeyBase64,
        preparedTransaction: 'prepared-transaction',
        preparedTransactionHashHex: PREPARED_HASH_HEX,
        signatureBase64: refusal.make({
          valid: party.signHex(PREPARED_HASH_HEX),
          otherKey: createParty().signHex(PREPARED_HASH_HEX),
        }),
      }),
      refusal
    );
    expect(ledgerClient.interactiveSubmissionExecuteAndWait).not.toHaveBeenCalled();
  });

  it('refuses a hash that is not a prepared-transaction or Canton hash without executing', async () => {
    const party = createParty();
    const ledgerClient = createLedgerClient();
    const shortHashHex = 'ef'.repeat(16);

    await expect(
      executeExternalPartySignedTransaction({
        ledgerClient,
        userId: 'provider-user',
        partyId: party.partyId,
        publicKeyBase64: party.publicKeyBase64,
        preparedTransaction: 'prepared-transaction',
        preparedTransactionHashHex: shortHashHex,
        signatureBase64: party.signHex(shortHashHex),
      })
    ).rejects.toThrow(ValidationError);
    expect(ledgerClient.interactiveSubmissionExecuteAndWait).not.toHaveBeenCalled();
  });
});
