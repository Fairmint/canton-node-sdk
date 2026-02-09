import { LedgerJsonApiClient, ScanApiClient, ValidatorApiClient } from './clients';
import { type PartyId } from './core/branded-types';
import { type Logger } from './core/logging';
import { type ClientConfig, type NetworkType, type ProviderType } from './core/types';

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
  /** Override API configurations per client type. */
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
   *   const canton = new Canton({
   *     network: 'devnet',
   *     provider: '5n',
   *     debug: true,
   *   });
   */
  constructor(config: CantonConfig) {
    this.config = config;

    // Build shared client config from CantonConfig, omitting undefined values
    const clientConfig = buildClientConfig(config);

    this.ledger = new LedgerJsonApiClient(clientConfig);
    this.validator = new ValidatorApiClient(clientConfig);
    this.scan = new ScanApiClient(clientConfig);
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
  if (config.apis !== undefined) clientConfig.apis = config.apis;

  return clientConfig;
}
