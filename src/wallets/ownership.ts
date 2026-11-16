/**
 * Proof that the user controls a wallet's party, not just its party id: the wallet signs a canonical, human-readable
 * message (CIP-0103 `signMessage`) built from a challenge the dApp's server issued, and the server verifies it with
 * `verifyWalletOwnership` (Node only, exported from the package root). A check in the browser proves nothing: anyone
 * can call this code with a made-up provider, so only the server's verification counts.
 *
 * The message is plain text with a fixed first line and a statement that it is not a transaction, so a dApp cannot use
 * it to get a transaction hash (34 binary bytes) signed. Wallets sign the raw message bytes with the party's key (Loop:
 * Ed25519 over the UTF-8 bytes; the CIP-0103 reference wallet: the same), so the text form is the only protection. The
 * nonce must come from the server, be random, and be accepted once.
 *
 * The `Network:` line is a label, not proof: a party id is derived from its key and is the same on every network, so a
 * verified proof says nothing about the party existing or being hosted on that network. `proveWalletOwnership` refuses
 * a wallet that reports another network as a guard against mistakes; a server that needs the network proven must look
 * the party up on that network (its Scan or ledger party and topology APIs).
 */
import {
  CIP103_ERROR_CODES,
  cip103ErrorCode,
  cip103NetworkId,
  describeError,
  primaryAccount,
  type Cip103Provider,
} from './cip103';
import type { DaNetwork, FetchLike } from './da-utilities/client';
import { WalletReadError, WalletSignError } from './errors';
import { isRecord, nonEmptyString } from './json';

/** The first line of every ownership message. */
export const WALLET_OWNERSHIP_TITLE = 'Canton wallet ownership proof';
/** The message format version, its `Version:` line. */
export const WALLET_OWNERSHIP_VERSION = '1';

/** What the dApp's server issues for one proof. Times are ISO-8601 in UTC with milliseconds (`toISOString()`). */
export interface WalletOwnershipChallenge {
  /** The dApp's host (`app.example.com`, `localhost:3000`): the site the user proves ownership to. */
  readonly domain: string;
  /** Single-use, server-generated, unguessable: 16-512 of `A-Z a-z 0-9 . _ ~ -`. */
  readonly nonce: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  /**
   * The Canton network the dApp expects the wallet on (for example the wallet's CIP-0103 `networkId`, `canton:devnet`).
   * A label in the message: signing it does not prove the party is on that network (see the module comment).
   */
  readonly network?: string;
}

/** Every field of an ownership message. */
export interface WalletOwnershipMessageFields extends WalletOwnershipChallenge {
  readonly partyId: string;
}

/** What the browser sends to the server to verify. */
export interface WalletOwnershipProof {
  readonly partyId: string;
  /** The account's `publicKey`, as the wallet reported it. */
  readonly publicKey: string;
  /** The account's `namespace`, when the wallet reported it. */
  readonly namespace?: string;
  /** The exact text the wallet signed. */
  readonly message: string;
  /** The signature as the wallet returned it (Loop: hex; the CIP-0103 reference wallet: base64). */
  readonly signature: string;
}

const DOMAIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::[0-9]{1,5})?$/;
const NONCE_PATTERN = /^[A-Za-z0-9._~-]{16,512}$/;
/** Printable ASCII without spaces. */
const TOKEN_PATTERN = /^[!-~]+$/;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Whether `value` may be a message's domain: a host name, optionally with a port. */
export function isWalletOwnershipDomain(value: unknown): value is string {
  return typeof value === 'string' && DOMAIN_PATTERN.test(value);
}

/** Whether `value` may be a message's party: a Canton party id (`hint::namespace`) of printable ASCII. */
export function isWalletOwnershipPartyId(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length <= 512 && TOKEN_PATTERN.test(value) && value.split('::').length === 2
  );
}

