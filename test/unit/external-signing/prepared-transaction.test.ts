import { CantonProtocolError, isCantonProtocolError } from '@fairmint/canton-protocol/transaction';
import { OperationError, OperationErrorCode, ValidationError } from '../../../src/core/errors';
import {
  assertSubmittedPreparedTransaction,
  verifyParticipantPreparedTransaction,
} from '../../../src/utils/external-signing/prepared-transaction';
import {
  buildPreparedTransaction,
  CAPTURED_PARTY,
  CAPTURED_PREPARED_TRANSACTIONS,
  CAPTURED_SYNCHRONIZER,
  DISHONEST_PREPARE_ANSWERS,
  honestPrepareAnswer,
  type PrepareRequestLike,
} from './fixtures/prepared-transactions';

const PARTY = `alice::1220${'ab'.repeat(32)}`;
const SYNCHRONIZER = `global-domain::1220${'cd'.repeat(32)}`;
const REQUEST = {
  actAs: [PARTY],
  commandId: 'command-1',
  synchronizerId: SYNCHRONIZER,
} as const satisfies PrepareRequestLike;

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected a rejection');
}

describe('verifyParticipantPreparedTransaction', () => {
  it.each(CAPTURED_PREPARED_TRANSACTIONS)(
    "returns the recomputed hash of a real participant's $id transaction",
    async (vector) => {
      const verified = await verifyParticipantPreparedTransaction({
        operation: 'test prepare',
        preparedTransaction: vector.preparedTransaction,
        preparedTransactionHash: Buffer.from(vector.expected.hash, 'hex').toString('base64'),
        hashingScheme: vector.scheme,
        answeredHashingScheme: vector.scheme,
        expected: {
          actAs: [CAPTURED_PARTY],
          commandId: vector.expected.commandId,
          synchronizerId: CAPTURED_SYNCHRONIZER,
        },
      });
      expect(verified).toEqual({
        preparedTransaction: vector.preparedTransaction,
        preparedTransactionHashHex: vector.expected.hash,
        hashingSchemeVersion: vector.scheme,
      });
    }
  );

  it.each([
    ['base64url', (hex: string) => Buffer.from(hex, 'hex').toString('base64url')],
    ['uppercase hex', (hex: string) => hex.toUpperCase()],
  ])("reads the participant's hash as %s", async (_name, spell) => {
    const [vector] = CAPTURED_PREPARED_TRANSACTIONS;
    if (!vector) throw new Error('No captured vector');
    const verified = await verifyParticipantPreparedTransaction({
      operation: 'test prepare',
      preparedTransaction: vector.preparedTransaction,
      preparedTransactionHash: spell(vector.expected.hash),
      hashingScheme: vector.scheme,
      expected: {
        actAs: [CAPTURED_PARTY],
        commandId: vector.expected.commandId,
        synchronizerId: CAPTURED_SYNCHRONIZER,
      },
    });
    expect(verified.preparedTransactionHashHex).toBe(vector.expected.hash);
  });

  it.each(CAPTURED_PREPARED_TRANSACTIONS)(
    'reads the command id and synchronizer of the real $id transaction when another party chose them',
    async (vector) => {
      const verified = await verifyParticipantPreparedTransaction({
        operation: 'test prepare',
        preparedTransaction: vector.preparedTransaction,
        preparedTransactionHash: vector.expected.hash,
        hashingScheme: vector.scheme,
        expected: { actAs: [CAPTURED_PARTY] },
      });
      expect(verified.preparedTransactionHashHex).toBe(vector.expected.hash);
    }
  );

  it.each(CAPTURED_PREPARED_TRANSACTIONS)('refuses the real $id transaction under the other scheme', async (vector) => {
    const other =
      vector.scheme === 'HASHING_SCHEME_VERSION_V2' ? 'HASHING_SCHEME_VERSION_V3' : 'HASHING_SCHEME_VERSION_V2';
    const refusal = await rejection(
      verifyParticipantPreparedTransaction({
        operation: 'test prepare',
        preparedTransaction: vector.preparedTransaction,
        preparedTransactionHash: vector.expected.hash,
        hashingScheme: other,
        expected: { actAs: [CAPTURED_PARTY] },
      })
    );
    expect(refusal).toBeInstanceOf(OperationError);
    expect((refusal as OperationError).code).toBe(OperationErrorCode.TRANSACTION_FAILED);
  });

  it.each(['HASHING_SCHEME_VERSION_V2', 'HASHING_SCHEME_VERSION_V3'] as const)(
    'accepts an honest answer under %s',
    async (scheme) => {
      const request = { ...REQUEST, hashingSchemeVersion: scheme };
      const answer = await honestPrepareAnswer(request);
      const verified = await verifyParticipantPreparedTransaction({
        operation: 'test prepare',
        preparedTransaction: answer.preparedTransaction,
        preparedTransactionHash: answer.preparedTransactionHash,
        hashingScheme: scheme,
        answeredHashingScheme: answer.hashingSchemeVersion,
        expected: request,
      });
      expect(verified.preparedTransactionHashHex).toBe(
        Buffer.from(answer.preparedTransactionHash, 'base64').toString('hex')
      );
    }
  );

  describe.each(['HASHING_SCHEME_VERSION_V2', 'HASHING_SCHEME_VERSION_V3'] as const)('under %s', (scheme) => {
    it.each(DISHONEST_PREPARE_ANSWERS)('refuses $name', async (dishonest) => {
      const request = { ...REQUEST, hashingSchemeVersion: scheme };
      const answer = await dishonest.answer(request);
      const refusal = await rejection(
        verifyParticipantPreparedTransaction({
          operation: 'test prepare',
          preparedTransaction: answer.preparedTransaction,
          preparedTransactionHash: answer.preparedTransactionHash,
          hashingScheme: scheme,
          answeredHashingScheme: answer.hashingSchemeVersion,
          expected: request,
        })
      );
      expect(refusal).toBeInstanceOf(OperationError);
      const error = refusal as OperationError;
      expect(error.code).toBe(OperationErrorCode.TRANSACTION_FAILED);
      if (dishonest.code === undefined) {
        expect(error.message).toBe(
          'Canton test prepare response is prepared under another hashing scheme than requested'
        );
        return;
      }
      expect(error.context).toEqual({ code: dishonest.code, field: dishonest.field });
      expect(isCantonProtocolError((error as Error & { cause?: unknown }).cause, dishonest.code)).toBe(true);
    });
  });

  it('refuses a transaction that states no command id when the participant chose it', async () => {
    const built = await buildPreparedTransaction({ partyId: PARTY, commandId: '', synchronizerId: SYNCHRONIZER });
    await expect(
      verifyParticipantPreparedTransaction({
        operation: 'test prepare',
        preparedTransaction: built.preparedTransaction,
        preparedTransactionHash: built.hashHex,
        hashingScheme: 'HASHING_SCHEME_VERSION_V2',
        expected: { actAs: [PARTY] },
      })
    ).rejects.toMatchObject({ context: { code: 'UNEXPECTED', field: 'commandId' } });
  });

  it.each([
    ['no prepared transaction', undefined, 'aa'.repeat(32), 'did not include a prepared transaction'],
    ['an empty prepared transaction', '  ', 'aa'.repeat(32), 'did not include a prepared transaction'],
    ['no hash', 'AAAA', undefined, 'did not include a valid prepared hash'],
    ['a hash of 31 bytes', 'AAAA', 'aa'.repeat(31), 'did not include a valid prepared hash'],
    ['a hash that is not hex or base64', 'AAAA', 'not a hash!', 'did not include a valid prepared hash'],
  ])('refuses an answer with %s', async (_name, preparedTransaction, preparedTransactionHash, message) => {
    const refusal = await rejection(
      verifyParticipantPreparedTransaction({
        operation: 'test prepare',
        preparedTransaction,
        preparedTransactionHash,
        hashingScheme: 'HASHING_SCHEME_VERSION_V2',
        answeredHashingScheme: 'HASHING_SCHEME_VERSION_V2',
        expected: REQUEST,
      })
    );
    expect(refusal).toBeInstanceOf(OperationError);
    expect((refusal as OperationError).message).toBe(`Canton test prepare response ${message}`);
  });

  it('refuses an answer that names no scheme when one is expected', async () => {
    const answer = await honestPrepareAnswer(REQUEST);
    await expect(
      verifyParticipantPreparedTransaction({
        operation: 'test prepare',
        preparedTransaction: answer.preparedTransaction,
        preparedTransactionHash: answer.preparedTransactionHash,
        hashingScheme: 'HASHING_SCHEME_VERSION_V2',
        answeredHashingScheme: undefined,
        expected: REQUEST,
      })
    ).rejects.toThrow('prepared under another hashing scheme than requested');
  });

  it("treats an invalid expectation as the caller's input", async () => {
    const answer = await honestPrepareAnswer(REQUEST);
    const refusal = await rejection(
      verifyParticipantPreparedTransaction({
        operation: 'test prepare',
        preparedTransaction: answer.preparedTransaction,
        preparedTransactionHash: answer.preparedTransactionHash,
        hashingScheme: 'HASHING_SCHEME_VERSION_V2',
        expected: { ...REQUEST, actAs: ['not a party'] },
      })
    );
    expect(refusal).toBeInstanceOf(ValidationError);
    expect(isCantonProtocolError((refusal as Error & { cause?: unknown }).cause, 'INVALID_INPUT')).toBe(true);
  });

  it('lets a platform without WebCrypto hashing fail as it is', async () => {
    const answer = await honestPrepareAnswer(REQUEST);
    const subtle = Object.getOwnPropertyDescriptor(globalThis.crypto, 'subtle');
    Object.defineProperty(globalThis.crypto, 'subtle', { value: undefined, configurable: true });
    try {
      const refusal = await rejection(
        verifyParticipantPreparedTransaction({
          operation: 'test prepare',
          preparedTransaction: answer.preparedTransaction,
          preparedTransactionHash: answer.preparedTransactionHash,
          hashingScheme: 'HASHING_SCHEME_VERSION_V2',
          expected: REQUEST,
        })
      );
      expect(refusal).toBeInstanceOf(CantonProtocolError);
      expect(isCantonProtocolError(refusal, 'UNSUPPORTED')).toBe(true);
    } finally {
      if (subtle) Object.defineProperty(globalThis.crypto, 'subtle', subtle);
      else Reflect.deleteProperty(globalThis.crypto, 'subtle');
    }
  });
});

