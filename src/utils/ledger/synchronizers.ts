import { type LedgerJsonApiClient } from '../../clients';

/** Ids of the synchronizers `party` is currently connected to. */
export async function getConnectedSynchronizerIds(client: LedgerJsonApiClient, party: string): Promise<string[]> {
  const { connectedSynchronizers } = await client.getConnectedSynchronizers({ party });
  return (connectedSynchronizers ?? []).map((s) => s.synchronizerId);
}
