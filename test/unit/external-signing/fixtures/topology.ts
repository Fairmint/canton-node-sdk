/**
 * A test-only encoder of external-party onboarding topology, byte for byte what a Canton 3.7 participant's
 * generate-topology returns (canonical proto3: fields ascending, defaults omitted, `usage` packed), with knobs to build
 * the variants node-sdk must refuse. Ported from `@fairmint/canton-protocol`'s `test/topology-encoder.ts`; the real
 * participant vectors it reproduces are in `topology-vectors.ts`. Multi-hashes are computed independently here through
 * `node:crypto`, never by the code under test.
 */
import { createHash } from 'node:crypto';

type ProtoField =
  readonly [field: number, wire: 0, value: number] | readonly [field: number, wire: 2, value: Uint8Array];

function varint(value: number): number[] {
  const bytes: number[] = [];
  let rest = value;
  while (rest >= 0x80) {
    bytes.push((rest % 0x80) | 0x80);
    rest = Math.floor(rest / 0x80);
  }
  bytes.push(rest);
  return bytes;
}

function message(fields: readonly ProtoField[]): Uint8Array {
  const out: number[] = [];
  for (const [field, wire, value] of fields) {
    out.push(...varint(field * 8 + wire));
    if (wire === 0) out.push(...varint(value));
    else out.push(...varint(value.length), ...value);
  }
  return Uint8Array.from(out);
}

const num = (field: number, value: number): ProtoField[] => (value === 0 ? [] : [[field, 0, value]]);
const str = (field: number, value: string): ProtoField[] =>
  value === '' ? [] : [[field, 2, new TextEncoder().encode(value)]];
const sub = (field: number, value: Uint8Array): ProtoField => [field, 2, value];

/** `ParticipantPermission` wire values. */
export const PERMISSION = Object.freeze({ SUBMISSION: 1, CONFIRMATION: 2, OBSERVATION: 3 });
/** `SigningKeyUsage` wire values. */
export const KEY_USAGE = Object.freeze({
  NAMESPACE: 1,
  SEQUENCER_AUTHENTICATION: 3,
  PROTOCOL: 4,
  PROOF_OF_OWNERSHIP: 5,
});

export interface TopologyParticipant {
  readonly participantUid: string;
  /** Defaults to CONFIRMATION. */
  readonly permission?: number;
}

export interface OnboardingTopologyInput {
  readonly partyId: string;
  /** The party's key as the topology states it: DER SPKI, base64. */
  readonly publicKeyDerBase64: string;
  readonly participants: readonly TopologyParticipant[];
  /** Defaults to 1. */
  readonly threshold?: number;
  /** Defaults to NAMESPACE, PROOF_OF_OWNERSHIP, PROTOCOL, as Canton 3.7 generates them. */
  readonly usage?: readonly number[];
  /** Defaults to 31. */
  readonly protoVersion?: 30 | 31;
}

/** One generated onboarding transaction (`UntypedVersionedMessage` of a `PartyToParticipant`), base64. */
export function encodeOnboardingTopology(input: OnboardingTopologyInput): string {
  const version = input.protoVersion ?? 31;
  const key = message([
    ...num(2, 4),
    [3, 2, Uint8Array.from(Buffer.from(input.publicKeyDerBase64, 'base64'))],
    [5, 2, Uint8Array.from((input.usage ?? [1, 5, 4]).flatMap(varint))],
    ...num(6, 1),
  ]);
  const keys = message([sub(1, key), ...num(2, 1)]);
  const participants = input.participants.map((participant) =>
    sub(
      3,
      message([
        ...str(1, participant.participantUid),
        ...num(2, participant.permission ?? PERMISSION.CONFIRMATION),
        ...(version === 31 ? num(3, 4) : []),
      ])
    )
  );
  const p2p = message([
    ...str(1, input.partyId),
    ...num(2, input.threshold ?? 1),
    ...participants,
    sub(version === 31 ? 4 : 6, keys),
  ]);
  const transaction = message([...num(1, 1), ...num(2, 1), sub(3, message([sub(9, p2p)]))]);
  return Buffer.from(message([sub(1, transaction), ...num(2, version)])).toString('base64');
}

/** Canton's multi-hash of `transactionsBase64` through `node:crypto` (deduplicated and sorted as Canton does), hex. */
export function nodeMultiHashHex(transactionsBase64: readonly string[]): string {
  const cantonHash = (purpose: number, bytes: Buffer): Buffer => {
    const prefix = Buffer.alloc(4);
    prefix.writeInt32BE(purpose);
    return Buffer.concat([Buffer.from([0x12, 0x20]), createHash('sha256').update(prefix).update(bytes).digest()]);
  };
  const hashes = [
    ...new Set(
      transactionsBase64.map((transaction) => cantonHash(11, Buffer.from(transaction, 'base64')).toString('hex'))
    ),
  ].sort();
  const count = Buffer.alloc(4);
  count.writeInt32BE(hashes.length);
  const parts = hashes.flatMap((hash) => {
    const length = Buffer.alloc(4);
    length.writeInt32BE(34);
    return [length, Buffer.from(hash, 'hex')];
  });
  return cantonHash(55, Buffer.concat([count, ...parts])).toString('hex');
}

/** A participant's generate-topology answer. */
export interface GeneratedTopologyAnswer {
  readonly partyId: string;
  /** The party's namespace: its key's fingerprint. */
  readonly publicKeyFingerprint: string;
  readonly topologyTransactions: string[];
  /** The participant's multi-hash, base64, as the JSON API returns it. */
  readonly multiHash: string;
  /** The same multi-hash, lowercase hex. */
  readonly multiHashHex: string;
}

/** The generate-topology answer for `input`, its multi-hash computed with {@link nodeMultiHashHex}. */
export function generatedTopologyAnswer(input: OnboardingTopologyInput): GeneratedTopologyAnswer {
  const topologyTransactions = [encodeOnboardingTopology(input)];
  const multiHashHex = nodeMultiHashHex(topologyTransactions);
  return {
    partyId: input.partyId,
    publicKeyFingerprint: input.partyId.slice(input.partyId.lastIndexOf('::') + 2),
    topologyTransactions,
    multiHash: Buffer.from(multiHashHex, 'hex').toString('base64'),
    multiHashHex,
  };
}

/** A participant UID (`name::1220…`) for tests, distinct per `seed`. Not a real participant. */
export function testParticipantUid(name: string, seed: number): string {
  return `${name}::1220${seed.toString(16).padStart(2, '0').repeat(32)}`;
}
