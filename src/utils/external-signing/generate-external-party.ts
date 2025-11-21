import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import {
  type GenerateExternalPartyTopologyParams,
  type GenerateExternalPartyTopologyResponse,
} from '../../clients/ledger-json-api/operations/v2/parties/external/generate-topology';

export interface GenerateExternalPartyOptions {
  ledgerClient: LedgerJsonApiClient;
  synchronizerId: string;
  partyHint: string;
  publicKey: GenerateExternalPartyTopologyParams['publicKey'];
  localParticipantObservationOnly?: boolean;
  otherConfirmingParticipantUids?: string[];
  confirmationThreshold?: number;
  observingParticipantUids?: string[];
}

/** Helper that invokes the external party topology generation endpoint. */
// eslint-disable-next-line @typescript-eslint/require-await -- Async signature maintained for API consistency
export async function generateExternalPartyTopology(
  options: GenerateExternalPartyOptions
): Promise<GenerateExternalPartyTopologyResponse> {
  return options.ledgerClient.generateExternalPartyTopology({
    synchronizer: options.synchronizerId,
    partyHint: options.partyHint,
    publicKey: options.publicKey,
    localParticipantObservationOnly: options.localParticipantObservationOnly ?? false,
    otherConfirmingParticipantUids: options.otherConfirmingParticipantUids,
    confirmationThreshold: options.confirmationThreshold,
    observingParticipantUids: options.observingParticipantUids,
  });
}
