/**
 * Prepared transactions for the tests of every place node-sdk prepares, signs or submits one. Test data only (not
 * published: `files` ships `build/src`).
 *
 * - {@link CAPTURED_PREPARED_TRANSACTIONS}: prepared transactions captured from a real participant (Canton 3.5.10,
 *   protocol version 35), with the hash the participant returned for each: the independent witnesses. Copied from
 *   `@fairmint/canton-protocol`'s `test/fixtures/prepared-transactions.ts`. Source:
 *   https://github.com/canton-network/wallet/tree/5b76a9e77565465bd637419924e3145fb4b83bbc/core/tx-hashing/vectors
 *   (`v2/v2-exercise-consuming.json`, `v3/v3-exercise-consuming.json`). Apache-2.0, Copyright Digital Asset
 *   (Switzerland) GmbH and/or its affiliates.
 * - {@link buildPreparedTransaction}: a test-only builder (one create node acting as the given party), ported from
 *   canton-protocol's `test/prepared-transaction-builder.ts`, so a mock participant can answer for the test's own
 *   party, command id and synchronizer. Its hash comes from `@canton-network/core-tx-hashing`, the library
 *   canton-protocol hashes with: a cross-check of the wiring, not an independent witness (the captured vectors are).
 */
import { PreparedTransaction } from '@canton-network/core-ledger-proto';
import { computePreparedTransactionHash } from '@canton-network/core-tx-hashing';

export type TestHashingScheme = 'HASHING_SCHEME_VERSION_V2' | 'HASHING_SCHEME_VERSION_V3';

export interface CapturedPreparedTransaction {
  readonly id: string;
  readonly scheme: TestHashingScheme;
  /** The JSON API's base64 `preparedTransaction`. */
  readonly preparedTransaction: string;
  /** The participant's `preparedTransactionHash` (hex) and the command id the transaction states. */
  readonly expected: { readonly hash: string; readonly commandId: string };
}