/** The reason a field is not valid in a message, or null. */
function fieldProblem(fields: WalletOwnershipMessageFields): string | null {
  if (!isWalletOwnershipDomain(fields.domain)) {
    return 'domain must be a host name, optionally with a port';
  }
  if (typeof fields.nonce !== 'string' || !NONCE_PATTERN.test(fields.nonce)) {
    return 'nonce must be 16-512 characters of letters, digits and . _ ~ -';
  }
  if (!isWalletOwnershipPartyId(fields.partyId)) {
    return 'partyId must be a Canton party id (hint::namespace)';
  }
  if (
    fields.network !== undefined &&
    (typeof fields.network !== 'string' || fields.network.length > 128 || !TOKEN_PATTERN.test(fields.network))
  ) {
    return 'network must be 1-128 printable characters without spaces';
  }
  for (const key of ['issuedAt', 'expiresAt'] as const) {
    const value = fields[key];
    // An out-of-range date (month 13) is an Invalid Date, whose toISOString() throws: check it first.
    if (
      typeof value !== 'string' ||
      !ISO_PATTERN.test(value) ||
      Number.isNaN(Date.parse(value)) ||
      new Date(value).toISOString() !== value
    ) {
      return `${key} must be an ISO-8601 UTC time with milliseconds (Date.toISOString())`;
    }
  }
  if (Date.parse(fields.expiresAt) <= Date.parse(fields.issuedAt)) {
    return 'expiresAt must be after issuedAt';
  }
  return null;
}

/**
 * The canonical message for these fields. Throws `TypeError` on a field that is not valid. The same fields always give
 * the same text, so the server rebuilds it from the fields it parses and refuses anything else.
 */
export function buildWalletOwnershipMessage(fields: WalletOwnershipMessageFields): string {
  const problem = fieldProblem(fields);
  if (problem !== null) throw new TypeError(`Invalid wallet ownership message: ${problem}`);
  return [
    WALLET_OWNERSHIP_TITLE,
    `Sign this message only to prove to ${fields.domain} that you control the Canton party below. It is not a transaction: it moves no assets and authorizes nothing on the ledger.`,
    '',
    `Version: ${WALLET_OWNERSHIP_VERSION}`,
    `Domain: ${fields.domain}`,
    `Party: ${fields.partyId}`,
    ...(fields.network !== undefined ? [`Network: ${fields.network}`] : []),
    `Nonce: ${fields.nonce}`,
    `Issued At: ${fields.issuedAt}`,
    `Expiration Time: ${fields.expiresAt}`,
  ].join('\n');
}

const FIELD_LINES: ReadonlyMap<string, keyof WalletOwnershipMessageFields | 'version'> = new Map([
  ['Version', 'version'],
  ['Domain', 'domain'],
  ['Party', 'partyId'],
  ['Network', 'network'],
  ['Nonce', 'nonce'],
  ['Issued At', 'issuedAt'],
  ['Expiration Time', 'expiresAt'],
] as const);

/**
 * The fields of a canonical ownership message, or null for any text that is not exactly what
 * {@link buildWalletOwnershipMessage} gives for its fields (another version, an extra line or space, a reordered
 * field).
 */
export function parseWalletOwnershipMessage(message: string): WalletOwnershipMessageFields | null {
  if (typeof message !== 'string' || message.length > 4096) return null;
  const lines = message.split('\n');
  if (lines[0] !== WALLET_OWNERSHIP_TITLE) return null;
  const found: Partial<Record<keyof WalletOwnershipMessageFields | 'version', string>> = {};
  for (const line of lines.slice(3)) {
    const separator = line.indexOf(': ');
    const key = separator > 0 ? FIELD_LINES.get(line.slice(0, separator)) : undefined;
    if (key === undefined || found[key] !== undefined) return null;
    found[key] = line.slice(separator + 2);
  }
  const { version, domain, partyId, network, nonce, issuedAt, expiresAt } = found;
  if (
    version !== WALLET_OWNERSHIP_VERSION ||
    domain === undefined ||
    partyId === undefined ||
    nonce === undefined ||
    issuedAt === undefined ||
    expiresAt === undefined
  ) {
    return null;
  }
  const fields: WalletOwnershipMessageFields = {
    domain,
    partyId,
    nonce,
    issuedAt,
    expiresAt,
    ...(network !== undefined && { network }),
  };
  if (fieldProblem(fields) !== null) return null;
  return buildWalletOwnershipMessage(fields) === message ? fields : null;
}

export interface ProveWalletOwnershipOptions {
  /** The challenge the dApp's server issued. */
  readonly challenge: WalletOwnershipChallenge;
  /**
   * The party the dApp expects. CIP-0103 wallets sign with the primary account, so a different primary account is
   * refused before anything is signed.
   */
  readonly partyId?: string;
  /** Defaults to the system clock; an expired challenge is refused before anything is signed. */
  readonly now?: () => Date;
}

/** The signature from a `signMessage` result: `{signature}` (CIP-0103) or a bare string (some wallets). */
function readSignature(raw: unknown): string | undefined {
  if (typeof raw === 'string') return nonEmptyString(raw);
  return isRecord(raw) ? nonEmptyString(raw['signature']) : undefined;
}

