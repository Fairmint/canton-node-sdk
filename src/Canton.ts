import { LedgerJsonApiClient, ScanApiClient, ValidatorApiClient } from './clients';
import { type PartyId } from './core/branded-types';
import { type Logger } from './core/logging';
import { CantonRuntime } from './core/runtime';
import { type ClientConfig, type NetworkType, type ProviderType } from './core/types';

export type CantonHealthService = 'ledger' | 'validator' | 'scan';

/** Options for one-shot Canton service health checks. */
export interface CantonHealthCheckOptions {
  /** Services to check. Defaults to ledger, validator, and scan. */
  readonly services?: readonly CantonHealthService[];
}

/** Health check result for one Canton service. */
export interface CantonServiceHealthStatus {
  /** True when every probe for this service succeeded. */
  readonly ok: boolean;
  /** Readiness probe result, when the service exposes a readiness endpoint. */
  readonly ready?: boolean;
  /** Liveness probe result, when the service exposes a liveness endpoint. */
  readonly live?: boolean;
  /** Version response, when the service exposes a version endpoint. */
  readonly version?: unknown;
  /** Status response, when the service exposes a status endpoint. */
  readonly status?: unknown;
  /** Combined probe error messages when one or more probes failed. */
  readonly error?: string;
}

/** Combined health check result for selected Canton services. */
export interface ServiceHealthStatus {
  /** True when every selected service is healthy. */
  readonly ok: boolean;
  /** ISO timestamp for when the check completed. */
  readonly checkedAt: string;
  /** Per-service health results. */
  readonly services: Partial<Record<CantonHealthService, CantonServiceHealthStatus>>;
}

type ProbeResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Configuration for the Canton unified client. Initializes all clients with shared settings.
 *
 * Only `network` is required; all other fields are optional and fall back to environment variables.
 */
export interface CantonConfig {
  /** Network to connect to. */
  readonly network: NetworkType;
  /** Provider identifier (e.g., '5n' for 5 Nodes). */
  readonly provider?: ProviderType;
  /** Logger instance. */
  readonly logger?: Logger;
  /**
   * Enable debug mode with verbose console logging. Logs all API requests/responses. Can also be enabled via
   * CANTON_DEBUG=1 environment variable.
   */
  readonly debug?: boolean;
  /** Party ID for authenticated operations. */
  readonly partyId?: string;
  /** User ID for authenticated operations. */
  readonly userId?: string;
  /** Parties this client can act on behalf of. */
  readonly managedParties?: readonly string[];
  /** OAuth2 auth URL (if different from default). */
  readonly authUrl?: string;
  /** Override API endpoints or timeouts per service (`ledgerJsonApi`, `validatorApi`, `scanApi`). */
  readonly apis?: ClientConfig['apis'];
}

/**
 * Unified entry point for Canton blockchain operations.
 *
 * Provides a single constructor that initializes all API clients (ledger, validator, scan) with shared configuration.
 *
 * @example
 *   import { Canton, createParty } from '@fairmint/canton-node-sdk';
 *
 *   const canton = new Canton({ network: 'localnet' });
 *
 *   const { partyId } = await createParty({
 *     ledgerClient: canton.ledger,
 *     validatorClient: canton.validator,
 *     partyName: 'alice',
 *     amount: '100',
 *   });
 *
 *   const version = await canton.ledger.getVersion();
 *   const balance = await canton.validator.getWalletBalance();
 */
export class Canton {
  /** Shared runtime for all clients created by this Canton instance. */
  public readonly runtime: CantonRuntime;

  /** Ledger JSON API client for ledger operations. */
  public readonly ledger: LedgerJsonApiClient;

  /** Validator API client for wallet and user operations. */
  public readonly validator: ValidatorApiClient;

  /** Scan API client for public network queries (unauthenticated). */
  public readonly scan: ScanApiClient;

  private readonly config: CantonConfig;

  /**
   * Creates a new Canton unified client.
   *
   * @example
   *   const canton = new Canton({ network: 'localnet' });
   *
   * @example
   *   const canton = new Canton({
   *     network: 'devnet',
   *     provider: '5n',
   *     debug: true,
   *   });
   *
   * @param config - Connection targets (`network`, optional `provider`) plus identity/logging/API overrides.
   */
  constructor(config: CantonConfig) {
    this.config = config;

    // Build shared client config from CantonConfig, omitting undefined values
    const clientConfig = buildClientConfig(config);
    this.runtime = new CantonRuntime(clientConfig);

    this.ledger = new LedgerJsonApiClient(this.runtime);
    this.validator = new ValidatorApiClient(this.runtime);
    this.scan = new ScanApiClient(this.runtime);
  }

