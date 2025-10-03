import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';

/** Options for waiting for contract archival */
export interface WaitForContractArchivalOptions {
  /** Maximum time to wait in milliseconds (default: 300000 = 5 minutes) */
  maxWaitTimeMs?: number;
  /** Interval between checks in milliseconds (default: 5000 = 5 seconds) */
  checkIntervalMs?: number;
  /** Whether to enable verbose logging */
  verbose?: boolean;
}

/**
 * Waits for a contract to be archived by periodically checking active contracts
 *
 * @param ledgerJsonApiClient - The Ledger JSON API client instance
 * @param contractId - The ID of the contract to monitor
 * @param options - Configuration options for the wait operation
 * @returns Promise that resolves when the contract is archived or rejects on timeout
 * @throws Error if the contract is not archived within the specified timeout
 */
export async function waitForContractToBeArchived(
  ledgerJsonApiClient: LedgerJsonApiClient,
  contractId: string,
  options: WaitForContractArchivalOptions = {}
): Promise<void> {
  const {
    maxWaitTimeMs = 300000, // 5 minutes default
    checkIntervalMs = 5000, // 5 seconds default
    verbose = true,
  } = options;

  const startTime = Date.now();

  if (verbose) {
  }

  while (Date.now() - startTime < maxWaitTimeMs) {
    try {
      // Get active contracts to check if our contract is still active
      const partyId = ledgerJsonApiClient.getPartyId();
      if (!partyId) {
        throw new Error('Party ID is not configured on the ledger client');
      }
      const activeContracts = await ledgerJsonApiClient.getActiveContracts({
        parties: [partyId],
      });

      // Check if our contract is still in the active contracts list
      const isStillActive =
        Array.isArray(activeContracts) &&
        activeContracts.some((contract) => {
          if ('JsActiveContract' in contract.contractEntry) {
            const { createdEvent } = contract.contractEntry.JsActiveContract;
            return createdEvent?.contractId === contractId;
          }
          return false;
        });

      if (!isStillActive) {
        if (verbose) {
        }
        return;
      }

      if (verbose) {
      }
      await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
    } catch {
      // Continue waiting even if there's an error checking status
      await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
    }
  }

  throw new Error(`Timeout waiting for contract ${contractId} to be archived after ${maxWaitTimeMs / 1000} seconds`);
}
