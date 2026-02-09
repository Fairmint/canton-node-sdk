import { type ScanApiClient } from '../../clients/scan-api';
import { type ValidatorApiClient } from '../../clients/validator-api';
import { type TrafficStatus } from './types';

/** Options for retrieving traffic status. */
export interface GetTrafficStatusOptions {
  /** Domain/synchronizer ID. If not provided, uses the current mining round domain. */
  readonly domainId?: string;
  /** Party ID to look up. Required when using ScanApiClient. */
  readonly partyId?: string;
  /** Member/participant ID. If not provided, resolved from partyId. */
  readonly memberId?: string;
}

/**
 * Type guard to check if client is a ScanApiClient.
 *
 * ScanApiClient has getPartyToParticipant which ValidatorApiClient doesn't have.
 */
function isScanApiClient(client: ValidatorApiClient | ScanApiClient): client is ScanApiClient {
  return 'getPartyToParticipant' in client && typeof client.getPartyToParticipant === 'function';
}

/**
 * Gets the current traffic status for a party using the Validator API.
 *
 * The Validator API provides authenticated access to traffic status with automatic domain/party resolution.
 *
 * @example
 *   ```typescript
 *   const validatorClient = new ValidatorApiClient({ ... });
 *
 *   // Get traffic status for the configured party
 *   const status = await getTrafficStatus(validatorClient);
 *   console.log(`Consumed: ${status.consumed}, Limit: ${status.limit}`);
 *
 *   // Get traffic status for a specific member
 *   const status = await getTrafficStatus(validatorClient, {
 *   domainId: 'global-domain::1234...',
 *   memberId: 'PAR::party-id::fingerprint',
 *   });
 *   ```;
 */
export async function getTrafficStatus(
  client: ValidatorApiClient,
  options?: GetTrafficStatusOptions
): Promise<TrafficStatus>;

/**
 * Gets the current traffic status for a party using the Scan API.
 *
 * The Scan API is public (unauthenticated) but requires explicit domainId and partyId.
 *
 * @example
 *   ```typescript
 *   const scanClient = new ScanApiClient({ network: 'mainnet' });
 *
 *   // Get traffic status for a specific party
 *   const status = await getTrafficStatus(scanClient, {
 *   domainId: 'global-domain::1234...',
 *   partyId: 'party-id::fingerprint',
 *   });
 *   console.log(`Consumed: ${status.consumed}, Purchased: ${status.purchased}`);
 *   ```;
 */
export async function getTrafficStatus(
  client: ScanApiClient,
  options: GetTrafficStatusOptions & { domainId: string; partyId: string }
): Promise<TrafficStatus>;

/** Implementation for both client types. */
export async function getTrafficStatus(
  client: ValidatorApiClient | ScanApiClient,
  options: GetTrafficStatusOptions = {}
): Promise<TrafficStatus> {
  if (isScanApiClient(client)) {
    // ScanApiClient - requires explicit parameters
    const { domainId, partyId } = options;

    if (!domainId || !partyId) {
      throw new Error('ScanApiClient requires both domainId and partyId');
    }

    // First resolve partyId to participantId
    const participantLookup = await client.getPartyToParticipant({ domainId, partyId });
    const memberId = options.memberId ?? participantLookup.participant_id;

    const response = await client.getMemberTrafficStatus({ domainId, memberId });

    return {
      consumed: response.traffic_status.actual.total_consumed,
      limit: response.traffic_status.actual.total_limit,
      purchased: response.traffic_status.target.total_purchased,
    };
  }

  // ValidatorApiClient - supports auto-resolution
  const response = await client.getMemberTrafficStatus({
    domainId: options.domainId,
    memberId: options.memberId,
  });

  return {
    consumed: response.traffic_status.actual.total_consumed,
    limit: response.traffic_status.actual.total_limit,
    purchased: response.traffic_status.target.total_purchased,
  };
}