export const CAPTURED_PREPARED_TRANSACTIONS: readonly CapturedPreparedTransaction[] = [
  {
    id: 'v2-exercise-consuming',
    scheme: 'HASHING_SCHEME_VERSION_V2',
    preparedTransaction:
      'CsoKCgMyLjESATAasAQKATHCPqkECqYECgMyLjESQjAwNGQ3YjgxMTc2NzIyOWIyOTlmYTMzMTI5NTAyODk1NTUyMDA5NzM0NWZhMWE5MmVlMTZkMzA0NWI0M2Q1ZmUwMBoMaGFzaC12ZWN0b3JzIlYKQDdhYzA2NTBlZjRkMzg2YTQyYmNiYzdmZTEyOWY0MTgwNmRhYTA0MDYzZmYwOTcwYTVhM2NkZDZmNGY4MjllNjgSC0hhc2hWZWN0b3JzGgVQbGFpbirAAXK9AQpWCkA3YWMwNjUwZWY0ZDM4NmE0MmJjYmM3ZmUxMjlmNDE4MDZkYWEwNDA2M2ZmMDk3MGE1YTNjZGQ2ZjRmODI5ZTY4EgtIYXNoVmVjdG9ycxoFUGxhaW4SYwoFb3duZXISWjpYaGFzaC12ZWN0b3JzLW93bmVyOjoxMjIwZWQzYjIxNzQ1NGJiNmRmNzE1MzlkODExOWQ2NzkyMTBlZjUyOGNhOGQzNjcxMTc3OWViMDlkNWQ3MzM3YjA5NTJYaGFzaC12ZWN0b3JzLW93bmVyOjoxMjIwZWQzYjIxNzQ1NGJiNmRmNzE1MzlkODExOWQ2NzkyMTBlZjUyOGNhOGQzNjcxMTc3OWViMDlkNWQ3MzM3YjA5NTpYaGFzaC12ZWN0b3JzLW93bmVyOjoxMjIwZWQzYjIxNzQ1NGJiNmRmNzE1MzlkODExOWQ2NzkyMTBlZjUyOGNhOGQzNjcxMTc3OWViMDlkNWQ3MzM3YjA5NRrCBQoBMMI+uwUauAUKAzIuMRKKATAwMGU3ZDI0NzE3OGRiMTNhNmE3ZjUyNWUzYjc1YWI2NTNiOWUwYTI2OGY3ODNkZjliYzc2NmQ0ZGM3ZDZkNGY3NGNhMTIxMjIwZGZhOTBhNDQxZjk2ZWZjNmZlOTBhMGI4MjIzMzNlODlmYWMzZGMxNGI4ZjVmMjA4NTVjZDc0M2YzOGE3ZWE2YxoMaGFzaC12ZWN0b3JzIlYKQDdhYzA2NTBlZjRkMzg2YTQyYmNiYzdmZTEyOWY0MTgwNmRhYTA0MDYzZmYwOTcwYTVhM2NkZDZmNGY4MjllNjgSC0hhc2hWZWN0b3JzGgVQbGFpbipYaGFzaC12ZWN0b3JzLW93bmVyOjoxMjIwZWQzYjIxNzQ1NGJiNmRmNzE1MzlkODExOWQ2NzkyMTBlZjUyOGNhOGQzNjcxMTc3OWViMDlkNWQ3MzM3YjA5NTJYaGFzaC12ZWN0b3JzLW93bmVyOjoxMjIwZWQzYjIxNzQ1NGJiNmRmNzE1MzlkODExOWQ2NzkyMTBlZjUyOGNhOGQzNjcxMTc3OWViMDlkNWQ3MzM3YjA5NTpYaGFzaC12ZWN0b3JzLW93bmVyOjoxMjIwZWQzYjIxNzQ1NGJiNmRmNzE1MzlkODExOWQ2NzkyMTBlZjUyOGNhOGQzNjcxMTc3OWViMDlkNWQ3MzM3YjA5NUoHUmVwbGFjZVJccloKWApAN2FjMDY1MGVmNGQzODZhNDJiY2JjN2ZlMTI5ZjQxODA2ZGFhMDQwNjNmZjA5NzBhNWEzY2RkNmY0ZjgyOWU2OBILSGFzaFZlY3RvcnMaB1JlcGxhY2VYAWIBMWpESkIwMDRkN2I4MTE3NjcyMjliMjk5ZmEzMzEyOTUwMjg5NTU1MjAwOTczNDVmYTFhOTJlZTE2ZDMwNDViNDNkNWZlMDAiIhIgfbNQRskIZLcRCOq3GwSY2sVE79PbgF7rPpprAPlIY8MiJAgBEiAxySc0FZgIcLOHFPMpdnsl8X9/S0gkrpj4JpSAPCWM4xKvChKAAQpYaGFzaC12ZWN0b3JzLW93bmVyOjoxMjIwZWQzYjIxNzQ1NGJiNmRmNzE1MzlkODExOWQ2NzkyMTBlZjUyOGNhOGQzNjcxMTc3OWViMDlkNWQ3MzM3YjA5NRIkNGNiYTQ2YTctODJkMy00MDBiLWIzYmItN2ZiNDI0MGU1YmVhGlJ3YWxsZXQ6OjEyMjBlN2IyM2VhNTJlYjVjNjcyZmIwYjFjZGJjOTE2OTIyZmZlZDNkZDc2NzZjMjIzYTYwNTY2NDMxNWUyZDQzZWRkOjozNS0wKiQ1M2EwMGI0MS1iMzkwLTQzMTMtODBlYi1mM2FlMmY3MTEyZTEw6Mm6jPrTlwM6pggK7wQKAzIuMRKKATAwMGU3ZDI0NzE3OGRiMTNhNmE3ZjUyNWUzYjc1YWI2NTNiOWUwYTI2OGY3ODNkZjliYzc2NmQ0ZGM3ZDZkNGY3NGNhMTIxMjIwZGZhOTBhNDQxZjk2ZWZjNmZlOTBhMGI4MjIzMzNlODlmYWMzZGMxNGI4ZjVmMjA4NTVjZDc0M2YzOGE3ZWE2YxoMaGFzaC12ZWN0b3JzIlYKQDdhYzA2NTBlZjRkMzg2YTQyYmNiYzdmZTEyOWY0MTgwNmRhYTA0MDYzZmYwOTcwYTVhM2NkZDZmNGY4MjllNjgSC0hhc2hWZWN0b3JzGgVQbGFpbirAAXK9AQpWCkA3YWMwNjUwZWY0ZDM4NmE0MmJjYmM3ZmUxMjlmNDE4MDZkYWEwNDA2M2ZmMDk3MGE1YTNjZGQ2ZjRmODI5ZTY4EgtIYXNoVmVjdG9ycxoFUGxhaW4SYwoFb3duZXISWjpYaGFzaC12ZWN0b3JzLW93bmVyOjoxMjIwZWQzYjIxNzQ1NGJiNmRmNzE1MzlkODExOWQ2NzkyMTBlZjUyOGNhOGQzNjcxMTc3OWViMDlkNWQ3MzM3YjA5NTJYaGFzaC12ZWN0b3JzLW93bmVyOjoxMjIwZWQzYjIxNzQ1NGJiNmRmNzE1MzlkODExOWQ2NzkyMTBlZjUyOGNhOGQzNjcxMTc3OWViMDlkNWQ3MzM3YjA5NTpYaGFzaC12ZWN0b3JzLW93bmVyOjoxMjIwZWQzYjIxNzQ1NGJiNmRmNzE1MzlkODExOWQ2NzkyMTBlZjUyOGNhOGQzNjcxMTc3OWViMDlkNWQ3MzM3YjA5NcA+6biijPrTlwPSPqYDCgMyLjESngMKRQAOfSRxeNsTpqf1JeO3WrZTueCiaPeD35vHZtTcfW1PdMoSEiDfqQpEH5bvxv6QoLgiMz6J+sPcFLj18ghVzXQ/OKfqbBIMaGFzaC12ZWN0b3JzGlYKQDdhYzA2NTBlZjRkMzg2YTQyYmNiYzdmZTEyOWY0MTgwNmRhYTA0MDYzZmYwOTcwYTVhM2NkZDZmNGY4MjllNjgSC0hhc2hWZWN0b3JzGgVQbGFpbiJgal4KXApaOlhoYXNoLXZlY3RvcnMtb3duZXI6OjEyMjBlZDNiMjE3NDU0YmI2ZGY3MTUzOWQ4MTE5ZDY3OTIxMGVmNTI4Y2E4ZDM2NzExNzc5ZWIwOWQ1ZDczMzdiMDk1KlhoYXNoLXZlY3RvcnMtb3duZXI6OjEyMjBlZDNiMjE3NDU0YmI2ZGY3MTUzOWQ4MTE5ZDY3OTIxMGVmNTI4Y2E4ZDM2NzExNzc5ZWIwOWQ1ZDczMzdiMDk1OWmciKGfXgYAQioKJgokCAESIH+1G3ZzyFMaXBntmA2PVJZYgz8YGo3JdA7MzEFa4a6AEB4=',
    expected: {
      hash: '3efff25e75492b5ee3556846f610b864190297ea1971ef119ad3d39ec2033c41',
      commandId: '4cba46a7-82d3-400b-b3bb-7fb4240e5bea',
    },
  },
  {
    id: 'v3-exercise-consuming',
    scheme: 'HASHING_SCHEME_VERSION_V3',
    preparedTransaction:
      'CsoKCgMyLjESATAasAQKATHCPqkECqYECgMyLjESQjAwYjE0Njk2NGFmYTBiZjQ1NTI5MGUyYjZkNjFkNmVkMjE2ZTBlNmMyYzI5YTM4NTI0YmNkNTQ3MWZiYjIwYzZiZBoMaGFzaC12ZWN0b3JzIlYKQDdhYzA2NTBlZjRkMzg2YTQyYmNiYzdmZTEyOWY0MTgwNmRhYTA0MDYzZmYwOTcwYTVhM2NkZDZmNGY4MjllNjgSC0hhc2hWZWN0b3JzGgVQbGFpbirAAXK9AQpWCkA3YWMwNjUwZWY0ZDM4NmE0MmJjYmM3ZmUxMjlmNDE4MDZkYWEwNDA2M2ZmMDk3MGE1YTNjZGQ2ZjRmODI5ZTY4EgtIYXNoVmVjdG9ycxoFUGxhaW4SYwoFb3duZXISWjpYaGFzaC12ZWN0b3JzLW93bmVyOjoxMjIwZWQzYjIxNzQ1NGJiNmRmNzE1MzlkODExOWQ2NzkyMTBlZjUyOGNhOGQzNjcxMTc3OWViMDlkNWQ3MzM3YjA5NTJYaGFzaC12ZWN0b3JzLW93bmVyOjoxMjIwZWQzYjIxNzQ1NGJiNmRmNzE1MzlkODExOWQ2NzkyMTBlZjUyOGNhOGQzNjcxMTc3OWViMDlkNWQ3MzM3YjA5NTpYaGFzaC12ZWN0b3JzLW93bmVyOjoxMjIwZWQzYjIxNzQ1NGJiNmRmNzE1MzlkODExOWQ2NzkyMTBlZjUyOGNhOGQzNjcxMTc3OWViMDlkNWQ3MzM3YjA5NRrCBQoBMMI+uwUauAUKAzIuMRKKATAwNjVkNDhmN2Q2Y2VkYTcyMTcyYmJmY2IxMDRmMjI4NWI2ODg3YWYzZmEwYjJlM2ZiNDRjYjM5YTVlYWU4NDQwM2NhMTIxMjIwNjk1MDBlZjgzM2Y5NGVkYmU4NzBkZGYzZTU3OGY3Y2Y3Y2E1MWMzZGRkZWQxNWZhZDE0NzZmMTA5ZmIzZWI2MhoMaGFzaC12ZWN0b3JzIlYKQDdhYzA2NTBlZjRkMzg2YTQyYmNiYzdmZTEyOWY0MTgwNmRhYTA0MDYzZmYwOTcwYTVhM2NkZDZmNGY4MjllNjgSC0hhc2hWZWN0b3JzGgVQbGFpbipYaGFzaC12ZWN0b3JzLW93bmVyOjoxMjIwZWQzYjIxNzQ1NGJiNmRmNzE1MzlkODExOWQ2NzkyMTBlZjUyOGNhOGQzNjcxMTc3OWViMDlkNWQ3MzM3YjA5NTJYaGFzaC12ZWN0b3JzLW93bmVyOjoxMjIwZWQzYjIxNzQ1NGJiNmRmNzE1MzlkODExOWQ2NzkyMTBlZjUyOGNhOGQzNjcxMTc3OWViMDlkNWQ3MzM3YjA5NTpYaGFzaC12ZWN0b3JzLW93bmVyOjoxMjIwZWQzYjIxNzQ1NGJiNmRmNzE1MzlkODExOWQ2NzkyMTBlZjUyOGNhOGQzNjcxMTc3OWViMDlkNWQ3MzM3YjA5NUoHUmVwbGFjZVJccloKWApAN2FjMDY1MGVmNGQzODZhNDJiY2JjN2ZlMTI5ZjQxODA2ZGFhMDQwNjNmZjA5NzBhNWEzY2RkNmY0ZjgyOWU2OBILSGFzaFZlY3RvcnMaB1JlcGxhY2VYAWIBMWpESkIwMGIxNDY5NjRhZmEwYmY0NTUyOTBlMmI2ZDYxZDZlZDIxNmUwZTZjMmMyOWEzODUyNGJjZDU0NzFmYmIyMGM2YmQiIhIg3OTMGmqcivKFFPDoyjTsCMKNr/PiTCaJfBu/GB5J08oiJAgBEiDf2HxFMGlReLx84A9IQRTgu3B2r6ygqcA4C4Plgh/sRRKvChKAAQpYaGFzaC12ZWN0b3JzLW93bmVyOjoxMjIwZWQzYjIxNzQ1NGJiNmRmNzE1MzlkODExOWQ2NzkyMTBlZjUyOGNhOGQzNjcxMTc3OWViMDlkNWQ3MzM3YjA5NRIkZDA2Yzk2ZGUtYzIyMS00MzdmLWI0NzgtMDkwOWMxN2IyMGE1GlJ3YWxsZXQ6OjEyMjBlN2IyM2VhNTJlYjVjNjcyZmIwYjFjZGJjOTE2OTIyZmZlZDNkZDc2NzZjMjIzYTYwNTY2NDMxNWUyZDQzZWRkOjozNS0wKiRiZjVkMzViZC00ZTkzLTQ4NDEtOGE4Mi1iZmRlYzMxODdlYmUw0MjtjPrTlwM6pggK7wQKAzIuMRKKATAwNjVkNDhmN2Q2Y2VkYTcyMTcyYmJmY2IxMDRmMjI4NWI2ODg3YWYzZmEwYjJlM2ZiNDRjYjM5YTVlYWU4NDQwM2NhMTIxMjIwNjk1MDBlZjgzM2Y5NGVkYmU4NzBkZGYzZTU3OGY3Y2Y3Y2E1MWMzZGRkZWQxNWZhZDE0NzZmMTA5ZmIzZWI2MhoMaGFzaC12ZWN0b3JzIlYKQDdhYzA2NTBlZjRkMzg2YTQyYmNiYzdmZTEyOWY0MTgwNmRhYTA0MDYzZmYwOTcwYTVhM2NkZDZmNGY4MjllNjgSC0hhc2hWZWN0b3JzGgVQbGFpbirAAXK9AQpWCkA3YWMwNjUwZWY0ZDM4NmE0MmJjYmM3ZmUxMjlmNDE4MDZkYWEwNDA2M2ZmMDk3MGE1YTNjZGQ2ZjRmODI5ZTY4EgtIYXNoVmVjdG9ycxoFUGxhaW4SYwoFb3duZXISWjpYaGFzaC12ZWN0b3JzLW93bmVyOjoxMjIwZWQzYjIxNzQ1NGJiNmRmNzE1MzlkODExOWQ2NzkyMTBlZjUyOGNhOGQzNjcxMTc3OWViMDlkNWQ3MzM3YjA5NTJYaGFzaC12ZWN0b3JzLW93bmVyOjoxMjIwZWQzYjIxNzQ1NGJiNmRmNzE1MzlkODExOWQ2NzkyMTBlZjUyOGNhOGQzNjcxMTc3OWViMDlkNWQ3MzM3YjA5NTpYaGFzaC12ZWN0b3JzLW93bmVyOjoxMjIwZWQzYjIxNzQ1NGJiNmRmNzE1MzlkODExOWQ2NzkyMTBlZjUyOGNhOGQzNjcxMTc3OWViMDlkNWQ3MzM3YjA5NcA+28HZjPrTlwPSPqYDCgMyLjESngMKRQBl1I99bO2nIXK7/LEE8ihbaIevP6Cy4/tEyzml6uhEA8oSEiBpUA74M/lO2+hw3fPlePfPfKUcPd3tFfrRR28Qn7PrYhIMaGFzaC12ZWN0b3JzGlYKQDdhYzA2NTBlZjRkMzg2YTQyYmNiYzdmZTEyOWY0MTgwNmRhYTA0MDYzZmYwOTcwYTVhM2NkZDZmNGY4MjllNjgSC0hhc2hWZWN0b3JzGgVQbGFpbiJgal4KXApaOlhoYXNoLXZlY3RvcnMtb3duZXI6OjEyMjBlZDNiMjE3NDU0YmI2ZGY3MTUzOWQ4MTE5ZDY3OTIxMGVmNTI4Y2E4ZDM2NzExNzc5ZWIwOWQ1ZDczMzdiMDk1KlhoYXNoLXZlY3RvcnMtb3duZXI6OjEyMjBlZDNiMjE3NDU0YmI2ZGY3MTUzOWQ4MTE5ZDY3OTIxMGVmNTI4Y2E4ZDM2NzExNzc5ZWIwOWQ1ZDczMzdiMDk1OdtglqGfXgYAQioKJgokCAESIKH2b+06pq8POlFXfHJ4RlvwS8HvUtQrwpKKNkDHjjNFEB4=',
    expected: {
      hash: 'baa221cba0f89c45233b534a97ad2a55c33ac89f9600f94b054666d2570ff26a',
      commandId: 'd06c96de-c221-437f-b478-0909c17b20a5',
    },
  },
];

