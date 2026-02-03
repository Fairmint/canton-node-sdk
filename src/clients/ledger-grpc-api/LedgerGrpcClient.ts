/**
 * gRPC client for the Canton Ledger API.
 *
 * This client provides direct access to the Ledger API via gRPC,
 * offering better performance than the JSON API for high-throughput scenarios.
 *
 * @see https://docs.digitalasset.com/build/3.4/reference/lapi-proto-docs.html
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';

import { type GrpcClientConfig, GrpcError } from './services/base';
import { type Commands, type Command } from './types/commands';
import { type Transaction } from './types/transactions';
import { type Identifier } from './types/value';

/** Path to the proto files. */
const PROTO_BASE_PATH = path.resolve(
  __dirname,
  '../../../libs/splice/canton/community/ledger-api/src/main/protobuf'
);

/** Proto loader options optimized for TypeScript. */
const PROTO_OPTIONS: protoLoader.Options = {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

/** Version information from the Ledger API. */
export interface LedgerApiVersion {
  version: string;
  features?: {
    userManagement?: {
      supported: boolean;
      maxRightsPerUser: number;
      maxUsersPageSize: number;
    };
    partyManagement?: {
      maxPartiesPageSize: number;
    };
  };
}

/** Response from SubmitAndWait. */
export interface SubmitAndWaitResponse {
  updateId: string;
  completionOffset: number;
}

/** Response from SubmitAndWaitForTransaction. */
export interface SubmitAndWaitForTransactionResponse {
  transaction: Transaction;
}

/** Filter for transaction streams. */
export interface TransactionFilter {
  filtersByParty: Record<string, PartyFilter>;
}

/** Filter configuration for a party. */
export interface PartyFilter {
  cumulative?: CumulativeFilter[];
}

/** Cumulative filter for templates/interfaces. */
export interface CumulativeFilter {
  templateFilter?: TemplateFilter;
  interfaceFilter?: InterfaceFilter;
  wildcardFilter?: WildcardFilter;
}

/** Filter by template. */
export interface TemplateFilter {
  templateId: Identifier;
  includeCreatedEventBlob: boolean;
}

/** Filter by interface. */
export interface InterfaceFilter {
  interfaceId: Identifier;
  includeInterfaceView: boolean;
  includeCreatedEventBlob: boolean;
}

/** Wildcard filter (matches all templates). */
export interface WildcardFilter {
  includeCreatedEventBlob: boolean;
}

/** Options for getting active contracts. */
export interface GetActiveContractsOptions {
  filter: TransactionFilter;
  verbose?: boolean;
  activeAtOffset?: number;
}

/** Request for subscribing to updates. */
export interface GetUpdatesRequest {
  beginExclusive: number;
  endInclusive?: number;
  filter: TransactionFilter;
  verbose?: boolean;
}

/**
 * gRPC client for the Canton Ledger API.
 *
 * Provides direct gRPC access to all Ledger API services including:
 * - Version Service
 * - Command Service (submit and wait)
 * - Command Submission Service (async submit)
 * - State Service (active contracts, ledger end)
 * - Update Service (transaction streams)
 * - Package Service
 * - Party Management Service
 * - User Management Service
 *
 * @example
 * ```typescript
 * const client = new LedgerGrpcClient({
 *   endpoint: 'localhost:6865',
 *   accessToken: 'your-token',
 * });
 *
 * // Get version
 * const version = await client.getVersion();
 *
 * // Submit a command
 * const result = await client.submitAndWait({
 *   userId: 'alice',
 *   commandId: 'cmd-1',
 *   actAs: ['Alice::1234'],
 *   commands: [{ create: { templateId, createArguments } }],
 * });
 * ```
 */
export class LedgerGrpcClient {
  private readonly config: GrpcClientConfig;
  private readonly credentials: grpc.ChannelCredentials;
  private metadata: grpc.Metadata;
  private readonly services: Map<string, grpc.Client> = new Map();

  constructor(config: GrpcClientConfig) {
    this.config = config;
    this.credentials = this.createCredentials();
    this.metadata = this.createMetadata();
  }

  /** Create gRPC credentials. */
  private createCredentials(): grpc.ChannelCredentials {
    if (!this.config.useTls) {
      return grpc.credentials.createInsecure();
    }
    return grpc.credentials.createSsl();
  }

  /** Create metadata with authentication. */
  private createMetadata(): grpc.Metadata {
    const metadata = new grpc.Metadata();
    if (this.config.accessToken) {
      metadata.set('authorization', `Bearer ${this.config.accessToken}`);
    }
    return metadata;
  }

  /** Update the access token. */
  public updateAccessToken(token: string): void {
    this.config.accessToken = token;
    this.metadata = this.createMetadata();
  }

  /** Get timeout in ms. */
  private get timeoutMs(): number {
    return this.config.timeoutMs ?? 30000;
  }

  /** Create a deadline. */
  private createDeadline(): grpc.Deadline {
    return Date.now() + this.timeoutMs;
  }

  /** Load a service client. */
  private async getService<T extends grpc.Client>(
    protoFile: string,
    servicePath: string
  ): Promise<T> {
    const cacheKey = `${protoFile}:${servicePath}`;

    if (this.services.has(cacheKey)) {
      return this.services.get(cacheKey) as T;
    }

    const protoPath = path.join(PROTO_BASE_PATH, protoFile);

    const packageDefinition = await protoLoader.load(protoPath, {
      ...PROTO_OPTIONS,
      includeDirs: [PROTO_BASE_PATH],
    });

    const proto = grpc.loadPackageDefinition(packageDefinition);

    // Navigate to the service using the path
    let service: unknown = proto;
    for (const part of servicePath.split('.')) {
      service = (service as Record<string, unknown>)[part];
    }

    const ServiceConstructor = service as grpc.ServiceClientConstructor;
    const client = new ServiceConstructor(
      this.config.endpoint,
      this.credentials
    ) as unknown as T;

    this.services.set(cacheKey, client);
    return client;
  }

  /** Make a unary call. */
  private async unaryCall<TRequest, TResponse>(
    client: grpc.Client,
    method: string,
    request: TRequest
  ): Promise<TResponse> {
    return new Promise((resolve, reject) => {
      const clientObj = client as unknown as Record<string, unknown>;
      const methodFn = clientObj[method] as (
        request: TRequest,
        metadata: grpc.Metadata,
        options: { deadline: grpc.Deadline },
        callback: (error: grpc.ServiceError | null, response: TResponse) => void
      ) => void;

      if (typeof methodFn !== 'function') {
        reject(new Error(`Method ${method} not found on client`));
        return;
      }

      methodFn.call(
        client,
        request,
        this.metadata,
        { deadline: this.createDeadline() },
        (error, response) => {
          if (error) {
            reject(new GrpcError(error));
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  // ==================== Version Service ====================

  /**
   * Get the Ledger API version.
   */
  public async getVersion(): Promise<LedgerApiVersion> {
    const client = await this.getService(
      'com/daml/ledger/api/v2/version_service.proto',
      'com.daml.ledger.api.v2.VersionService'
    );

    const response = await this.unaryCall<Record<string, never>, { version: string }>(
      client,
      'getLedgerApiVersion',
      {}
    );

    return {
      version: response.version,
    };
  }

  // ==================== Command Service ====================

  /**
   * Submit commands and wait for the result.
   *
   * @param commands - The commands to submit
   * @returns The update ID and completion offset
   */
  public async submitAndWait(commands: Commands): Promise<SubmitAndWaitResponse> {
    const client = await this.getService(
      'com/daml/ledger/api/v2/command_service.proto',
      'com.daml.ledger.api.v2.CommandService'
    );

    const response = await this.unaryCall<
      { commands: unknown },
      { updateId: string; completionOffset: string }
    >(client, 'submitAndWait', { commands: this.convertCommands(commands) });

    return {
      updateId: response.updateId,
      completionOffset: parseInt(response.completionOffset, 10),
    };
  }

  /**
   * Submit commands and wait for the resulting transaction.
   *
   * @param commands - The commands to submit
   * @param filter - Optional transaction filter
   * @returns The resulting transaction
   */
  public async submitAndWaitForTransaction(
    commands: Commands,
    filter?: TransactionFilter
  ): Promise<SubmitAndWaitForTransactionResponse> {
    const client = await this.getService(
      'com/daml/ledger/api/v2/command_service.proto',
      'com.daml.ledger.api.v2.CommandService'
    );

    interface RawResponse {
      transaction: Transaction;
    }

    const response = await this.unaryCall<
      { commands: unknown; transactionFormat?: unknown },
      RawResponse
    >(client, 'submitAndWaitForTransaction', {
      commands: this.convertCommands(commands),
      transactionFormat: filter ? { eventFormat: { filtersByParty: filter.filtersByParty } } : undefined,
    });

    return {
      transaction: response.transaction,
    };
  }

  // ==================== State Service ====================

  /**
   * Get the current ledger end offset.
   *
   * @returns The current ledger end offset
   */
  public async getLedgerEnd(): Promise<number> {
    const client = await this.getService(
      'com/daml/ledger/api/v2/state_service.proto',
      'com.daml.ledger.api.v2.StateService'
    );

    const response = await this.unaryCall<Record<string, never>, { offset: string }>(
      client,
      'getLedgerEnd',
      {}
    );

    return parseInt(response.offset, 10);
  }

  /**
   * Get active contracts matching the filter.
   *
   * Note: This returns a stream. Use subscribeToActiveContracts for streaming.
   *
   * @param options - Filter and options for the query
   * @returns Array of active contracts
   */
  public async getActiveContracts(
    options: GetActiveContractsOptions
  ): Promise<{ contracts: unknown[]; offset: number }> {
    const client = await this.getService(
      'com/daml/ledger/api/v2/state_service.proto',
      'com.daml.ledger.api.v2.StateService'
    );

    // For streaming responses, we collect all chunks
    return new Promise((resolve, reject) => {
      const contracts: unknown[] = [];
      let offset = 0;

      const clientObj = client as unknown as Record<string, unknown>;
      const methodFn = clientObj['getActiveContracts'] as (
        request: unknown,
        metadata: grpc.Metadata
      ) => grpc.ClientReadableStream<{ contractEntry?: unknown; offset?: string }>;

      if (typeof methodFn !== 'function') {
        reject(new Error('getActiveContracts method not found'));
        return;
      }

      const stream = methodFn.call(client, {
        filter: options.filter,
        verbose: options.verbose ?? false,
        activeAtOffset: options.activeAtOffset,
      }, this.metadata);

      stream.on('data', (chunk: { contractEntry?: unknown; offset?: string }) => {
        if (chunk.contractEntry) {
          contracts.push(chunk.contractEntry);
        }
        if (chunk.offset) {
          offset = parseInt(chunk.offset, 10);
        }
      });

      stream.on('error', (error: grpc.ServiceError) => {
        reject(new GrpcError(error));
      });

      stream.on('end', () => {
        resolve({ contracts, offset });
      });
    });
  }

  // ==================== Helper Methods ====================

  /** Convert Commands to wire format. */
  private convertCommands(commands: Commands): unknown {
    return {
      workflowId: commands.workflowId,
      userId: commands.userId,
      commandId: commands.commandId,
      commands: commands.commands.map((cmd) => this.convertCommand(cmd)),
      actAs: commands.actAs,
      readAs: commands.readAs,
      submissionId: commands.submissionId,
      synchronizerId: commands.synchronizerId,
      deduplicationDuration: commands.deduplicationDuration,
      deduplicationOffset: commands.deduplicationOffset,
      minLedgerTimeAbs: commands.minLedgerTimeAbs,
      minLedgerTimeRel: commands.minLedgerTimeRel,
      disclosedContracts: commands.disclosedContracts,
      packageIdSelectionPreference: commands.packageIdSelectionPreference,
      prefetchContractKeys: commands.prefetchContractKeys,
    };
  }

  /** Convert a single Command to wire format. */
  private convertCommand(command: Command): unknown {
    if (command.create) {
      return {
        create: {
          templateId: this.convertIdentifier(command.create.templateId),
          createArguments: command.create.createArguments,
        },
      };
    }
    if (command.exercise) {
      return {
        exercise: {
          templateId: this.convertIdentifier(command.exercise.templateId),
          contractId: command.exercise.contractId,
          choice: command.exercise.choice,
          choiceArgument: command.exercise.choiceArgument,
        },
      };
    }
    if (command.exerciseByKey) {
      return {
        exerciseByKey: {
          templateId: this.convertIdentifier(command.exerciseByKey.templateId),
          contractKey: command.exerciseByKey.contractKey,
          choice: command.exerciseByKey.choice,
          choiceArgument: command.exerciseByKey.choiceArgument,
        },
      };
    }
    if (command.createAndExercise) {
      return {
        createAndExercise: {
          templateId: this.convertIdentifier(command.createAndExercise.templateId),
          createArguments: command.createAndExercise.createArguments,
          choice: command.createAndExercise.choice,
          choiceArgument: command.createAndExercise.choiceArgument,
        },
      };
    }
    return {};
  }

  /** Convert Identifier to wire format. */
  private convertIdentifier(id: Identifier): unknown {
    return {
      packageId: id.packageId,
      moduleName: id.moduleName,
      entityName: id.entityName,
    };
  }

  /**
   * Close all connections.
   */
  public close(): void {
    for (const client of this.services.values()) {
      client.close();
    }
    this.services.clear();
  }
}
