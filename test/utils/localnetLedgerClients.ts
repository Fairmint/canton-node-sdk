/** Role-checked Ledger JSON API clients for either cn-quickstart LocalNet authentication mode. */

import { createHmac } from 'node:crypto';
import { CantonRuntime, LedgerJsonApiClient } from '../../src';

const LEDGER_API_URL = 'http://localhost:3975';
const OAUTH_TOKEN_URL = 'http://localhost:8082/realms/AppProvider/protocol/openid-connect/token';

let participantAdminClientPromise: Promise<LedgerJsonApiClient> | undefined;
let nonAdminClientPromise: Promise<LedgerJsonApiClient> | undefined;

/** Resolve a participant-admin client without assuming whether LocalNet uses shared-secret or OAuth2 authentication. */
export async function getLocalnetParticipantAdminLedgerClient(): Promise<LedgerJsonApiClient> {
  participantAdminClientPromise ??= resolveRoleCheckedClient(
    [createSharedSecretClient('ledger-api-user'), createOAuthAdminClient()],
    true
  );
  return participantAdminClientPromise;
}

/** Resolve an authenticated client that is positively verified not to hold the ParticipantAdmin right. */
export async function getLocalnetNonAdminLedgerClient(): Promise<LedgerJsonApiClient> {
  nonAdminClientPromise ??= resolveRoleCheckedClient(
    [createSharedSecretClient('app-provider'), createOAuthNonAdminClient()],
    false
  );
  return nonAdminClientPromise;
}

async function resolveRoleCheckedClient(
  candidates: readonly LedgerJsonApiClient[],
  requireParticipantAdmin: boolean
): Promise<LedgerJsonApiClient> {
  let lastAuthenticationError: unknown;

  for (const candidate of candidates) {
    let authenticated;
    try {
      authenticated = await candidate.getAuthenticatedUser({});
    } catch (error) {
      lastAuthenticationError = error;
      continue;
    }

    const rights = await candidate.listUserRights({ userId: authenticated.user.id });
    const hasParticipantAdmin =
      rights.rights?.some((right) => right.kind !== undefined && 'ParticipantAdmin' in right.kind) ?? false;
    if (hasParticipantAdmin !== requireParticipantAdmin) {
      throw new Error(
        `LocalNet fixture ${authenticated.user.id} ${
          requireParticipantAdmin ? 'does not have' : 'unexpectedly has'
        } ParticipantAdmin`
      );
    }
    return candidate;
  }

  if (lastAuthenticationError instanceof Error) {
    throw lastAuthenticationError;
  }
  throw new Error('Could not authenticate a role-checked LocalNet Ledger client');
}

function createOAuthAdminClient(): LedgerJsonApiClient {
  return new LedgerJsonApiClient(new CantonRuntime({ network: 'localnet', provider: 'app-provider' }));
}

function createOAuthNonAdminClient(): LedgerJsonApiClient {
  return new LedgerJsonApiClient(
    new CantonRuntime({
      network: 'localnet',
      provider: 'app-provider',
      authUrl: OAUTH_TOKEN_URL,
      apis: {
        LEDGER_JSON_API: {
          apiUrl: LEDGER_API_URL,
          auth: {
            grantType: 'password',
            clientId: 'app-provider-unsafe',
            username: 'app-provider',
            password: 'abc123',
            scope: 'openid',
          },
        },
      },
    })
  );
}

/** Create a client for cn-quickstart's intentionally unsafe, test-only HS256 authentication mode. */
function createSharedSecretClient(subject: string): LedgerJsonApiClient {
  const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: subject, aud: 'https://canton.network.global' });
  const unsignedToken = `${header}.${payload}`;
  const signature = createHmac('sha256', 'unsafe').update(unsignedToken).digest('base64url');

  return new LedgerJsonApiClient(
    new CantonRuntime({
      network: 'localnet',
      provider: 'app-provider',
      authUrl: '',
      apis: {
        LEDGER_JSON_API: {
          apiUrl: LEDGER_API_URL,
          auth: {
            grantType: 'client_credentials',
            clientId: `shared-secret-${subject}`,
            bearerToken: `${unsignedToken}.${signature}`,
          },
        },
      },
    })
  );
}