/** The party the captured transactions act as (the vectors' own test party, not a holder). */
export const CAPTURED_PARTY =
  'hash-vectors-owner::1220ed3b217454bb6df71539d8119d679210ef528ca8d36711779eb09d5d7337b095';
/** The logical synchronizer they were prepared on; the transactions name its physical form, `::35-0`. */
export const CAPTURED_SYNCHRONIZER = 'wallet::1220e7b23ea52eb5c672fb0b1cdbc916922ffed3dd7676c223a605664315e2d43edd';

export interface BuildPreparedTransactionInput {
  /** The create node's signatory and, unless `actAs` is given, the acting party. */
  readonly partyId: string;
  readonly commandId: string;
  /** The logical synchronizer: the metadata names its physical form (`::35-0`), as a participant writes it. */
  readonly synchronizerId: string;
  /** The metadata's `actAs` (defaults to `[partyId]`). */
  readonly actAs?: readonly string[];
  /** Changes the create node's argument, so the transaction (and its hash) changes. */
  readonly note?: string;
  readonly scheme?: TestHashingScheme;
}

export interface BuiltPreparedTransaction {
  readonly preparedTransaction: string;
  /** The hash of {@link BuiltPreparedTransaction.preparedTransaction} under the scheme, lowercase hex. */
  readonly hashHex: string;
  readonly hashingScheme: TestHashingScheme;
}