describe('assertSubmittedPreparedTransaction', () => {
  it.each(CAPTURED_PREPARED_TRANSACTIONS)('accepts the real $id transaction with its hash', async (vector) => {
    await expect(
      assertSubmittedPreparedTransaction({
        preparedTransaction: vector.preparedTransaction,
        preparedTransactionHashHex: vector.expected.hash.toUpperCase(),
        hashingScheme: vector.scheme,
        expected: {
          actAs: [CAPTURED_PARTY],
          commandId: vector.expected.commandId,
          synchronizerId: CAPTURED_SYNCHRONIZER,
        },
      })
    ).resolves.toBeUndefined();
  });

  it('refuses a hash that is not the hash of the submitted transaction', async () => {
    const built = await buildPreparedTransaction({ ...REQUEST, partyId: PARTY });
    const other = await buildPreparedTransaction({ ...REQUEST, partyId: PARTY, note: 'substituted' });
    const refusal = await rejection(
      assertSubmittedPreparedTransaction({
        preparedTransaction: other.preparedTransaction,
        preparedTransactionHashHex: built.hashHex,
        hashingScheme: 'HASHING_SCHEME_VERSION_V2',
        expected: REQUEST,
      })
    );
    expect(refusal).toBeInstanceOf(ValidationError);
    expect((refusal as ValidationError).message).toBe(
      'preparedTransactionHashHex is not the hash of preparedTransaction'
    );
    expect((refusal as ValidationError).context).toEqual({ code: 'HASH_MISMATCH', field: 'hash' });
    expect(isCantonProtocolError((refusal as Error & { cause?: unknown }).cause, 'HASH_MISMATCH')).toBe(true);
  });

  it('refuses a transaction hashed under another scheme than it is executed with', async () => {
    const built = await buildPreparedTransaction({ ...REQUEST, partyId: PARTY, scheme: 'HASHING_SCHEME_VERSION_V3' });
    await expect(
      assertSubmittedPreparedTransaction({
        preparedTransaction: built.preparedTransaction,
        preparedTransactionHashHex: built.hashHex,
        hashingScheme: 'HASHING_SCHEME_VERSION_V2',
        expected: REQUEST,
      })
    ).rejects.toMatchObject({ context: { code: 'HASH_MISMATCH', field: 'hash' } });
  });

  it.each([
    ['actAs', { actAs: [`bob::1220${'ef'.repeat(32)}`] }],
    ['commandId', { commandId: 'command-2' }],
    ['synchronizerId', { synchronizerId: `other::1220${'ef'.repeat(32)}` }],
  ])('refuses a transaction whose %s is not the expected one', async (field, change) => {
    const built = await buildPreparedTransaction({ ...REQUEST, partyId: PARTY });
    const refusal = await rejection(
      assertSubmittedPreparedTransaction({
        preparedTransaction: built.preparedTransaction,
        preparedTransactionHashHex: built.hashHex,
        hashingScheme: 'HASHING_SCHEME_VERSION_V2',
        expected: { ...REQUEST, ...change },
      })
    );
    expect(refusal).toBeInstanceOf(ValidationError);
    expect((refusal as ValidationError).message).toBe(`preparedTransaction does not state the expected ${field}`);
  });

  it('checks only the acting party when the command id and synchronizer are the ones the transaction states', async () => {
    const built = await buildPreparedTransaction({ ...REQUEST, partyId: PARTY });
    await expect(
      assertSubmittedPreparedTransaction({
        preparedTransaction: built.preparedTransaction,
        preparedTransactionHashHex: built.hashHex,
        hashingScheme: 'HASHING_SCHEME_VERSION_V2',
        expected: { actAs: [PARTY] },
      })
    ).resolves.toBeUndefined();
    await expect(
      assertSubmittedPreparedTransaction({
        preparedTransaction: built.preparedTransaction,
        preparedTransactionHashHex: built.hashHex,
        hashingScheme: 'HASHING_SCHEME_VERSION_V2',
        expected: { actAs: [`bob::1220${'ef'.repeat(32)}`] },
      })
    ).rejects.toMatchObject({ context: { code: 'UNEXPECTED', field: 'actAs' } });
  });

  it('refuses bytes that are not a prepared transaction', async () => {
    const refusal = await rejection(
      assertSubmittedPreparedTransaction({
        preparedTransaction: 'prepared-transaction',
        preparedTransactionHashHex: 'ef'.repeat(32),
        hashingScheme: 'HASHING_SCHEME_VERSION_V2',
        expected: { actAs: [PARTY] },
      })
    );
    expect(refusal).toBeInstanceOf(ValidationError);
    expect((refusal as ValidationError).message).toBe('preparedTransaction cannot be decoded and hashed');
    expect(isCantonProtocolError((refusal as Error & { cause?: unknown }).cause, 'UNDECODABLE')).toBe(true);
  });

  it.each([
    ['a base64 hash', Buffer.from('ef'.repeat(32), 'hex').toString('base64')],
    ['a 34-byte Canton hash', `1220${'ef'.repeat(32)}`],
    ['a 31-byte hash', 'ef'.repeat(31)],
  ])('refuses %s under the hex name', async (_name, preparedTransactionHashHex) => {
    const built = await buildPreparedTransaction({ ...REQUEST, partyId: PARTY });
    await expect(
      assertSubmittedPreparedTransaction({
        preparedTransaction: built.preparedTransaction,
        preparedTransactionHashHex,
        hashingScheme: 'HASHING_SCHEME_VERSION_V2',
        expected: REQUEST,
      })
    ).rejects.toThrow('preparedTransactionHashHex must be a 32-byte prepared-transaction hash, hex');
  });

  it('refuses an empty transaction and an invalid expectation as caller input', async () => {
    await expect(
      assertSubmittedPreparedTransaction({
        preparedTransaction: '',
        preparedTransactionHashHex: 'ef'.repeat(32),
        hashingScheme: 'HASHING_SCHEME_VERSION_V2',
        expected: REQUEST,
      })
    ).rejects.toThrow('preparedTransaction is required');
    const built = await buildPreparedTransaction({ ...REQUEST, partyId: PARTY });
    await expect(
      assertSubmittedPreparedTransaction({
        preparedTransaction: built.preparedTransaction,
        preparedTransactionHashHex: built.hashHex,
        hashingScheme: 'HASHING_SCHEME_VERSION_V2',
        expected: { actAs: [] },
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
