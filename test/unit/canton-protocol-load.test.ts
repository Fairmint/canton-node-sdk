/**
 * `@fairmint/canton-protocol` ships ESM only. Node loads it into this CommonJS package through require(esm); Jest loads
 * it through the `.js` transform in `jest.config.js`. These checks prove every entry the SDK uses loads and works under
 * Jest, against real vectors.
 */
import { createHash, generateKeyPairSync, sign } from 'node:crypto';

import {
  CantonProtocolError,
  fingerprintEd25519PublicKey,
  isCantonProtocolError,
  parsePartyId,
} from '@fairmint/canton-protocol/party';
import { verifyCantonHashSignature } from '@fairmint/canton-protocol/signature';
import { computeTopologyMultiHash, verifyPartyOnboardingTopology } from '@fairmint/canton-protocol/topology';
import { verifyPreparedTransaction } from '@fairmint/canton-protocol/transaction';

import {
  GENERATED_TOPOLOGY,
  GENERATED_TOPOLOGY_PARTICIPANT_UID,
  GENERATED_TOPOLOGY_PARTY_ID,
  GENERATED_TOPOLOGY_PUBLIC_KEY,
} from './external-signing/fixtures/topology-vectors';

const hex = (base64: string): string => Buffer.from(base64, 'base64').toString('hex');

/** Resolves the error `promise` rejects with, or fails the test when it resolves. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('@fairmint/canton-protocol under Jest', () => {
  it('/party: fingerprints a real key and parses its party', () => {
    const parsed = parsePartyId(GENERATED_TOPOLOGY_PARTY_ID);
    expect(parsed).not.toBeNull();
    expect(fingerprintEd25519PublicKey(GENERATED_TOPOLOGY_PUBLIC_KEY)).toBe(parsed?.namespace);
  });

  it.each(['v31', 'v30'] as const)('/topology: verifies a real Canton 3.7.2 onboarding topology (%s)', (version) => {
    const { topologyTransactions, multiHash } = GENERATED_TOPOLOGY[version];
    const verified = verifyPartyOnboardingTopology({
      transactions: topologyTransactions,
      multiHash,
      expected: {
        partyId: GENERATED_TOPOLOGY_PARTY_ID,
        publicKey: GENERATED_TOPOLOGY_PUBLIC_KEY,
        threshold: 1,
        participants: [{ participantUid: GENERATED_TOPOLOGY_PARTICIPANT_UID, permission: 'CONFIRMATION' }],
        keyUsages: ['NAMESPACE', 'PROTOCOL', 'PROOF_OF_OWNERSHIP'],
      },
    });
    expect(verified.multiHash).toBe(hex(multiHash));
    expect(computeTopologyMultiHash(topologyTransactions)).toBe(hex(multiHash));
  });

  it('/topology: refuses an expectation the topology does not state', () => {
    const { topologyTransactions, multiHash } = GENERATED_TOPOLOGY.v31;
    let refusal: unknown;
    try {
      verifyPartyOnboardingTopology({
        transactions: topologyTransactions,
        multiHash,
        expected: {
          partyId: GENERATED_TOPOLOGY_PARTY_ID,
          publicKey: GENERATED_TOPOLOGY_PUBLIC_KEY,
          threshold: 1,
          participants: [{ participantUid: GENERATED_TOPOLOGY_PARTICIPANT_UID, permission: 'OBSERVATION' }],
          keyUsages: ['NAMESPACE', 'PROTOCOL', 'PROOF_OF_OWNERSHIP'],
        },
      });
    } catch (error: unknown) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(CantonProtocolError);
    expect(isCantonProtocolError(refusal) && refusal.code).toBe('UNEXPECTED');
  });

  it('/signature: resolves true for a good signature and false for a bad one', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const der = publicKey.export({ format: 'der', type: 'spki' });
    const hash = Buffer.concat([Buffer.from('1220', 'hex'), createHash('sha256').update('load test').digest()]);
    const signature = sign(null, hash, privateKey);

    await expect(verifyCantonHashSignature({ hash, signature, publicKey: der })).resolves.toBe(true);
    const tampered = Buffer.from(signature);
    tampered[0] = (tampered[0] ?? 0) ^ 1;
    await expect(verifyCantonHashSignature({ hash, signature: tampered, publicKey: der })).resolves.toBe(false);
  });

  it('/transaction: refuses bytes that are not a prepared transaction, with the shared error class', async () => {
    const refusal = await rejection(
      verifyPreparedTransaction({
        preparedTransaction: Buffer.from('not a prepared transaction').toString('base64'),
        hashingScheme: 'HASHING_SCHEME_VERSION_V2',
        hash: createHash('sha256').update('x').digest('hex'),
        expected: { actAs: [GENERATED_TOPOLOGY_PARTY_ID], commandId: 'command-1', synchronizerId: 'sync::1220ab' },
      })
    );
    // One module instance across entries: /transaction's error is /party's class.
    expect(refusal).toBeInstanceOf(CantonProtocolError);
    expect(isCantonProtocolError(refusal) && refusal.code).toBe('UNDECODABLE');
  });
});