/**
 * Ask the wallet to sign the ownership message for the challenge, as its primary account. Returns what the server needs
 * to verify; it is not itself proof of anything until the server verified it (`verifyWalletOwnership`).
 */
export async function proveWalletOwnership(
  provider: Cip103Provider,
  options: ProveWalletOwnershipOptions
): Promise<WalletOwnershipProof> {
  const account = await primaryAccount(provider);
  if (options.partyId !== undefined && options.partyId !== account.partyId) {
    throw new WalletSignError(
      'invalid-challenge',
      `The wallet's primary account is ${account.partyId}, not ${options.partyId}; switch accounts in the wallet first`
    );
  }
  if (account.publicKey === undefined) {
    throw new WalletReadError('The wallet returned a primary account without publicKey, so ownership cannot be proven');
  }
  const { challenge } = options;
  // A guard against signing for the wrong network, not proof: the wallet reports its network itself.
  if (challenge.network !== undefined && account.networkId !== undefined && account.networkId !== challenge.network) {
    throw new WalletSignError(
      'invalid-challenge',
      `The wallet is on ${account.networkId}, not ${challenge.network}; switch networks in the wallet first`
    );
  }
  let message: string;
  try {
    message = buildWalletOwnershipMessage({
      domain: challenge.domain,
      partyId: account.partyId,
      nonce: challenge.nonce,
      issuedAt: challenge.issuedAt,
      expiresAt: challenge.expiresAt,
      ...(challenge.network !== undefined && { network: challenge.network }),
    });
  } catch (error) {
    throw new WalletSignError('invalid-challenge', error instanceof Error ? error.message : String(error));
  }
  const now = (options.now ?? (() => new Date()))().getTime();
  if (!(now < Date.parse(challenge.expiresAt))) {
    throw new WalletSignError('invalid-challenge', 'The ownership challenge has expired; ask the server for a new one');
  }

  let raw: unknown;
  try {
    raw = await provider.request({ method: 'signMessage', params: { message } });
  } catch (error) {
    const code = cip103ErrorCode(error);
    if (code === CIP103_ERROR_CODES.userRejected) {
      throw new WalletSignError(
        'rejected-by-user',
        `The user declined to sign the ownership message: ${describeError(error)}`,
        code
      );
    }
    throw new WalletSignError('failed', `The wallet did not sign the ownership message: ${describeError(error)}`, code);
  }
  const signature = readSignature(raw);
  if (signature === undefined) {
    throw new WalletSignError('failed', 'The wallet answered signMessage without a signature');
  }
  return {
    partyId: account.partyId,
    publicKey: account.publicKey,
    ...(account.namespace !== undefined && { namespace: account.namespace }),
    message,
    signature,
  };
}

/** Why a proof did not verify (`verifyWalletOwnership`, Node only). */
export type WalletOwnershipFailure =
  /** The proof is not an object of string fields. */
  | 'malformed-proof'
  /** The message is not exactly a canonical ownership message. */
  | 'malformed-message'
  | 'domain-mismatch'
  | 'nonce-mismatch'
  /** The message, the proof and the expected party do not all name the same party, or the namespace differs. */
  | 'party-mismatch'
  | 'network-mismatch'
  /** The message's `Issued At` or `Expiration Time` is not the one the server issued. */
  | 'window-mismatch'
  /** Issued in the future (beyond the allowed clock skew). */
  | 'not-yet-valid'
  /** Past its expiration time. */
  | 'expired'
  /** The message allows a longer validity window than `maxAgeMs`. */
  | 'lifetime-too-long'
  /** The public key is not an Ed25519 key in an encoding this verifier accepts. */
  | 'unsupported-public-key'
  /** The key's fingerprint is not the party's namespace (see `verifyWalletOwnership`). */
  | 'key-not-bound-to-party'
  /** The signature is not 64 bytes of hex or base64. */
  | 'malformed-signature'
  /** The signature does not verify. */
  | 'bad-signature';

/** Why a challenger refused a challenge token before looking at the signature (`createWalletOwnershipChallenger`). */
export type WalletOwnershipChallengeFailure =
  /** The token was not issued by this server (another key or purpose, or altered). */
  | 'challenge-invalid'
  | 'challenge-expired'
  /** Each challenge gets one verdict. */
  | 'challenge-used'
  /** Issued to another subject (signed-in user) or for another host. */
  | 'challenge-not-yours';

