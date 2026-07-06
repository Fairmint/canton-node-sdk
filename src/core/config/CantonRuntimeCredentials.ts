import { ConfigurationError } from '../errors';
import { type ApiConfig, type AuthConfig, type ClientConfig, type NetworkType, type ProviderType } from '../types';

const CANTON_RUNTIME_ENV_SEGMENT_REGEX = /^[A-Za-z0-9_-]+$/;

/** Env-var suffixes used for explicit Canton runtime credentials. */
export const CANTON_RUNTIME_CREDENTIAL_ENV_SUFFIXES = [
  'PARTY_ID',
  'USER_ID',
  'VALIDATOR_ADMIN_TOKEN',
  'VALIDATOR_JSON_API_ENDPOINT',
  'LEDGER_JSON_API_ENDPOINT',
  'SPLICE_SCAN_API_ENDPOINT',
] as const;

/** Supported env-var suffix for explicit Canton runtime credentials. */
export type CantonRuntimeCredentialEnvSuffix = (typeof CANTON_RUNTIME_CREDENTIAL_ENV_SUFFIXES)[number];

/** Env-var prefix emitted for one network/provider runtime credential set. */
export type CantonRuntimeCredentialEnvPrefix = `CANTON_${string}_${string}`;

/** Env-var key emitted for one network/provider runtime credential set. */
export type CantonRuntimeCredentialEnvKey = `${CantonRuntimeCredentialEnvPrefix}_${CantonRuntimeCredentialEnvSuffix}`;

/** Env-var map for one explicit Canton runtime credential set. */
export type CantonRuntimeCredentialEnvMap = Readonly<Record<CantonRuntimeCredentialEnvKey, string>>;

/** Raw Canton runtime credential values loaded by an application from SSM, env, or another explicit source. */
export interface CantonRuntimeCredentialsInput {
  readonly partyId: string;
  readonly userId: string;
  readonly validatorAdminToken: string;
  readonly validatorJsonApiEndpoint: string;
  readonly ledgerJsonApiEndpoint: string;
  readonly spliceScanApiEndpoint: string;
}

/** Normalized, validated Canton runtime credential values. */
export interface CantonRuntimeCredentials {
  readonly partyId: string;
  readonly userId: string;
  readonly validatorAdminToken: string;
  readonly validatorJsonApiEndpoint: string;
  readonly ledgerJsonApiEndpoint: string;
  readonly spliceScanApiEndpoint: string;
}

/** Target network/provider prefix for emitted Canton runtime credential env keys. */
export interface CantonRuntimeCredentialTarget {
  readonly network: NetworkType;
  readonly provider: ProviderType;
}

/** Options for emitting a Canton runtime credential env map. */
export interface CantonRuntimeCredentialEnvMapOptions extends CantonRuntimeCredentialTarget {
  readonly credentials: CantonRuntimeCredentialsInput;
}

/** Options for building an explicit SDK client config from Canton runtime credentials. */
export interface CantonRuntimeCredentialClientConfigOptions extends CantonRuntimeCredentialTarget {
  readonly credentials: CantonRuntimeCredentialsInput;
}

const CANTON_RUNTIME_CREDENTIAL_FIELD_BY_SUFFIX: Record<
  CantonRuntimeCredentialEnvSuffix,
  keyof CantonRuntimeCredentials
> = {
  PARTY_ID: 'partyId',
  USER_ID: 'userId',
  VALIDATOR_ADMIN_TOKEN: 'validatorAdminToken',
  VALIDATOR_JSON_API_ENDPOINT: 'validatorJsonApiEndpoint',
  LEDGER_JSON_API_ENDPOINT: 'ledgerJsonApiEndpoint',
  SPLICE_SCAN_API_ENDPOINT: 'spliceScanApiEndpoint',
};

/**
 * Normalize and validate one explicit Canton runtime credential set.
 *
 * This helper is intentionally pure: it does not read from or write to `process.env`.
 */
export function normalizeCantonRuntimeCredentials(
  credentials: CantonRuntimeCredentialsInput
): CantonRuntimeCredentials {
  return {
    partyId: normalizeRequiredString('partyId', credentials.partyId),
    userId: normalizeRequiredString('userId', credentials.userId),
    validatorAdminToken: normalizeRequiredString('validatorAdminToken', credentials.validatorAdminToken),
    validatorJsonApiEndpoint: normalizeHttpEndpoint('validatorJsonApiEndpoint', credentials.validatorJsonApiEndpoint),
    ledgerJsonApiEndpoint: normalizeHttpEndpoint('ledgerJsonApiEndpoint', credentials.ledgerJsonApiEndpoint),
    spliceScanApiEndpoint: normalizeHttpEndpoint('spliceScanApiEndpoint', credentials.spliceScanApiEndpoint),
  };
}

