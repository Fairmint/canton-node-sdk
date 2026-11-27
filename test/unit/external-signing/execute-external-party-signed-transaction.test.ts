import { buildExternalPartyId, fingerprintEd25519PublicKey } from '@fairmint/canton-protocol/party';
import { generateKeyPairSync, sign } from 'node:crypto';
import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { ValidationError } from '../../../src/core/errors';
import { executeExternalPartySignedTransaction } from '../../../src/utils/external-signing/execute-external-party-signed-transaction';
import { expectSignatureRefused, REFUSED_SIGNATURES } from './fixtures/hash-signatures';
import { buildPreparedTransaction, type BuiltPreparedTransaction } from './fixtures/prepared-transactions';

const SYNCHRONIZER_ID = `global-domain::1220${'cd'.repeat(32)}`;

/** A prepared transaction acting as `partyId`, with its hash. */
const preparedFor = async (partyId: string, note?: string): Promise<BuiltPreparedTransaction> =>
  buildPreparedTransaction({
    partyId,
    commandId: 'command-1',
    synchronizerId: SYNCHRONIZER_ID,
    ...(note !== undefined ? { note } : {}),
  });

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
    const prepared = await preparedFor(party.partyId);

    const result = await executeExternalPartySignedTransaction({
      ledgerClient,
      userId: 'provider-user',
      partyId: party.partyId,
      publicKeyBase64: party.publicKeyBase64,
      preparedTransaction: prepared.preparedTransaction,
      preparedTransactionHashHex: prepared.hashHex,
      signatureBase64: party.signHex(prepared.hashHex),
      submissionId: 'submission-1',
    });

    expect(result.updateId).toBe('update-1');
    expect(ledgerClient.interactiveSubmissionExecuteAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        preparedTransaction: prepared.preparedTransaction,
        hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
        partySignatures: {
          signatures: [
            {
              party: party.partyId,
              signatures: [
                expect.objectContaining({
                  signature: party.signHex(prepared.hashHex),
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
    const prepared = await preparedFor(party.partyId);

    await expectSignatureRefused(
      executeExternalPartySignedTransaction({
        ledgerClient,
        userId: 'provider-user',
        partyId: party.partyId,
        publicKeyBase64: party.publicKeyBase64,
        preparedTransaction: prepared.preparedTransaction,
        preparedTransactionHashHex: prepared.hashHex,
        signatureBase64: refusal.make({
          valid: party.signHex(prepared.hashHex),
          otherKey: createParty().signHex(prepared.hashHex),
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
    const prepared = await preparedFor(party.partyId);

    await expect(
      executeExternalPartySignedTransaction({
        ledgerClient,
        userId: 'provider-user',
        partyId: party.partyId,
        publicKeyBase64: party.publicKeyBase64,
        preparedTransaction: prepared.preparedTransaction,
        preparedTransactionHashHex: shortHashHex,
        signatureBase64: party.signHex(shortHashHex),
      })
    ).rejects.toThrow(ValidationError);
    expect(ledgerClient.interactiveSubmissionExecuteAndWait).not.toHaveBeenCalled();
  });
});

describe('executeExternalPartySignedTransaction prepared-transaction check', () => {
  it("refuses a signed hash that is not the submitted transaction's, even with a valid signature, without executing", async () => {
    const party = createParty();
    const ledgerClient = createLedgerClient();
    const signed = await preparedFor(party.partyId);
    const substituted = await preparedFor(party.partyId, 'substituted');

    await expect(
      executeExternalPartySignedTransaction({
        ledgerClient,
        userId: 'provider-user',
        partyId: party.partyId,
        publicKeyBase64: party.publicKeyBase64,
        preparedTransaction: substituted.preparedTransaction,
        preparedTransactionHashHex: signed.hashHex,
        signatureBase64: party.signHex(signed.hashHex),
      })
    ).rejects.toMatchObject({
      name: 'ValidationError',
      message: 'preparedTransactionHashHex is not the hash of preparedTransaction',
    });
    expect(ledgerClient.interactiveSubmissionExecuteAndWait).not.toHaveBeenCalled();
  });

  it('refuses a transaction that acts as another party than the signer, without executing', async () => {
    const party = createParty();
    const other = createParty();
    const ledgerClient = createLedgerClient();
    const prepared = await buildPreparedTransaction({
      partyId: party.partyId,
      actAs: [party.partyId, other.partyId],
      commandId: 'command-1',
      synchronizerId: SYNCHRONIZER_ID,
    });

    await expect(
      executeExternalPartySignedTransaction({
        ledgerClient,
        userId: 'provider-user',
        partyId: party.partyId,
        publicKeyBase64: party.publicKeyBase64,
        preparedTransaction: prepared.preparedTransaction,
        preparedTransactionHashHex: prepared.hashHex,
        signatureBase64: party.signHex(prepared.hashHex),
      })
    ).rejects.toThrow('preparedTransaction does not state the expected actAs');
    expect(ledgerClient.interactiveSubmissionExecuteAndWait).not.toHaveBeenCalled();
  });

  it('verifies the hash under the scheme it executes with', async () => {
    const party = createParty();
    const ledgerClient = createLedgerClient();
    const v3 = await buildPreparedTransaction({
      partyId: party.partyId,
      commandId: 'command-1',
      synchronizerId: SYNCHRONIZER_ID,
      scheme: 'HASHING_SCHEME_VERSION_V3',
    });
    const submit = async (
      hashingSchemeVersion?: 'HASHING_SCHEME_VERSION_V3'
    ): ReturnType<typeof executeExternalPartySignedTransaction> =>
      executeExternalPartySignedTransaction({
        ledgerClient,
        userId: 'provider-user',
        partyId: party.partyId,
        publicKeyBase64: party.publicKeyBase64,
        preparedTransaction: v3.preparedTransaction,
        preparedTransactionHashHex: v3.hashHex,
        signatureBase64: party.signHex(v3.hashHex),
        ...(hashingSchemeVersion !== undefined ? { hashingSchemeVersion } : {}),
      });

    await expect(submit()).rejects.toThrow('preparedTransactionHashHex is not the hash of preparedTransaction');
    expect(ledgerClient.interactiveSubmissionExecuteAndWait).not.toHaveBeenCalled();
    await expect(submit('HASHING_SCHEME_VERSION_V3')).resolves.toMatchObject({ updateId: 'update-1' });
    expect(ledgerClient.interactiveSubmissionExecuteAndWait).toHaveBeenCalledWith(
      expect.objectContaining({ hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V3' })
    );
  });

  it('refuses bytes that are not a prepared transaction, without executing', async () => {
    const party = createParty();
    const ledgerClient = createLedgerClient();
    const hashHex = 'ef'.repeat(32);

    await expect(
      executeExternalPartySignedTransaction({
        ledgerClient,
        userId: 'provider-user',
        partyId: party.partyId,
        publicKeyBase64: party.publicKeyBase64,
        preparedTransaction: 'prepared-transaction',
        preparedTransactionHashHex: hashHex,
        signatureBase64: party.signHex(hashHex),
      })
    ).rejects.toThrow('preparedTransaction cannot be decoded and hashed');
    expect(ledgerClient.interactiveSubmissionExecuteAndWait).not.toHaveBeenCalled();
  });
});
