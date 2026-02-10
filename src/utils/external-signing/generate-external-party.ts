import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import {
  type GenerateExternalPartyTopologyParams,
  type GenerateExternalPartyTopologyResponse,
} from '../../clients/ledger-json-api/operations/v2/parties/external/generate-topology';

export interface GenerateExternalPartyOptions {
  readonly ledgerClient: LedgerJsonApiClient;
  readonly synchronizerId: string;
  readonly partyHint: string;
  readonly publicKey: GenerateExternalPartyTopologyParams['publicKey'];
  readonly localParticipantObservationOnly?: boolean;
  readonly otherConfirmingParticipantUids?: readonly string[];
  readonly confirmationThreshold?: number;
  readonly observingParticipantUids?: readonly string[];
}

/** Helper that invokes the external party topology generation endpoint. */
export async function generateExternalPartyTopology(
  options: GenerateExternalPartyOptions
): Promise<GenerateExternalPartyTopologyResponse> {
  return options.ledgerClient.generateExternalPartyTopology({
    synchronizer: options.synchronizerId,
    partyHint: options.partyHint,
    publicKey: options.publicKey,
    localParticipantObservationOnly: options.localParticipantObservationOnly ?? false,
    otherConfirmingParticipantUids: options.otherConfirmingParticipantUids
      ? [...options.otherConfirmingParticipantUids]
      : undefined,
    confirmationThreshold: options.confirmationThreshold,
    observingParticipantUids: options.observingParticipantUids ? [...options.observingParticipantUids] : undefined,
  });
}