/** Build the env-var keys for one network/provider Canton runtime credential prefix. */
export function buildCantonRuntimeCredentialEnvKeys(
  target: CantonRuntimeCredentialTarget
): readonly CantonRuntimeCredentialEnvKey[] {
  const prefix = buildCantonRuntimeCredentialEnvPrefix(target);
  return CANTON_RUNTIME_CREDENTIAL_ENV_SUFFIXES.map((suffix) => buildCantonRuntimeCredentialEnvKey(prefix, suffix));
}

/**
 * Emit an env-var map for one explicit Canton runtime credential set.
 *
 * Callers can pass the returned map through their own runtime boundary without mutating global process state.
 */
export function buildCantonRuntimeCredentialEnvMap(
  options: CantonRuntimeCredentialEnvMapOptions
): CantonRuntimeCredentialEnvMap {
  const credentials = normalizeCantonRuntimeCredentials(options.credentials);
  const prefix = buildCantonRuntimeCredentialEnvPrefix(options);
  const envMap: Partial<Record<CantonRuntimeCredentialEnvKey, string>> = {};

  for (const suffix of CANTON_RUNTIME_CREDENTIAL_ENV_SUFFIXES) {
    const envKey = buildCantonRuntimeCredentialEnvKey(prefix, suffix);
    const credentialField = CANTON_RUNTIME_CREDENTIAL_FIELD_BY_SUFFIX[suffix];
    envMap[envKey] = credentials[credentialField];
  }

  return envMap as CantonRuntimeCredentialEnvMap;
}

/**
 * Build an explicit SDK client config from Canton runtime credentials.
 *
 * This avoids environment lookup entirely for the SDK clients configured here.
 */
export function buildCantonRuntimeCredentialClientConfig(
  options: CantonRuntimeCredentialClientConfigOptions
): ClientConfig {
  const credentials = normalizeCantonRuntimeCredentials(options.credentials);
  const adminTokenAuth = buildBearerTokenAuth(credentials.validatorAdminToken);

  return {
    network: options.network,
    provider: options.provider,
    partyId: credentials.partyId,
    userId: credentials.userId,
    apis: {
      LEDGER_JSON_API: buildApiConfig(credentials.ledgerJsonApiEndpoint, credentials, adminTokenAuth),
      VALIDATOR_API: buildApiConfig(credentials.validatorJsonApiEndpoint, credentials, adminTokenAuth),
      SCAN_API: buildApiConfig(credentials.spliceScanApiEndpoint, credentials, buildNoAuthConfig()),
    },
  };
}

function buildCantonRuntimeCredentialEnvPrefix(
  target: CantonRuntimeCredentialTarget
): CantonRuntimeCredentialEnvPrefix {
  const network = normalizeEnvSegment('network', target.network);
  const provider = normalizeEnvSegment('provider', target.provider);
  return `CANTON_${network}_${provider}`;
}

function buildCantonRuntimeCredentialEnvKey(
  prefix: CantonRuntimeCredentialEnvPrefix,
  suffix: CantonRuntimeCredentialEnvSuffix
): CantonRuntimeCredentialEnvKey {
  return `${prefix}_${suffix}`;
}

function buildApiConfig(apiUrl: string, credentials: CantonRuntimeCredentials, auth: AuthConfig): ApiConfig {
  return {
    apiUrl,
    auth,
    partyId: credentials.partyId,
    userId: credentials.userId,
  };
}

function buildBearerTokenAuth(token: string): AuthConfig {
  return {
    grantType: 'client_credentials',
    clientId: '',
    bearerToken: token,
  };
}

function buildNoAuthConfig(): AuthConfig {
  return {
    grantType: 'client_credentials',
    clientId: '',
  };
}

function normalizeHttpEndpoint(name: string, value: string): string {
  const normalized = trimTrailingSlashes(normalizeRequiredString(name, value));

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Unsupported protocol');
    }
  } catch {
    throw new ConfigurationError(`Invalid Canton runtime credential ${name}: expected an http(s) URL`);
  }

  return normalized;
}

function normalizeRequiredString(name: string, value: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new ConfigurationError(`Missing Canton runtime credential: ${name}`);
  }
  return normalized;
}

function normalizeEnvSegment(name: string, value: string): string {
  const normalized = normalizeRequiredString(name, value).toUpperCase();
  if (!CANTON_RUNTIME_ENV_SEGMENT_REGEX.test(normalized)) {
    throw new ConfigurationError(
      `Invalid Canton runtime credential ${name}: expected only letters, numbers, underscores, and hyphens`
    );
  }
  return normalized;
}

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return value.slice(0, end);
}