/** A prepared transaction built from `input`, with its hash. */
export async function buildPreparedTransaction(
  input: BuildPreparedTransactionInput
): Promise<BuiltPreparedTransaction> {
  const scheme = input.scheme ?? 'HASHING_SCHEME_VERSION_V2';
  const templateId = { packageId: 'ab'.repeat(32), moduleName: 'Test', entityName: 'Note' };
  const bytes = PreparedTransaction.toBinary(
    PreparedTransaction.create({
      transaction: {
        version: '2.1',
        roots: ['0'],
        nodes: [
          {
            nodeId: '0',
            versionedNode: {
              oneofKind: 'v1',
              v1: {
                nodeType: {
                  oneofKind: 'create',
                  create: {
                    lfVersion: '2.1',
                    contractId: `00${'cd'.repeat(33)}`,
                    packageName: 'test',
                    templateId,
                    argument: {
                      sum: {
                        oneofKind: 'record',
                        record: {
                          recordId: templateId,
                          fields: [
                            { label: 'owner', value: { sum: { oneofKind: 'party', party: input.partyId } } },
                            { label: 'note', value: { sum: { oneofKind: 'text', text: input.note ?? '' } } },
                          ],
                        },
                      },
                    },
                    signatories: [input.partyId],
                    stakeholders: [input.partyId],
                  },
                },
              },
            },
          },
        ],
        nodeSeeds: [{ nodeId: 0, seed: new Uint8Array(32).fill(1) }],
      },
      metadata: {
        submitterInfo: { actAs: [...(input.actAs ?? [input.partyId])], commandId: input.commandId },
        synchronizerId: `${input.synchronizerId}::35-0`,
        transactionUuid: '53a00b41-b390-4313-80eb-f3ae2f7112e1',
        preparationTime: 1_795_176_000_000_048n,
        inputContracts: [],
      },
    })
  );
  const preparedTransaction = Buffer.from(bytes).toString('base64');
  return {
    preparedTransaction,
    hashHex: Buffer.from(await computePreparedTransactionHash(preparedTransaction, scheme)).toString('hex'),
    hashingScheme: scheme,
  };
}

