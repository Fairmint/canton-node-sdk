/**
 * Server half of a wallet ownership check, for a dApp whose page calls `requestWalletOwnershipVerdict` (browser-safe
 * wallets module). Node only: it uses `node:crypto`, so it is exported from the package root and never from the wallets
 * entry.
 *
 * The challenge is stateless: its fields travel in a token (`v1.<base64url JSON claims>.<base64url MAC>`) MACed with
 * HMAC-SHA256 under a key derived from your secret and a purpose label (`HMAC-SHA256(secret, purpose)`), so a challenge
 * token is never valid as another of your MACs, such as a session cookie. The token binds the challenge to the subject
 * (your signed-in user), the host it was issued for and the party, and lives `ttlMs` (5 minutes by default).
 *
 * Each challenge gets exactly one verdict: its nonce is spent before the signature is checked. The default nonce store
 * keeps spent nonces in this process only, so on several server instances a replay within the TTL could reach another
 * instance; pass a shared `nonceStore` (Redis, Postgres) to enforce single use across them.
 *
 * The network in the message is a label, not something this proves: a party id is derived from its key and is the same
 * on every network, so the verdict reports it only as `claimedNetwork` (see `verifyWalletOwnership`).
 *
 * The message's domain is the browser's `Origin` host, and only when the server names that host itself (the request's
 * own URL, or a configured trusted origin). `x-forwarded-host`, which any non-browser caller sets, is never read.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isRecord } from '../../core/utils/type-guards';
import { cip103NetworkId, isDaNetwork } from '../../wallets/cip103';
import type { DaNetwork } from '../../wallets/da-utilities/client';
import {
  buildWalletOwnershipMessage,
  isWalletOwnershipDomain,
  isWalletOwnershipPartyId,
  type WalletOwnershipChallenge,
  type WalletOwnershipChallengeFailure,
  type WalletOwnershipChallengeResponse,
  type WalletOwnershipVerdict,
} from '../../wallets/ownership';
import {
  buildWalletProofMessage,
  WALLET_PROOF_FORMAT,
  type WalletProofChallengeResponse,
  type WalletProofFields,
  type WalletProofFormat,
} from '../../wallets/wallet-proof';
import { verifyWalletOwnership } from './wallet-ownership';
import { verifyWalletProof } from './wallet-proof';

export type {
  WalletOwnershipChallengeFailure,
  WalletOwnershipChallengeResponse,
  WalletOwnershipVerdict,
  WalletProofChallengeResponse,
};

/**
 * The message a challenge asks the wallet to sign: `text` (the default, `buildWalletOwnershipMessage`) or
 * `wallet-proof-v1` (`buildWalletProofMessage`, built by the server and sent whole).
 */
export type WalletOwnershipChallengeFormat = 'text' | WalletProofFormat;

/** How a challenge in the `wallet-proof-v1` format is built. */
export interface WalletProofChallengeOptions {
  /** `wallet-proof-v1`: the challenge carries a server-built wallet proof message instead of the text challenge. */
  readonly format: WalletProofFormat;
  /**
   * The message's `domain` (a purpose tag, `fairmint:tokenization-wallet-proof:v1`). Defaults to the challenger's
   * `purpose`.
   */
  readonly proofDomain?: string;
}

/** How long a challenge may be signed and verified, by default. */
export const DEFAULT_WALLET_OWNERSHIP_CHALLENGE_TTL_MS = 5 * 60 * 1000;

const TOKEN_VERSION = 'v1';
const MAX_TOKEN_LENGTH = 4096;

const CHALLENGE_FAILURE_TEXT: Readonly<Record<WalletOwnershipChallengeFailure, string>> = {
  'challenge-invalid': 'The challenge was not issued by this server.',
  'challenge-expired': 'The challenge expired. Ask for a new one.',
  'challenge-used': 'The challenge was already used. Each one is accepted once.',
  'challenge-not-yours': 'The challenge was issued to another session, party or host.',
};

const UNTRUSTED_ORIGIN = "Ownership checks accept only requests from this site's own pages.";

