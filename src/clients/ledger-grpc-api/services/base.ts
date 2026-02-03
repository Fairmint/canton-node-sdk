/** Base gRPC client infrastructure for the Ledger API. */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';

/** Configuration for the gRPC client. */
export interface GrpcClientConfig {
  /** The gRPC endpoint (host:port). */
  endpoint: string;
  /** Use TLS for the connection. */
  useTls?: boolean;
  /** Path to CA certificate for TLS. */
  caCertPath?: string;
  /** Path to client certificate for mTLS. */
  clientCertPath?: string;
  /** Path to client key for mTLS. */
  clientKeyPath?: string;
  /** OAuth2 access token for authentication. */
  accessToken?: string;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
}

/** Default proto loader options. */
const PROTO_LOADER_OPTIONS: protoLoader.Options = {
  keepCase: false, // Convert to camelCase
  longs: String, // Use strings for int64 to preserve precision
  enums: String, // Use strings for enums
  defaults: true, // Include default values
  oneofs: true, // Include oneof fields
};

/** Base path to the Ledger API proto files. */
const PROTO_BASE_PATH = path.resolve(
  __dirname,
  '../../../../libs/splice/canton/community/ledger-api/src/main/protobuf'
);

/** Base class for gRPC service clients. */
export abstract class GrpcServiceClient {
  protected channel: grpc.Channel | null = null;
  protected credentials: grpc.ChannelCredentials;
  protected metadata: grpc.Metadata;
  protected config: GrpcClientConfig;

  constructor(config: GrpcClientConfig) {
    this.config = config;
    this.credentials = this.createCredentials();
    this.metadata = this.createMetadata();
  }

  /** Create gRPC credentials based on config. */
  private createCredentials(): grpc.ChannelCredentials {
    if (!this.config.useTls) {
      return grpc.credentials.createInsecure();
    }

    // For TLS without client certs
    if (!this.config.clientCertPath) {
      return grpc.credentials.createSsl();
    }

    // For mTLS with client certs
    // In a real implementation, we'd read the cert files here
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

  /** Update the access token (for token refresh). */
  public updateAccessToken(token: string): void {
    this.config.accessToken = token;
    this.metadata = this.createMetadata();
  }

  /** Get the gRPC endpoint. */
  protected get endpoint(): string {
    return this.config.endpoint;
  }

  /** Get the configured timeout. */
  protected get timeoutMs(): number {
    return this.config.timeoutMs ?? 30000;
  }

  /** Create a deadline for the request. */
  protected createDeadline(): grpc.Deadline {
    return Date.now() + this.timeoutMs;
  }

  /** Close the client connection. */
  public close(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
  }
}

/** Load a proto file and return the package definition. */
export async function loadProtoFile(protoFile: string): Promise<grpc.GrpcObject> {
  const protoPath = path.join(PROTO_BASE_PATH, protoFile);

  const packageDefinition = await protoLoader.load(protoPath, {
    ...PROTO_LOADER_OPTIONS,
    includeDirs: [PROTO_BASE_PATH, path.join(PROTO_BASE_PATH, '../../../../../../..')],
  });

  return grpc.loadPackageDefinition(packageDefinition);
}

/** Create a gRPC client for a service. */
export function createGrpcClient<T>(
  ServiceClass: grpc.ServiceClientConstructor,
  endpoint: string,
  credentials: grpc.ChannelCredentials
): T {
  return new ServiceClass(endpoint, credentials) as T;
}

/** Wrap a gRPC unary call in a Promise. */
export async function promisifyUnaryCall<TRequest, TResponse>(
  client: grpc.Client,
  method: (
    request: TRequest,
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: (error: grpc.ServiceError | null, response: TResponse) => void
  ) => grpc.ClientUnaryCall,
  request: TRequest,
  metadata: grpc.Metadata,
  deadline: grpc.Deadline
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    method.call(client, request, metadata, { deadline }, (error, response) => {
      if (error) {
        reject(error);
      } else {
        resolve(response);
      }
    });
  });
}

/** Convert gRPC error to a more friendly error. */
export class GrpcError extends Error {
  public readonly code: grpc.status;
  public readonly details: string;
  public readonly metadata?: grpc.Metadata;

  constructor(error: grpc.ServiceError) {
    super(`gRPC error ${error.code}: ${error.message}`);
    this.name = 'GrpcError';
    this.code = error.code;
    this.details = error.details;
    this.metadata = error.metadata;
  }
}

/** Wrap a gRPC call and convert errors. */
export async function wrapGrpcCall<T>(call: Promise<T>): Promise<T> {
  try {
    return await call;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      throw new GrpcError(error as grpc.ServiceError);
    }
    throw error;
  }
}