/** A challenger's answer to a challenge request: what the wallet signs, and the token to send back with the proof. */
export interface WalletOwnershipChallengeResponse {
  readonly challenge: WalletOwnershipChallenge;
  /** Opaque to the browser: the server's MACed record of the challenge. */
  readonly token: string;
}

/** The server's verdict on a proof. */
export type WalletOwnershipVerdict =
  | {
      readonly verified: true;
      readonly partyId: string;
      /** The party's namespace, which is the key's Canton fingerprint. */
      readonly publicKeyFingerprint: string;
      /** The message's network label as signed; not proof that the party exists on that network. */
      readonly claimedNetwork: string | null;
      readonly verifiedAt: string;
    }
  | {
      readonly verified: false;
      readonly reason: WalletOwnershipChallengeFailure | WalletOwnershipFailure;
      /** A sentence for logs or the user. */
      readonly message: string;
    };

export interface RequestWalletOwnershipVerdictOptions {
  /** The party to prove; the wallet's primary account must be this party. */
  readonly partyId: string;
  readonly network: DaNetwork;
  /** Sends the requests (for example a `fetch` that carries the user's session cookie). */
  readonly fetch: FetchLike;
  /** Answers `POST { network, partyId }` with `{ data: WalletOwnershipChallengeResponse }`. */
  readonly challengeUrl: string;
  /** Answers `POST { token, proof }` with `{ data: WalletOwnershipVerdict }`. */
  readonly verifyUrl: string;
}

/** Whether `value` is a whole verdict: a verified one names `partyId`, a refused one gives its reason and message. */
function isWalletOwnershipVerdict(value: unknown, partyId: string): value is WalletOwnershipVerdict {
  if (!isRecord(value)) return false;
  if (value['verified'] === true) {
    const { claimedNetwork } = value;
    return (
      value['partyId'] === partyId &&
      typeof value['publicKeyFingerprint'] === 'string' &&
      typeof value['verifiedAt'] === 'string' &&
      (claimedNetwork === null || typeof claimedNetwork === 'string')
    );
  }
  return value['verified'] === false && typeof value['reason'] === 'string' && typeof value['message'] === 'string';
}

/** POST `body` as JSON and return the response's `data`; throws on a non-2xx answer or one without `data`. */
async function postForData(fetch: FetchLike, url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json: unknown;
  try {
    json = JSON.parse(await response.text());
  } catch {
    json = undefined;
  }
  const record = isRecord(json) ? json : {};
  if (!response.ok || !('data' in record)) {
    const error = nonEmptyString(record['error']) ?? `HTTP ${response.status}`;
    throw new Error(`The server refused the ownership check: ${error}`);
  }
  return record['data'];
}

/**
 * The browser half of an ownership check, against a server that uses the SDK's challenger (or the same wire format: a
 * 2xx answer is `{ data }`, any other `{ error: string }`): POST `challengeUrl` with `{ network, partyId }`, have the
 * wallet sign the challenge (`proveWalletOwnership`), POST `verifyUrl` with `{ token, proof }`, and return the server's
 * verdict. Throws when no verdict was reached: the server refused (a non-2xx answer, or one without `data`), or the
 * wallet did not sign (`WalletSignError`).
 */
export async function requestWalletOwnershipVerdict(
  provider: Cip103Provider,
  options: RequestWalletOwnershipVerdictOptions
): Promise<WalletOwnershipVerdict> {
  const { partyId, network } = options;
  const issued = await postForData(options.fetch, options.challengeUrl, { network, partyId });
  if (!isRecord(issued) || !isRecord(issued['challenge']) || typeof issued['token'] !== 'string') {
    throw new Error('The server answered the ownership challenge request without { challenge, token }');
  }
  // proveWalletOwnership checks every field before anything is signed.
  const challenge = issued['challenge'] as unknown as WalletOwnershipChallenge;
  if (challenge.network !== cip103NetworkId(network)) {
    throw new WalletSignError(
      'invalid-challenge',
      `The server issued a challenge for ${String(challenge.network)}, not ${cip103NetworkId(network)}`
    );
  }
  const proof = await proveWalletOwnership(provider, { challenge, partyId });
  const verdict = await postForData(options.fetch, options.verifyUrl, { token: issued['token'], proof });
  if (!isWalletOwnershipVerdict(verdict, partyId)) {
    throw new Error('The server answered the ownership proof without a well-formed verdict for the party');
  }
  return verdict;
}
