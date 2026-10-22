import {
  TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID,
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
  const items: AsyncIterable<JsGetActiveContractsResponseItem> = ledgerClient.streamActiveContracts(streamParams);
  for await (const item of items) {
    if ('JsActiveContract' in item.contractEntry) {
      const { contractId } = item.contractEntry.JsActiveContract.createdEvent;
      const id: string = contractId;
      id;
    }
  }

  const snapshot: JsGetActiveContractsResponse = await ledgerClient.getActiveContracts(collectParams);
  snapshot;
}

streamParamsWithOnItem;
