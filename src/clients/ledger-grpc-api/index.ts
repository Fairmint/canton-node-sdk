/**
 * Ledger gRPC API Client
 *
 * Provides direct gRPC access to the Canton Ledger API for high-performance scenarios.
 *
 * @module
 * @example
 *   ```typescript
 *   import { LedgerGrpcClient, Values, createCreateCommand } from '@fairmint/canton-node-sdk/ledger-grpc-api';
 *
 *   const client = new LedgerGrpcClient({
 *   endpoint: 'localhost:6865',
 *   accessToken: 'your-token',
 *   });
 *
 *   // Get version
 *   const version = await client.getVersion();
 *   console.log(`Ledger API version: ${version.version}`);
 *
 *   // Submit a command
 *   const result = await client.submitAndWait({
 *   userId: 'alice',
 *   commandId: crypto.randomUUID(),
 *   actAs: ['Alice::1234'],
 *   commands: [
 *   createCreateCommand(
 *   { packageId: 'pkg', moduleName: 'Main', entityName: 'Asset' },
 *   { fields: [{ label: 'owner', value: Values.party('Alice::1234') }] }
 *   ),
 *   ],
 *   });
 *   ```
 *
 * @see https://docs.digitalasset.com/build/3.4/reference/lapi-proto-docs.html
 */

// Client
export { LedgerGrpcClient } from './LedgerGrpcClient';
export type {
  CumulativeFilter,
  GetActiveContractsOptions,
  GetUpdatesRequest,
  InterfaceFilter,
  LedgerApiVersion,
  PartyFilter,
  SubmitAndWaitForTransactionResponse,
  SubmitAndWaitResponse,
  TemplateFilter,
  TransactionFilter,
  WildcardFilter,
} from './LedgerGrpcClient';

// Types
export * from './types';

// Services
export { GrpcClientConfig, GrpcError, GrpcServiceClient } from './services/base';