/** Spent nonces. */
export interface WalletOwnershipNonceStore {
  /**
   * Spend `nonce` until `expiresAtMs` (its challenge's expiry; it may be forgotten after that). False when it was
   * already spent. A shared store must make this atomic (for example `SET NX` with an expiry).
   */
  spend(nonce: string, expiresAtMs: number, nowMs: number): boolean | Promise<boolean>;
}

/**
 * Spent nonces in this process, pruned on expiry. Enforces single use on one server instance only (see the module
 * comment).
 */
export function createMemoryNonceStore(): WalletOwnershipNonceStore {
  const spent = new Map<string, number>();
  return {
    spend(nonce, expiresAtMs, nowMs) {
      for (const [key, until] of spent) {
        if (until <= nowMs) spent.delete(key);
      }
      if (spent.has(nonce)) return false;
      spent.set(nonce, expiresAtMs);
      return true;
    },
  };
}

export interface WalletOwnershipChallengerOptions {
  /** The MAC secret. */
  readonly secret: string | Uint8Array;
  /** Key label: the MAC key is `HMAC-SHA256(secret, purpose)`, so a challenge token is never valid as another MAC. */
  readonly purpose: string;
  /** Challenge lifetime; default 5 minutes. Also `verifyWalletOwnership`'s `maxAgeMs`. */
  readonly ttlMs?: number;
  /** Default: `createMemoryNonceStore()`. */
  readonly nonceStore?: WalletOwnershipNonceStore;
  /** Defaults to the system clock. */
  readonly now?: () => Date;
}

export interface WalletOwnershipIssueArgs {
  /**
   * Who asks: your signed-in user's stable id. Only the same subject can have the proof verified. In the
   * `wallet-proof-v1` format it is also the message's `investorContext`, so the browser sees it.
   */
  readonly subject: string;
  /** Your host, as the browser reaches it (`walletOwnershipDomain`). In `wallet-proof-v1` it binds the token only. */
  readonly domain: string;
  readonly partyId: string;
  readonly network: DaNetwork;
  /** `text` (the default) or `wallet-proof-v1`. */
  readonly format?: WalletOwnershipChallengeFormat;
  /** `wallet-proof-v1` only: the message's `domain`. Defaults to the challenger's `purpose`. */
  readonly proofDomain?: string;
}

export interface WalletOwnershipVerifyArgs {
  /** The challenge's token, as the browser sent it back. */
  readonly token: unknown;
  /** The proof, as the browser sent it; `verifyWalletOwnership` checks its shape. */
  readonly proof: unknown;
  readonly subject: string;
  readonly domain: string;
}

export interface WalletOwnershipHandlerArgs {
  /** Your signed-in user's stable id. Authenticate the request before calling a handler. */
  readonly subject: string;
  /**
   * Origins besides the request's own (`request.url`) whose host the message may name, as absolute URLs
   * (`https://app.example.com`). A malformed entry makes the handler throw `TypeError` instead of answering 400.
   */
  readonly trustedOrigins?: readonly string[];
}

export interface WalletOwnershipChallengeHandlerArgs extends WalletOwnershipHandlerArgs {
  /** The challenge format (`issue`'s `format`); `text` by default. The verify handler reads it from the token. */
  readonly format?: WalletOwnershipChallengeFormat;
  /** `wallet-proof-v1` only: the message's `domain` (`issue`'s `proofDomain`). */
  readonly proofDomain?: string;
}

export interface WalletOwnershipVerifyHandlerArgs extends WalletOwnershipHandlerArgs {
  /** For logging: the verdict and the party from the challenge token (never from the unparsed proof). */
  readonly onVerdict?: (verdict: WalletOwnershipVerdict, partyId: string | null) => void;
}