/** The prepare request fields a mock participant answers from. */
export interface PrepareRequestLike {
  readonly actAs: readonly string[];
  readonly commandId: string;
  /** Optional in the request type; node-sdk always names one, and the mock participant refuses a request without. */
  readonly synchronizerId?: string | undefined;
  readonly hashingSchemeVersion?: TestHashingScheme | undefined;
}

/** A Ledger JSON API prepare answer, for the requested parties, command and synchronizer. */
export interface PrepareAnswer {
  readonly preparedTransaction: string;
  /** Base64, as the JSON API returns it. */
  readonly preparedTransactionHash: string;
  readonly hashingSchemeVersion: TestHashingScheme;
}

/**
 * What an honest participant answers to `request`: a transaction acting as the requested parties, under the requested
 * command id, on the requested synchronizer, hashed under the requested scheme.
 */
export async function honestPrepareAnswer(request: PrepareRequestLike, note?: string): Promise<PrepareAnswer> {
  const [partyId] = request.actAs;
  if (partyId === undefined) throw new Error('A prepare request names at least one party');
  if (request.synchronizerId === undefined) throw new Error('node-sdk names the synchronizer of every prepare request');
  const scheme = request.hashingSchemeVersion ?? 'HASHING_SCHEME_VERSION_V2';
  const built = await buildPreparedTransaction({
    partyId,
    actAs: request.actAs,
    commandId: request.commandId,
    synchronizerId: request.synchronizerId,
    scheme,
    ...(note !== undefined ? { note } : {}),
  });
  return {
    preparedTransaction: built.preparedTransaction,
    preparedTransactionHash: Buffer.from(built.hashHex, 'hex').toString('base64'),
    hashingSchemeVersion: scheme,
  };
}

