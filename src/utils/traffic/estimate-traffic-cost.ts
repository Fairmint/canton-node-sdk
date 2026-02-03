import { randomUUID } from 'node:crypto';
import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { type InteractiveSubmissionPrepareRequest } from '../../clients/ledger-json-api/schemas/api/interactive-submission';
import { getEstimatedTrafficCost } from './get-estimated-traffic-cost';
import { type TrafficCostEstimate } from './types';

/**
 * Options for estimating traffic cost of commands.
 *
 * This provides a simplified interface compared to the full `interactiveSubmissionPrepare` parameters.
 */
export interface EstimateTrafficCostOptions {
  /** Ledger JSON API client instance. */
  ledgerClient: LedgerJsonApiClient;
  /** Commands to estimate traffic cost for. */
  commands: InteractiveSubmissionPrepareRequest['commands'];
  /** Synchronizer/domain ID where the transaction will be submitted. */
  synchronizerId: string;
  /** Parties to act as. Defaults to the ledger client's configured party. */
  actAs?: string[];
  /** Parties to read as (optional). */
  readAs?: string[];
  /** User ID. Defaults to the ledger client's configured user. */
  userId?: string;
  /** Disclosed contracts (optional). */
  disclosedContracts?: InteractiveSubmissionPrepareRequest['disclosedContracts'];
  /** Package ID selection preference (optional). */
  packageIdSelectionPreference?: InteractiveSubmissionPrepareRequest['packageIdSelectionPreference'];
}

/**
 * Estimates the traffic cost for a set of commands without executing them.
 *
 * This is a convenience function that prepares a transaction (without executing it) to get
 * the traffic cost estimation. Use this when you want to know how much traffic a transaction
 * will consume before actually submitting it.
 *
 * @example
 *   ```typescript
 *   import { Canton, estimateTrafficCost } from '@fairmint/canton-node-sdk';
 *
 *   const canton = new Canton({ network: 'localnet' });
 *
 *   // Estimate the cost of creating a contract
 *   const estimate = await estimateTrafficCost({
 *     ledgerClient: canton.ledger,
 *     commands: [
 *       {
 *         CreateCommand: {
 *           templateId: 'MyModule:MyTemplate',
 *           createArguments: { fields: { owner: { party: 'alice::...' } } },
 *         },
 *       },
 *     ],
 *     synchronizerId: 'global-domain::1234...',
 *   });
 *
 *   if (estimate) {
 *     console.log(`Estimated traffic cost: ${estimate.totalCost} bytes`);
 *     console.log(`  Request: ${estimate.requestCost} bytes`);
 *     console.log(`  Response: ${estimate.responseCost} bytes`);
 *   }
 *   ```
 *
 * @param options - Options for traffic cost estimation.
 * @returns The traffic cost estimate, or `undefined` if cost estimation is not available.
 */
export async function estimateTrafficCost(options: EstimateTrafficCostOptions): Promise<TrafficCostEstimate | undefined> {
  const {
    ledgerClient,
    commands,
    synchronizerId,
    actAs,
    readAs = [],
    userId,
    disclosedContracts,
    packageIdSelectionPreference = [],
  } = options;

  // Resolve defaults from client configuration
  const resolvedUserId = userId ?? ledgerClient.getUserId();
  if (!resolvedUserId) {
    throw new Error('userId is required: provide it in options or configure it on the ledger client');
  }

  const resolvedPartyId = ledgerClient.getPartyId();
  const resolvedActAs = actAs ?? (resolvedPartyId ? [resolvedPartyId] : undefined);
  if (!resolvedActAs || resolvedActAs.length === 0) {
    throw new Error('actAs is required: provide it in options or configure partyId on the ledger client');
  }

  // Generate a temporary command ID for the prepare call
  const commandId = randomUUID();

  // Prepare the transaction to get cost estimation
  const prepared = await ledgerClient.interactiveSubmissionPrepare({
    commands,
    commandId,
    userId: resolvedUserId,
    actAs: resolvedActAs,
    readAs,
    disclosedContracts,
    synchronizerId,
    verboseHashing: false,
    packageIdSelectionPreference,
  });

  // Extract and return the cost estimation
  return getEstimatedTrafficCost(prepared);
}