export interface WalletOwnershipChallenger {
  /**
   * A challenge for `partyId`. Throws `TypeError` for a party id, domain or network the message rules refuse. With
   * `format: 'wallet-proof-v1'` it answers {@link WalletProofChallengeResponse}: the exact wallet proof message to sign,
   * with `idempotencyKey` the challenge's nonce (its reference) and `investorContext` the subject.
   */
  issue(args: WalletOwnershipIssueArgs & { readonly format: WalletProofFormat }): WalletProofChallengeResponse;
  issue(args: WalletOwnershipIssueArgs & { readonly format?: 'text' }): WalletOwnershipChallengeResponse;
  issue(args: WalletOwnershipIssueArgs): WalletOwnershipChallengeResponse | WalletProofChallengeResponse;
  /**
   * The verdict on a proof. The checks run in this order: the token's MAC (constant time), then the subject and domain,
   * then expiry, then the nonce spend (before the signature, so each challenge gets one verdict), then
   * `verifyWalletOwnership` with the challenge's nonce, domain, network, party and exact window (`verifyWalletProof`
   * with the exact message fields for a `wallet-proof-v1` challenge; the token says which). `token` must be a string of
   * at most 4096 characters. Never throws for a bad token or proof.
   */
  verify(args: WalletOwnershipVerifyArgs): Promise<WalletOwnershipVerdict>;
  /**
   * Fetch-API handler for the challenge request, body `{ network, partyId }`. 200 answers `{ data:
   * WalletOwnershipChallengeResponse }` (or `{ data: WalletProofChallengeResponse }` with `format: 'wallet-proof-v1'`);
   * bad JSON, a bad body or an untrusted `Origin` answer 400 `{ error }`. Every response is `no-store`. Check the
   * caller's session (and your CSRF rules) first.
   */
  handleChallenge(request: Request, args: WalletOwnershipChallengeHandlerArgs): Promise<Response>;
  /**
   * Fetch-API handler for the verify request, body `{ token, proof }`. 200 answers `{ data: WalletOwnershipVerdict }`,
   * verified or not; 400 `{ error }` only for bad JSON, a body that is not a token and a proof object, or an untrusted
   * `Origin`. Every response is `no-store`.
   */
  handleVerify(request: Request, args: WalletOwnershipVerifyHandlerArgs): Promise<Response>;
}

/** What the server needs back to verify a proof; MACed into the token. Key order is the token format. */
interface ChallengeClaims {
  readonly domain: string;
  readonly nonce: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly network: string;
  readonly partyId: string;
  /** The subject the challenge was issued to. */
  readonly sub: string;
  /** `wallet-proof-v1` challenges only (absent: the text format). */
  readonly format?: WalletProofFormat;
  /** `wallet-proof-v1` challenges only: the message's domain. */
  readonly proofDomain?: string;
}

const CLAIM_KEYS = ['domain', 'nonce', 'issuedAt', 'expiresAt', 'network', 'partyId', 'sub'] as const;

/**
 * The host the ownership message is bound to: the host of the browser's `Origin`, when it is the request's own host
 * (`request.url`) or the host of one of `trustedOrigins`. Null without an `Origin` (a non-browser caller), with an
 * opaque (`null`) one, or for any other host. `x-forwarded-host` is never read: a non-browser caller can set it, and
 * `Origin` too, so only hosts the server itself names are accepted. Throws `TypeError` when a `trustedOrigins` entry is
 * not an absolute URL: one bad entry must not silently refuse every caller.
 */
export function walletOwnershipDomain(request: Request, trustedOrigins: readonly string[] = []): string | null {
  // A server misconfiguration, not a caller's fault: fail loudly instead of refusing every request with a 400.
  const trusted = new Set(trustedOrigins.map(trustedHost));
  const origin = request.headers.get('origin');
  if (origin === null || origin === '' || origin === 'null') return null;
  try {
    const host = new URL(origin).host.toLowerCase();
    trusted.add(new URL(request.url).host.toLowerCase());
    return isWalletOwnershipDomain(host) && trusted.has(host) ? host : null;
  } catch {
    return null;
  }
}

/** The host of a configured trusted origin. Throws `TypeError` naming an entry that is not an absolute URL. */
function trustedHost(origin: string): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new TypeError(`trustedOrigins entry ${JSON.stringify(origin)} is not an absolute URL (https://host)`);
  }
  return url.host.toLowerCase();
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

const badRequest = (error: string): Response => jsonResponse(400, { error });

