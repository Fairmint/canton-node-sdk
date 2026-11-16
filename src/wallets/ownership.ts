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
 */
import { CIP103_ERROR_CODES, cip103ErrorCode, describeError, primaryAccount, type Cip103Provider } from './cip103';
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
  /** The Canton network the party must be on (for example the wallet's CIP-0103 `networkId`, `canton:devnet`). */
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

/** The reason a field is not valid in a message, or null. */
function fieldProblem(fields: WalletOwnershipMessageFields): string | null {
  if (typeof fields.domain !== 'string' || !DOMAIN_PATTERN.test(fields.domain)) {
    return 'domain must be a host name, optionally with a port';
  }
  if (typeof fields.nonce !== 'string' || !NONCE_PATTERN.test(fields.nonce)) {
    return 'nonce must be 16-512 characters of letters, digits and . _ ~ -';
  }
  if (
    typeof fields.partyId !== 'string' ||
    fields.partyId.length > 512 ||
    !TOKEN_PATTERN.test(fields.partyId) ||
    fields.partyId.split('::').length !== 2
  ) {
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
    if (typeof value !== 'string' || !ISO_PATTERN.test(value) || new Date(value).toISOString() !== value) {
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
