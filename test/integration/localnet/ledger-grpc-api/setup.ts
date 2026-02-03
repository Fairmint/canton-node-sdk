/**
 * Shared setup for LedgerGrpcClient integration tests.
 *
 * The gRPC Ledger API runs on port 3901 for app-provider in localnet.
 * Authentication uses OAuth2 via Keycloak.
 */

import axios from 'axios';

import { type GrpcClientConfig, LedgerGrpcClient } from '../../../../src/clients/ledger-grpc-api';

/** LocalNet OAuth2 configuration for app-provider. */
const OAUTH2_CONFIG = {
  tokenUrl: 'http://localhost:8082/realms/AppProvider/protocol/openid-connect/token',
  clientId: 'app-provider-validator',
  clientSecret: 'app-provider-validator-secret',
};

/** LocalNet gRPC endpoint for app-provider participant. */
const GRPC_ENDPOINT = 'localhost:3901';

let client: LedgerGrpcClient | null = null;
let accessToken: string | null = null;

/**
 * Get an OAuth2 access token for the gRPC client.
 */
async function getAccessToken(): Promise<string> {
  if (accessToken) {
    return accessToken;
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', OAUTH2_CONFIG.clientId);
  params.append('client_secret', OAUTH2_CONFIG.clientSecret);

  const response = await axios.post(OAUTH2_CONFIG.tokenUrl, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  accessToken = response.data.access_token;
  return accessToken as string;
}

/**
 * Build gRPC client configuration for localnet.
 */
export async function buildGrpcClientConfig(): Promise<GrpcClientConfig> {
  const token = await getAccessToken();

  return {
    endpoint: GRPC_ENDPOINT,
    useTls: false,
    accessToken: token,
    timeoutMs: 30000,
  };
}

/**
 * Get the shared LedgerGrpcClient instance for tests.
 * Creates the client on first call, reuses it for subsequent calls.
 */
export async function getClient(): Promise<LedgerGrpcClient> {
  if (!client) {
    const config = await buildGrpcClientConfig();
    client = new LedgerGrpcClient(config);
  }
  return client;
}

/**
 * Close the shared client connection.
 * Call this in afterAll() to clean up resources.
 */
export function closeClient(): void {
  if (client) {
    client.close();
    client = null;
  }
  accessToken = null;
}