/** The request's JSON body, or a 400 response. */
async function readBody(request: Request): Promise<{ readonly body: Record<string, unknown> } | Response> {
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return badRequest('Invalid JSON request body');
  }
  return isRecord(body) ? { body } : badRequest('Expected a JSON object.');
}

/** A challenger: issues challenges and verifies proofs against them (see the module comment). */
export function createWalletOwnershipChallenger(options: WalletOwnershipChallengerOptions): WalletOwnershipChallenger {
  const { secret, purpose } = options;
  const ttlMs = options.ttlMs ?? DEFAULT_WALLET_OWNERSHIP_CHALLENGE_TTL_MS;
  const nonceStore = options.nonceStore ?? createMemoryNonceStore();
  const now = options.now ?? (() => new Date());
  if (!(typeof secret === 'string' ? secret.length > 0 : secret instanceof Uint8Array && secret.byteLength > 0)) {
    throw new TypeError('secret is required');
  }
  if (typeof purpose !== 'string' || purpose.length === 0) throw new TypeError('purpose is required');
  if (!Number.isFinite(ttlMs) || !(ttlMs > 0)) throw new TypeError('ttlMs must be a positive number');

  const macKey = createHmac('sha256', secret).update(purpose).digest();
  const mac = (body: string): string =>
    createHmac('sha256', macKey).update(`${TOKEN_VERSION}.${body}`).digest('base64url');

  /** The claims of a token this challenger MACed, or null for any other text. */
  function readClaims(token: unknown): ChallengeClaims | null {
    if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) return null;
    const [version, body, signature, extra] = token.split('.');
    if (version !== TOKEN_VERSION || !body || !signature || extra !== undefined) return null;
    const expected = Buffer.from(mac(body));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
    if (!isRecord(parsed) || !CLAIM_KEYS.every((key) => typeof parsed[key] === 'string')) return null;
    const { format, proofDomain } = parsed;
    if (format !== undefined && (format !== WALLET_PROOF_FORMAT || typeof proofDomain !== 'string')) return null;
    return parsed as unknown as ChallengeClaims;
  }

  function issue(args: WalletOwnershipIssueArgs): WalletOwnershipChallengeResponse | WalletProofChallengeResponse {
    const { subject, domain, partyId, network } = args;
    // Not narrowed by the type: a JavaScript caller can pass anything.
    const format: string = args.format ?? 'text';
    if (typeof subject !== 'string' || subject.length === 0) throw new TypeError('subject is required');
    if (!isDaNetwork(network)) throw new TypeError('network must be devnet or mainnet');
    if (format !== 'text' && format !== WALLET_PROOF_FORMAT)
      throw new TypeError('format must be text or wallet-proof-v1');
    const issuedAt = now();
    const challenge = {
      domain,
      nonce: randomBytes(24).toString('base64url'),
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(issuedAt.getTime() + ttlMs).toISOString(),
      network: cip103NetworkId(network),
    } satisfies WalletOwnershipChallenge;
    // The message rules decide which domains and party ids are valid: throws TypeError for any other. The token's host
    // follows the text rules in both formats.
    buildWalletOwnershipMessage({ ...challenge, partyId });
    if (format === 'text') {
      const claims: ChallengeClaims = { ...challenge, partyId, sub: subject };
      return { challenge, token: sign(claims) };
    }
    const fields: WalletProofFields = {
      domain: args.proofDomain ?? purpose,
      network,
      partyId,
      investorContext: subject,
      idempotencyKey: challenge.nonce,
      issuedAt: challenge.issuedAt,
      expiresAt: challenge.expiresAt,
    };
    // Throws TypeError for a proof domain the wallet proof rules refuse.
    const message = buildWalletProofMessage(fields);
    const claims: ChallengeClaims = {
      ...challenge,
      network,
      partyId,
      sub: subject,
      format: WALLET_PROOF_FORMAT,
      proofDomain: fields.domain,
    };
    return { format: WALLET_PROOF_FORMAT, message, fields, token: sign(claims) };
  }

  /** The token for these claims. */
  function sign(claims: ChallengeClaims): string {
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${TOKEN_VERSION}.${body}.${mac(body)}`;
  }

  /** The verdict, and the party of a token this challenger issued (null for any other token). */
  async function check(
    args: WalletOwnershipVerifyArgs
  ): Promise<{ readonly verdict: WalletOwnershipVerdict; readonly partyId: string | null }> {
    const refuse = (reason: WalletOwnershipChallengeFailure): WalletOwnershipVerdict => ({
      verified: false,
      reason,
      message: CHALLENGE_FAILURE_TEXT[reason],
    });
    const claims = readClaims(args.token);
    if (claims === null) return { verdict: refuse('challenge-invalid'), partyId: null };
    const { partyId } = claims;
    if (claims.sub !== args.subject || claims.domain !== args.domain) {
      return { verdict: refuse('challenge-not-yours'), partyId };
    }
    const at = now();
    const expiresAtMs = Date.parse(claims.expiresAt);
    if (!(at.getTime() < expiresAtMs)) return { verdict: refuse('challenge-expired'), partyId };
    if (!(await nonceStore.spend(claims.nonce, expiresAtMs, at.getTime()))) {
      return { verdict: refuse('challenge-used'), partyId };
    }

    const result =
      claims.format === WALLET_PROOF_FORMAT && claims.proofDomain !== undefined
        ? verifyWalletProof({
            proof: args.proof,
            expected: {
              domain: claims.proofDomain,
              network: claims.network as DaNetwork,
              partyId: claims.partyId,
              investorContext: claims.sub,
              idempotencyKey: claims.nonce,
              issuedAt: claims.issuedAt,
              expiresAt: claims.expiresAt,
            },
            maxLifetimeMs: ttlMs,
            now: at,
          })
        : verifyWalletOwnership(args.proof, {
            expectedNonce: claims.nonce,
            expectedDomain: claims.domain,
            expectedNetwork: claims.network,
            expectedPartyId: claims.partyId,
            expectedIssuedAt: claims.issuedAt,
            expectedExpiresAt: claims.expiresAt,
            maxAgeMs: ttlMs,
            now: at,
          });
    if (!result.verified) {
      return { verdict: { verified: false, reason: result.reason, message: result.message }, partyId };
    }
    return {
      verdict: {
        verified: true,
        partyId: result.partyId,
        publicKeyFingerprint: result.publicKeyFingerprint,
        claimedNetwork: result.network ?? null,
        verifiedAt: at.toISOString(),
      },
      partyId,
    };
  }

  return {
    // One implementation behind the per-format overloads.
    issue: issue as WalletOwnershipChallenger['issue'],
    verify: async (args) => (await check(args)).verdict,

    async handleChallenge(request, { subject, trustedOrigins, format, proofDomain }) {
      const domain = walletOwnershipDomain(request, trustedOrigins);
      if (domain === null) return badRequest(UNTRUSTED_ORIGIN);
      const read = await readBody(request);
      if (read instanceof Response) return read;
      const { network, partyId } = read.body;
      if (!isDaNetwork(network)) return badRequest('network must be devnet or mainnet.');
      if (!isWalletOwnershipPartyId(partyId)) {
        return badRequest('partyId must be a Canton party id (hint::namespace).');
      }
      const formatArgs = {
        ...(format !== undefined && { format }),
        ...(proofDomain !== undefined && { proofDomain }),
      };
      return jsonResponse(200, { data: issue({ subject, domain, partyId, network, ...formatArgs }) });
    },

    async handleVerify(request, { subject, trustedOrigins, onVerdict }) {
      const domain = walletOwnershipDomain(request, trustedOrigins);
      if (domain === null) return badRequest(UNTRUSTED_ORIGIN);
      const read = await readBody(request);
      if (read instanceof Response) return read;
      const { token, proof } = read.body;
      if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
        return badRequest('token must be the challenge token.');
      }
      if (!isRecord(proof)) return badRequest('proof must be an object.');
      const { verdict, partyId } = await check({ token, proof, subject, domain });
      onVerdict?.(verdict, partyId);
      return jsonResponse(200, { data: verdict });
    },
  };
}
