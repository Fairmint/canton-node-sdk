import { LedgerJsonApiClient, ScanApiClient, ValidatorApiClient } from './clients';
import { type ClientConfig, type NetworkType, type ProviderType } from './core/types';
import { type Logger } from './core/logging';

/**
 * Configuration for the Canton unified client.
 * Simplified configuration that initializes all clients with shared settings.
 */
export interface CantonConfig {
  /** Network to connect to */
  network: NetworkType;
  /** Optional provider identifier (e.g., '5n' for 5 Nodes) */
  provider?: ProviderType;
  /** Optional logger instance */
  logger?: Logger;
  /**
   * Enable debug mode with verbose console logging.
   * When true, logs all API requests/responses to console.
   * Can also be enabled via CANTON_DEBUG=1 environment variable.
   */
  debug?: boolean;
  /** Party ID for authenticated operations */
  partyId?: string;
  /** User ID for authenticated operations */
  userId?: string;
  /** List of parties this client can act on behalf of */
  managedParties?: string[];
  /** OAuth2 auth URL (if different from default) */
  authUrl?: string;
  /** Override API configurations */
  apis?: ClientConfig['apis'];
}

/**
 * Unified entry point for Canton blockchain operations.
 *
 * The Canton class provides a simplified interface for initializing all Canton
 * API clients with shared configuration, while still allowing direct access
 * to the low-level clients.
 *
 * For high-level operations, use the utility functions from `@fairmint/canton-node-sdk`:
 * - `createParty()` - Create and fund a new party
 * - `createTransferOffer()` / `acceptTransferOffer()` - Transfer amulets
 * - `preApproveTransfers()` / `transferToPreapproved()` - Pre-approved transfers
 * - `createExternalParty()` - External signing party creation
 *
 * @example
 *   import { Canton, createParty, createTransferOffer } from '@fairmint/canton-node-sdk';
 *
 *   // Initialize with network configuration
 *   const canton = new Canton({ network: 'localnet' });
 *
 *   // Use utility functions with the clients
 *   const { partyId } = await createParty({
 *     ledgerClient: canton.ledger,
 *     validatorClient: canton.validator,
 *     partyName: 'alice',
 *     amount: '100',
 *   });
 *
 *   // Or access low-level clients directly
 *   const version = await canton.ledger.getVersion();
 *   const balance = await canton.validator.getWalletBalance();
 */
export class Canton {
  /** Low-level Ledger JSON API client for ledger operations */
  public readonly ledger: LedgerJsonApiClient;

  /** Low-level Validator API client for wallet and user operations */
  public readonly validator: ValidatorApiClient;

  /** Low-level Scan API client for public network queries (unauthenticated) */
  public readonly scan: ScanApiClient;

  private readonly config: CantonConfig;

  /**
   * Creates a new Canton unified client.
   *
   * @param config - Configuration options for the Canton client
   *
   * @example
   *   // Basic initialization
   *   const canton = new Canton({ network: 'localnet' });
   *
   *   // With provider and logging
   *   const canton = new Canton({
   *     network: 'devnet',
   *     provider: '5n',
   *     logger: new FileLogger(),
   *   });
   */
  constructor(config: CantonConfig) {
    this.config = config;

    // Build shared client config, only including defined properties
    const clientConfig: ClientConfig = {
      network: config.network,
    };

    if (config.provider !== undefined) {
      clientConfig.provider = config.provider;
    }
    if (config.logger !== undefined) {
      clientConfig.logger = config.logger;
    }
    if (config.debug !== undefined) {
      clientConfig.debug = config.debug;
    }
    if (config.partyId !== undefined) {
      clientConfig.partyId = config.partyId;
    }
    if (config.userId !== undefined) {
      clientConfig.userId = config.userId;
    }
    if (config.managedParties !== undefined) {
      clientConfig.managedParties = config.managedParties;
    }
    if (config.authUrl !== undefined) {
      clientConfig.authUrl = config.authUrl;
    }
    if (config.apis !== undefined) {
      clientConfig.apis = config.apis;
    }

    // Initialize low-level clients
    this.ledger = new LedgerJsonApiClient(clientConfig);
    this.validator = new ValidatorApiClient(clientConfig);

    // Scan API client config (subset of options)
    const scanConfig: { network: NetworkType; provider?: ProviderType; logger?: Logger; debug?: boolean } = {
      network: config.network,
    };
    if (config.provider !== undefined) {
      scanConfig.provider = config.provider;
    }
    if (config.logger !== undefined) {
      scanConfig.logger = config.logger;
    }
    if (config.debug !== undefined) {
      scanConfig.debug = config.debug;
    }

    this.scan = new ScanApiClient(scanConfig);
  }

  /**
   * Gets the current network.
   */
  public getNetwork(): NetworkType {
    return this.config.network;
  }

  /**
   * Gets the current provider.
   */
  public getProvider(): ProviderType | undefined {
    return this.config.provider;
  }

  /**
   * Gets the current party ID from config or ledger client.
   */
  public getPartyId(): string {
    return this.config.partyId ?? this.ledger.getPartyId();
  }

  /**
   * Sets the party ID for authenticated clients.
   *
   * Useful for LocalNet where party ID is discovered at runtime after
   * client initialization.
   */
  public setPartyId(partyId: string): void {
    this.ledger.setPartyId(partyId);
    this.validator.setPartyId(partyId);
  }
}
