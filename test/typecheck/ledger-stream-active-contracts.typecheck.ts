import {
  TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID,
  type ActiveContractsStream,
  type GetActiveContractsParams,
  type JsGetActiveContractsResponse,
  type JsGetActiveContractsResponseItem,
  type LedgerJsonApiClient,
  type StreamActiveContractsParams,
} from '../../src';

declare const ledgerClient: LedgerJsonApiClient;

const streamParams: StreamActiveContractsParams = {
  parties: ['Alice'],
  interfaceIds: [TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID],
  includeInterfaceView: true,
  includeCreatedEventBlob: true,
  activeAtOffset: 42,
  idleTimeoutMs: 0,
};

const streamParamsWithOnItem: StreamActiveContractsParams = {
  parties: ['Alice'],
  // @ts-expect-error the stream yields items rather than calling back with them.
  onItem: () => undefined,
};

// The collecting read keeps its callback and accepts the same filters.
const collectParams: GetActiveContractsParams = {
  ...streamParams,
  onItem: (item: JsGetActiveContractsResponseItem): void => {
    item.contractEntry;
  },
};

export async function typecheckStreamActiveContracts(): Promise<void> {
  const stream: ActiveContractsStream = ledgerClient.streamActiveContracts(streamParams);
  const items: AsyncIterable<JsGetActiveContractsResponseItem> = stream;
  for await (const item of items) {
    if ('JsActiveContract' in item.contractEntry) {
      const { contractId } = item.contractEntry.JsActiveContract.createdEvent;
      const id: string = contractId;
      id;
    }
  }
  // The offset is known once iteration has started, so it may be undefined.
  const { activeAtOffset }: { readonly activeAtOffset: number | undefined } = stream;
  // @ts-expect-error the offset is read-only.
  stream.activeAtOffset = 7;
  if (activeAtOffset !== undefined) {
    await ledgerClient.subscribeToUpdates({
      parties: ['Alice'],
      beginExclusive: activeAtOffset,
      onMessage: () => undefined,
    });
  }

  const snapshot: JsGetActiveContractsResponse = await ledgerClient.getActiveContracts(collectParams);
  snapshot;
}

streamParamsWithOnItem;