  /** Gets the current network. */
  public getNetwork(): NetworkType {
    return this.config.network;
  }

  /** Gets the current provider. */
  public getProvider(): ProviderType | undefined {
    return this.config.provider;
  }

  /** Gets the current party ID from config or ledger client. */
  public getPartyId(): PartyId {
    if (this.config.partyId) {
      return this.config.partyId as PartyId;
    }
    return this.ledger.getPartyId();
  }

  /** Sets the party ID for authenticated clients. Useful when party ID is discovered at runtime. */
  public setPartyId(partyId: PartyId | string): void {
    this.ledger.setPartyId(partyId);
    this.validator.setPartyId(partyId);
  }

  /**
   * Checks configured Canton services without waiting or throwing on partial failures.
   *
   * Ledger health is represented by the JSON API version endpoint because this checkout does not expose a JSON API
   * readiness/liveness operation. Validator and Scan use their readiness/liveness endpoints.
   */
  public async checkHealth(options: CantonHealthCheckOptions = {}): Promise<ServiceHealthStatus> {
    const servicesToCheck = options.services ?? (['ledger', 'validator', 'scan'] as const);
    const services: Partial<Record<CantonHealthService, CantonServiceHealthStatus>> = {};

    await Promise.all(
      servicesToCheck.map(async (service) => {
        switch (service) {
          case 'ledger':
            services.ledger = await this.checkLedgerHealth();
            return;
          case 'validator':
            services.validator = await this.checkValidatorHealth();
            return;
          case 'scan':
            services.scan = await this.checkScanHealth();
            return;
          default:
            throw new Error(`Unknown Canton health service: ${String(service)}`);
        }
      })
    );

    return {
      ok: Object.values(services).every((service) => service.ok),
      checkedAt: new Date().toISOString(),
      services,
    };
  }

  private async checkLedgerHealth(): Promise<CantonServiceHealthStatus> {
    const version = await probe(async () => this.ledger.getVersion());
    return {
      ok: version.ok,
      ...(version.ok ? { version: version.value } : { error: version.error }),
    };
  }

  private async checkValidatorHealth(): Promise<CantonServiceHealthStatus> {
    const [ready, live] = await Promise.all([
      probe(async () => this.validator.isReady()),
      probe(async () => this.validator.isLive()),
    ]);
    const errors = collectErrors(ready, live);

    return {
      ok: ready.ok && live.ok,
      ready: ready.ok,
      live: live.ok,
      ...(errors.length > 0 ? { error: errors.join('; ') } : {}),
    };
  }

  private async checkScanHealth(): Promise<CantonServiceHealthStatus> {
    const [ready, live, status] = await Promise.all([
      probe(async () => this.scan.isReady()),
      probe(async () => this.scan.isLive()),
      probe(async () => this.scan.getHealthStatus()),
    ]);
    const errors = collectErrors(ready, live, status);

    return {
      ok: ready.ok && live.ok && status.ok,
      ready: ready.ok,
      live: live.ok,
      ...(status.ok ? { status: status.value } : {}),
      ...(errors.length > 0 ? { error: errors.join('; ') } : {}),
    };
  }
}

/** Builds a ClientConfig from CantonConfig, omitting undefined values to preserve exactOptionalPropertyTypes. */
function buildClientConfig(config: CantonConfig): ClientConfig {
  const clientConfig: ClientConfig = { network: config.network };

  if (config.provider !== undefined) clientConfig.provider = config.provider;
  if (config.logger !== undefined) clientConfig.logger = config.logger;
  if (config.debug !== undefined) clientConfig.debug = config.debug;
  if (config.partyId !== undefined) clientConfig.partyId = config.partyId;
  if (config.userId !== undefined) clientConfig.userId = config.userId;
  if (config.managedParties !== undefined) clientConfig.managedParties = [...config.managedParties];
  if (config.authUrl !== undefined) clientConfig.authUrl = config.authUrl;
  if (config.apis !== undefined) clientConfig.apis = { ...config.apis };

  return clientConfig;
}

async function probe<T>(operation: () => Promise<T>): Promise<ProbeResult<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    return { ok: false, error: formatHealthError(error) };
  }
}

function collectErrors(...results: ReadonlyArray<ProbeResult<unknown>>): string[] {
  return results.flatMap((result) => (result.ok ? [] : [result.error]));
}

function formatHealthError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