/** The ways a participant's prepare answer can lie, each of which node-sdk must refuse before anything is signed. */
export interface DishonestPrepareAnswer {
  readonly name: string;
  /** The refusal's canton-protocol code (in the OperationError's context), or undefined for a scheme downgrade. */
  readonly code?: 'HASH_MISMATCH' | 'UNEXPECTED' | 'UNDECODABLE';
  readonly field?: string;
  readonly answer: (request: PrepareRequestLike) => Promise<PrepareAnswer>;
}

export const DISHONEST_PREPARE_ANSWERS: readonly DishonestPrepareAnswer[] = [
  {
    name: 'a hash of another transaction',
    code: 'HASH_MISMATCH',
    field: 'hash',
    answer: async (request: PrepareRequestLike): Promise<PrepareAnswer> => {
      const honest = await honestPrepareAnswer(request);
      const other = await honestPrepareAnswer(request, 'another transaction');
      return { ...honest, preparedTransactionHash: other.preparedTransactionHash };
    },
  },
  {
    name: 'a transaction acting as another party too',
    code: 'UNEXPECTED',
    field: 'actAs',
    answer: async (request) =>
      honestPrepareAnswer({ ...request, actAs: [...request.actAs, `mallory::1220${'ee'.repeat(32)}`] }),
  },
  {
    name: 'a transaction under another command id',
    code: 'UNEXPECTED',
    field: 'commandId',
    answer: async (request) => honestPrepareAnswer({ ...request, commandId: `${request.commandId}-other` }),
  },
  {
    name: 'a transaction on another synchronizer',
    code: 'UNEXPECTED',
    field: 'synchronizerId',
    answer: async (request) =>
      honestPrepareAnswer({ ...request, synchronizerId: `other-synchronizer::1220${'ff'.repeat(32)}` }),
  },
  {
    name: 'bytes that are not a prepared transaction',
    code: 'UNDECODABLE',
    field: 'preparedTransaction',
    answer: async (request) => ({
      ...(await honestPrepareAnswer(request)),
      preparedTransaction: Buffer.from('not a prepared transaction').toString('base64'),
    }),
  },
  {
    // V3 requested: answered under V2 (a downgrade); V2 requested: an answer naming V3.
    name: 'an answer under another hashing scheme than requested',
    answer: async (request) =>
      honestPrepareAnswer({ ...request, hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2' }).then((answer) =>
        request.hashingSchemeVersion === 'HASHING_SCHEME_VERSION_V3'
          ? answer
          : { ...answer, hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V3' as const }
      ),
  },
];
